package domain

import (
	"time"

	"github.com/google/uuid"
)

const MinBlockDuration = 15 * time.Minute

type WorkBlock struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"-"`
	ItemID    uuid.UUID `json:"item_id"`
	StartAt   time.Time `json:"start_at"`
	EndAt     time.Time `json:"end_at"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type NewWorkBlock struct {
	ItemID  uuid.UUID `json:"item_id"`
	StartAt time.Time `json:"start_at"`
	EndAt   time.Time `json:"end_at"`
}

type WorkBlockPatch struct {
	StartAt Opt[time.Time] `json:"start_at"`
	EndAt   Opt[time.Time] `json:"end_at"`
}

func validateBlockTimes(start, end time.Time) error {
	if start.IsZero() {
		return invalid("start_at", "start_at is required")
	}
	if end.IsZero() {
		return invalid("end_at", "end_at is required")
	}
	if end.Sub(start) < MinBlockDuration {
		return invalid("end_at", "work block must be at least 15 minutes long")
	}
	return nil
}

func (n NewWorkBlock) Validate() (NewWorkBlock, error) {
	if n.ItemID == uuid.Nil {
		return n, invalid("item_id", "item_id is required")
	}
	n.StartAt = n.StartAt.UTC()
	n.EndAt = n.EndAt.UTC()
	return n, validateBlockTimes(n.StartAt, n.EndAt)
}

func ApplyWorkBlockPatch(b WorkBlock, p WorkBlockPatch) (WorkBlock, error) {
	if p.StartAt.Set {
		if p.StartAt.Null {
			return b, invalid("start_at", "start_at is required")
		}
		b.StartAt = p.StartAt.Value.UTC()
	}
	if p.EndAt.Set {
		if p.EndAt.Null {
			return b, invalid("end_at", "end_at is required")
		}
		b.EndAt = p.EndAt.Value.UTC()
	}
	return b, validateBlockTimes(b.StartAt, b.EndAt)
}
