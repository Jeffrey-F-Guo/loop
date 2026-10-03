package store_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/domain"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/store"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/testdb"
)

var (
	ctx   = context.Background()
	userA = uuid.MustParse("aaaaaaaa-0000-0000-0000-000000000001")
	userB = uuid.MustParse("bbbbbbbb-0000-0000-0000-000000000002")
	t0    = time.Date(2026, 10, 6, 16, 0, 0, 0, time.UTC)
)

func newStore(t *testing.T) *store.Store { return store.New(testdb.New(t)) }

func mustItem(t *testing.T, s *store.Store, user uuid.UUID, title string) domain.Item {
	t.Helper()
	it, err := s.CreateItem(ctx, user, domain.NewItem{Title: title})
	if err != nil {
		t.Fatal(err)
	}
	return it
}

func mustBlock(t *testing.T, s *store.Store, user, item uuid.UUID, start time.Time, d time.Duration) domain.WorkBlock {
	t.Helper()
	b, err := s.CreateWorkBlock(ctx, user, domain.NewWorkBlock{ItemID: item, StartAt: start, EndAt: start.Add(d)})
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func ids(items []domain.Item) []string {
	out := make([]string, len(items))
	for i, it := range items {
		out[i] = it.Title
	}
	return out
}

func TestItemCRUDAndOwnership(t *testing.T) {
	s := newStore(t)
	it := mustItem(t, s, userA, "Physics")
	if it.Status != domain.StatusActive || it.WorkBlockCount != 0 || it.CreatedAt.Location() != time.UTC {
		t.Fatalf("unexpected created item %+v", it)
	}
	if _, err := s.GetItem(ctx, userB, it.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("other user read: want ErrNotFound, got %v", err)
	}
	if err := s.DeleteItem(ctx, userB, it.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("other user delete: want ErrNotFound, got %v", err)
	}
	if _, err := s.GetItem(ctx, userA, it.ID); err != nil {
		t.Fatalf("owner read after foreign delete: %v", err)
	}
}

func TestListItemsFilters(t *testing.T) {
	s := newStore(t)
	unscheduled := mustItem(t, s, userA, "unscheduled")
	scheduled := mustItem(t, s, userA, "scheduled")
	done := mustItem(t, s, userA, "done")
	mustItem(t, s, userB, "someone else")
	mustBlock(t, s, userA, scheduled.ID, t0, time.Hour)
	if _, err := s.UpdateItem(ctx, userA, done.ID, func(it domain.Item) (domain.Item, error) {
		return domain.ApplyItemPatch(it, domain.ItemPatch{Status: domain.Some(domain.StatusCompleted)}, t0)
	}); err != nil {
		t.Fatal(err)
	}
	_ = unscheduled

	active, completed := domain.StatusActive, domain.StatusCompleted
	yes, no := true, false
	cases := []struct {
		name string
		f    store.ItemFilter
		want []string
	}{
		{"all", store.ItemFilter{}, []string{"done", "scheduled", "unscheduled"}},
		{"active", store.ItemFilter{Status: &active}, []string{"scheduled", "unscheduled"}},
		{"completed", store.ItemFilter{Status: &completed}, []string{"done"}},
		{"active scheduled", store.ItemFilter{Status: &active, Scheduled: &yes}, []string{"scheduled"}},
		{"active unscheduled", store.ItemFilter{Status: &active, Scheduled: &no}, []string{"unscheduled"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := s.ListItems(ctx, userA, tc.f)
			if err != nil {
				t.Fatal(err)
			}
			if g := ids(got); len(g) != len(tc.want) || func() bool {
				for i := range g {
					if g[i] != tc.want[i] {
						return true
					}
				}
				return false
			}() {
				t.Fatalf("got %v, want %v (newest first)", g, tc.want)
			}
		})
	}

	empty, err := s.ListItems(ctx, uuid.New(), store.ItemFilter{})
	if err != nil || empty == nil || len(empty) != 0 {
		t.Fatalf("empty list must be non-nil and empty, got %#v, %v", empty, err)
	}
}

func TestUpdateItemApplyErrorPersistsNothing(t *testing.T) {
	s := newStore(t)
	it := mustItem(t, s, userA, "Physics")
	boom := errors.New("boom")
	_, err := s.UpdateItem(ctx, userA, it.ID, func(cur domain.Item) (domain.Item, error) {
		cur.Title = "changed"
		return cur, boom
	})
	if !errors.Is(err, boom) {
		t.Fatalf("want boom, got %v", err)
	}
	got, _ := s.GetItem(ctx, userA, it.ID)
	if got.Title != "Physics" {
		t.Fatalf("title changed to %q", got.Title)
	}
}

func TestWorkBlocks(t *testing.T) {
	s := newStore(t)
	it := mustItem(t, s, userA, "Physics")
	other := mustItem(t, s, userB, "theirs")

	if _, err := s.CreateWorkBlock(ctx, userA, domain.NewWorkBlock{ItemID: other.ID, StartAt: t0, EndAt: t0.Add(time.Hour)}); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("block on foreign item: want ErrNotFound, got %v", err)
	}

	b9 := mustBlock(t, s, userA, it.ID, t0, time.Hour)                 // 16:00-17:00
	b10 := mustBlock(t, s, userA, it.ID, t0.Add(time.Hour), time.Hour) // 17:00-18:00
	mustBlock(t, s, userA, it.ID, t0.Add(2*time.Hour), time.Hour)      // 18:00-19:00
	_ = b9

	start, end := t0.Add(time.Hour), t0.Add(2*time.Hour)
	got, err := s.ListWorkBlocks(ctx, userA, store.BlockFilter{Start: &start, End: &end})
	if err != nil || len(got) != 1 || got[0].ID != b10.ID {
		t.Fatalf("range [17,18) should return only the 17:00 block, got %+v, %v", got, err)
	}

	withCount, _ := s.GetItem(ctx, userA, it.ID)
	if withCount.WorkBlockCount != 3 {
		t.Fatalf("work_block_count = %d, want 3", withCount.WorkBlockCount)
	}

	if err := s.DeleteItem(ctx, userA, it.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetWorkBlock(ctx, userA, b10.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("blocks must cascade on item delete, got %v", err)
	}
}

func TestWorkspace(t *testing.T) {
	s := newStore(t)
	first, err := s.GetOrCreateWorkspace(ctx, userA, domain.DefaultLayout())
	if err != nil {
		t.Fatal(err)
	}
	var a, b any
	_ = json.Unmarshal(first.Layout, &a)
	_ = json.Unmarshal(domain.DefaultLayout(), &b)
	if ja, jb := mustJSON(a), mustJSON(b); ja != jb {
		t.Fatalf("default layout not stored:\n%s\n%s", ja, jb)
	}

	next := json.RawMessage(`{"version":1,"root":null}`)
	put, err := s.PutWorkspace(ctx, userA, next)
	if err != nil || put.UpdatedAt.Location() != time.UTC {
		t.Fatalf("put: %+v, %v", put, err)
	}
	again, _ := s.GetOrCreateWorkspace(ctx, userA, domain.DefaultLayout())
	if mustJSON(decode(again.Layout)) != mustJSON(decode(next)) {
		t.Fatalf("GetOrCreate must not overwrite an existing layout, got %s", again.Layout)
	}
}

func decode(raw json.RawMessage) any { var v any; _ = json.Unmarshal(raw, &v); return v }
func mustJSON(v any) string          { b, _ := json.Marshal(v); return string(b) }
