package domain

import (
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

const MaxTitleLength = 500

type ItemStatus string

const (
	StatusActive    ItemStatus = "active"
	StatusCompleted ItemStatus = "completed"
)

type Item struct {
	ID             uuid.UUID  `json:"id"`
	UserID         uuid.UUID  `json:"-"`
	Title          string     `json:"title"`
	Description    *string    `json:"description"`
	OpenAt         *time.Time `json:"open_at"`
	DeadlineAt     *time.Time `json:"deadline_at"`
	Status         ItemStatus `json:"status"`
	WorkBlockCount int        `json:"work_block_count"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	CompletedAt    *time.Time `json:"completed_at"`
}

type NewItem struct {
	Title       string     `json:"title"`
	Description *string    `json:"description"`
	OpenAt      *time.Time `json:"open_at"`
	DeadlineAt  *time.Time `json:"deadline_at"`
}

type ItemPatch struct {
	Title       Opt[string]     `json:"title"`
	Description Opt[string]     `json:"description"`
	OpenAt      Opt[time.Time]  `json:"open_at"`
	DeadlineAt  Opt[time.Time]  `json:"deadline_at"`
	Status      Opt[ItemStatus] `json:"status"`
}

func NormalizeTitle(s string) (string, error) {
	t := strings.TrimSpace(s)
	if t == "" {
		return "", invalid("title", "title is required")
	}
	if utf8.RuneCountInString(t) > MaxTitleLength {
		return "", invalid("title", "title must be at most 500 characters")
	}
	return t, nil
}

func utcPtr(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := t.UTC()
	return &u
}

func validateDates(open, deadline *time.Time) error {
	if open != nil && deadline != nil && open.After(*deadline) {
		return invalid("open_at", "open_at must be on or before deadline_at")
	}
	return nil
}

func (n NewItem) Validate() (NewItem, error) {
	title, err := NormalizeTitle(n.Title)
	if err != nil {
		return n, err
	}
	n.Title = title
	n.OpenAt = utcPtr(n.OpenAt)
	n.DeadlineAt = utcPtr(n.DeadlineAt)
	return n, validateDates(n.OpenAt, n.DeadlineAt)
}

func ApplyItemPatch(it Item, p ItemPatch, now time.Time) (Item, error) {
	if p.Title.Set {
		if p.Title.Null {
			return it, invalid("title", "title is required")
		}
		title, err := NormalizeTitle(p.Title.Value)
		if err != nil {
			return it, err
		}
		it.Title = title
	}
	if p.Description.Set {
		if p.Description.Null {
			it.Description = nil
		} else {
			d := p.Description.Value
			it.Description = &d
		}
	}
	if p.OpenAt.Set {
		if p.OpenAt.Null {
			it.OpenAt = nil
		} else {
			it.OpenAt = utcPtr(&p.OpenAt.Value)
		}
	}
	if p.DeadlineAt.Set {
		if p.DeadlineAt.Null {
			it.DeadlineAt = nil
		} else {
			it.DeadlineAt = utcPtr(&p.DeadlineAt.Value)
		}
	}
	if p.Status.Set {
		if p.Status.Null {
			return it, invalid("status", "status is required")
		}
		switch p.Status.Value {
		case StatusCompleted:
			if it.Status != StatusCompleted || it.CompletedAt == nil {
				t := now.UTC()
				it.CompletedAt = &t
			}
		case StatusActive:
			it.CompletedAt = nil
		default:
			return it, invalid("status", "status must be active or completed")
		}
		it.Status = p.Status.Value
	}
	return it, validateDates(it.OpenAt, it.DeadlineAt)
}
