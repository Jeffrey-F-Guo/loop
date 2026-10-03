// Package store maps domain operations onto Postgres. Every query is scoped
// by user_id; rows owned by another user are indistinguishable from missing.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/domain"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/store/db"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

type ItemFilter struct {
	Status    *domain.ItemStatus
	Scheduled *bool
}

type BlockFilter struct {
	ItemID     *uuid.UUID
	Start, End *time.Time
}

func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool, q: db.New(pool)} }

func mapErr(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23503" { // FK violation: item vanished
		return ErrNotFound
	}
	return err
}

func utc(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := t.UTC()
	return &u
}

// blockStats is what an item row carries about its work blocks.
type blockStats struct{ count, minutes int32 }

func itemFrom(i db.Item, st blockStats) domain.Item {
	return domain.Item{
		ID: i.ID, UserID: i.UserID, Title: i.Title, Description: i.Description,
		OpenAt: utc(i.OpenAt), DeadlineAt: utc(i.DeadlineAt),
		Status: domain.ItemStatus(i.Status), WorkBlockCount: int(st.count),
		ScheduledMinutes: int(st.minutes),
		CreatedAt:        i.CreatedAt.UTC(), UpdatedAt: i.UpdatedAt.UTC(), CompletedAt: utc(i.CompletedAt),
	}
}

func blockFrom(b db.WorkBlock) domain.WorkBlock {
	return domain.WorkBlock{
		ID: b.ID, UserID: b.UserID, ItemID: b.ItemID,
		StartAt: b.StartAt.UTC(), EndAt: b.EndAt.UTC(),
		CreatedAt: b.CreatedAt.UTC(), UpdatedAt: b.UpdatedAt.UTC(),
	}
}

func (s *Store) CreateItem(ctx context.Context, userID uuid.UUID, n domain.NewItem) (domain.Item, error) {
	row, err := s.q.CreateItem(ctx, db.CreateItemParams{
		UserID: userID, Title: n.Title, Description: n.Description, OpenAt: n.OpenAt, DeadlineAt: n.DeadlineAt,
	})
	if err != nil {
		return domain.Item{}, mapErr(err)
	}
	return itemFrom(row, blockStats{}), nil
}

func (s *Store) GetItem(ctx context.Context, userID, id uuid.UUID) (domain.Item, error) {
	r, err := s.q.GetItem(ctx, db.GetItemParams{ID: id, UserID: userID})
	if err != nil {
		return domain.Item{}, mapErr(err)
	}
	return itemFrom(db.Item{
		ID: r.ID, UserID: r.UserID, Title: r.Title, Description: r.Description, OpenAt: r.OpenAt,
		DeadlineAt: r.DeadlineAt, Status: r.Status, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
		CompletedAt: r.CompletedAt,
	}, blockStats{r.WorkBlockCount, r.ScheduledMinutes}), nil
}

func (s *Store) ListItems(ctx context.Context, userID uuid.UUID, f ItemFilter) ([]domain.Item, error) {
	var status *string
	if f.Status != nil {
		v := string(*f.Status)
		status = &v
	}
	rows, err := s.q.ListItems(ctx, db.ListItemsParams{UserID: userID, Status: status, Scheduled: f.Scheduled})
	if err != nil {
		return nil, mapErr(err)
	}
	out := make([]domain.Item, 0, len(rows))
	for _, r := range rows {
		out = append(out, itemFrom(db.Item{
			ID: r.ID, UserID: r.UserID, Title: r.Title, Description: r.Description, OpenAt: r.OpenAt,
			DeadlineAt: r.DeadlineAt, Status: r.Status, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
			CompletedAt: r.CompletedAt,
		}, blockStats{r.WorkBlockCount, r.ScheduledMinutes}))
	}
	return out, nil
}

// UpdateItem locks the row, applies the caller's change (which validates the
// merged result), and writes it back in one transaction.
func (s *Store) UpdateItem(ctx context.Context, userID, id uuid.UUID, apply func(domain.Item) (domain.Item, error)) (domain.Item, error) {
	return s.UpdateItemAndBlocks(ctx, userID, id, func(it domain.Item, blocks []domain.WorkBlock) (domain.Item, []domain.WorkBlock, error) {
		next, err := apply(it)
		return next, blocks, err
	})
}

// UpdateItemAndBlocks locks the item and all of its work blocks, lets the caller
// change both (validating them together), and writes every changed row back in
// one transaction. Blocks returned by apply must be the ones it was given.
func (s *Store) UpdateItemAndBlocks(ctx context.Context, userID, id uuid.UUID, apply func(domain.Item, []domain.WorkBlock) (domain.Item, []domain.WorkBlock, error)) (domain.Item, error) {
	var out domain.Item
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.q.WithTx(tx)
		cur, err := q.LockItem(ctx, db.LockItemParams{ID: id, UserID: userID})
		if err != nil {
			return mapErr(err)
		}
		rows, err := q.LockItemWorkBlocks(ctx, db.LockItemWorkBlocksParams{ItemID: id, UserID: userID})
		if err != nil {
			return err
		}
		blocks := make([]domain.WorkBlock, len(rows))
		for i, r := range rows {
			blocks[i] = blockFrom(r)
		}
		next, nextBlocks, err := apply(itemFrom(cur, blockStats{}), blocks)
		if err != nil {
			return err
		}
		for i, b := range nextBlocks {
			if b.StartAt.Equal(blocks[i].StartAt) && b.EndAt.Equal(blocks[i].EndAt) {
				continue
			}
			if _, err := q.UpdateWorkBlock(ctx, db.UpdateWorkBlockParams{ID: b.ID, UserID: userID, StartAt: b.StartAt, EndAt: b.EndAt}); err != nil {
				return mapErr(err)
			}
		}
		row, err := q.UpdateItem(ctx, db.UpdateItemParams{
			ID: id, UserID: userID, Title: next.Title, Description: next.Description,
			OpenAt: next.OpenAt, DeadlineAt: next.DeadlineAt, Status: string(next.Status), CompletedAt: next.CompletedAt,
		})
		if err != nil {
			return mapErr(err)
		}
		st, err := q.ItemBlockStats(ctx, id)
		if err != nil {
			return err
		}
		out = itemFrom(row, blockStats{st.WorkBlockCount, st.ScheduledMinutes})
		return nil
	})
	return out, err
}

// UnscheduleItem takes an item off the plan: it deletes all of the item's work
// blocks and clears its open and deadline dates, in one transaction.
func (s *Store) UnscheduleItem(ctx context.Context, userID, id uuid.UUID) (domain.Item, error) {
	var out domain.Item
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.q.WithTx(tx)
		cur, err := q.LockItem(ctx, db.LockItemParams{ID: id, UserID: userID})
		if err != nil {
			return mapErr(err)
		}
		if err := q.DeleteItemWorkBlocks(ctx, db.DeleteItemWorkBlocksParams{ItemID: id, UserID: userID}); err != nil {
			return err
		}
		row, err := q.UpdateItem(ctx, db.UpdateItemParams{
			ID: id, UserID: userID, Title: cur.Title, Description: cur.Description,
			Status: cur.Status, CompletedAt: cur.CompletedAt,
		})
		if err != nil {
			return mapErr(err)
		}
		out = itemFrom(row, blockStats{})
		return nil
	})
	return out, err
}

func (s *Store) DeleteItem(ctx context.Context, userID, id uuid.UUID) error {
	n, err := s.q.DeleteItem(ctx, db.DeleteItemParams{ID: id, UserID: userID})
	if err != nil {
		return mapErr(err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) CreateWorkBlock(ctx context.Context, userID uuid.UUID, n domain.NewWorkBlock) (domain.WorkBlock, error) {
	ok, err := s.q.ItemExists(ctx, db.ItemExistsParams{ID: n.ItemID, UserID: userID})
	if err != nil {
		return domain.WorkBlock{}, mapErr(err)
	}
	if !ok {
		return domain.WorkBlock{}, ErrNotFound
	}
	row, err := s.q.CreateWorkBlock(ctx, db.CreateWorkBlockParams{UserID: userID, ItemID: n.ItemID, StartAt: n.StartAt, EndAt: n.EndAt})
	if err != nil {
		return domain.WorkBlock{}, mapErr(err)
	}
	return blockFrom(row), nil
}

func (s *Store) GetWorkBlock(ctx context.Context, userID, id uuid.UUID) (domain.WorkBlock, error) {
	row, err := s.q.GetWorkBlock(ctx, db.GetWorkBlockParams{ID: id, UserID: userID})
	if err != nil {
		return domain.WorkBlock{}, mapErr(err)
	}
	return blockFrom(row), nil
}

func (s *Store) ListWorkBlocks(ctx context.Context, userID uuid.UUID, f BlockFilter) ([]domain.WorkBlock, error) {
	rows, err := s.q.ListWorkBlocks(ctx, db.ListWorkBlocksParams{UserID: userID, ItemID: f.ItemID, RangeStart: f.Start, RangeEnd: f.End})
	if err != nil {
		return nil, mapErr(err)
	}
	out := make([]domain.WorkBlock, 0, len(rows))
	for _, r := range rows {
		out = append(out, blockFrom(r))
	}
	return out, nil
}

func (s *Store) UpdateWorkBlock(ctx context.Context, userID, id uuid.UUID, apply func(domain.WorkBlock) (domain.WorkBlock, error)) (domain.WorkBlock, error) {
	var out domain.WorkBlock
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.q.WithTx(tx)
		cur, err := q.LockWorkBlock(ctx, db.LockWorkBlockParams{ID: id, UserID: userID})
		if err != nil {
			return mapErr(err)
		}
		next, err := apply(blockFrom(cur))
		if err != nil {
			return err
		}
		row, err := q.UpdateWorkBlock(ctx, db.UpdateWorkBlockParams{ID: id, UserID: userID, StartAt: next.StartAt, EndAt: next.EndAt})
		if err != nil {
			return mapErr(err)
		}
		out = blockFrom(row)
		return nil
	})
	return out, err
}

func (s *Store) DeleteWorkBlock(ctx context.Context, userID, id uuid.UUID) error {
	n, err := s.q.DeleteWorkBlock(ctx, db.DeleteWorkBlockParams{ID: id, UserID: userID})
	if err != nil {
		return mapErr(err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) GetOrCreateWorkspace(ctx context.Context, userID uuid.UUID, def json.RawMessage) (domain.Workspace, error) {
	if err := s.q.InsertWorkspaceIfMissing(ctx, db.InsertWorkspaceIfMissingParams{UserID: userID, Layout: def}); err != nil {
		return domain.Workspace{}, mapErr(err)
	}
	row, err := s.q.GetWorkspace(ctx, userID)
	if err != nil {
		return domain.Workspace{}, mapErr(err)
	}
	return domain.Workspace{Layout: row.Layout, UpdatedAt: row.UpdatedAt.UTC()}, nil
}

func (s *Store) PutWorkspace(ctx context.Context, userID uuid.UUID, layout json.RawMessage) (domain.Workspace, error) {
	row, err := s.q.UpsertWorkspace(ctx, db.UpsertWorkspaceParams{UserID: userID, Layout: layout})
	if err != nil {
		return domain.Workspace{}, mapErr(err)
	}
	return domain.Workspace{Layout: row.Layout, UpdatedAt: row.UpdatedAt.UTC()}, nil
}
