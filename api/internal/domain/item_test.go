package domain

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

var (
	mon = time.Date(2026, 10, 5, 7, 0, 0, 0, time.UTC)
	fri = time.Date(2026, 10, 10, 6, 59, 0, 0, time.UTC)
	now = time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)
)

func assertField(t *testing.T, err error, field string) {
	t.Helper()
	var ve *ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("want ValidationError on %q, got %v", field, err)
	}
	if ve.Field != field {
		t.Fatalf("want field %q, got %q (%s)", field, ve.Field, ve.Message)
	}
}

func TestNewItemValidate(t *testing.T) {
	tests := []struct {
		name      string
		in        NewItem
		wantTitle string
		wantField string
	}{
		{"trims title", NewItem{Title: "  Physics  "}, "Physics", ""},
		{"blank title", NewItem{Title: "   "}, "", "title"},
		{"500 runes ok", NewItem{Title: strings.Repeat("é", 500)}, strings.Repeat("é", 500), ""},
		{"501 runes rejected", NewItem{Title: strings.Repeat("a", 501)}, "", "title"},
		{"open after deadline", NewItem{Title: "x", OpenAt: &fri, DeadlineAt: &mon}, "", "open_at"},
		{"open equals deadline", NewItem{Title: "x", OpenAt: &mon, DeadlineAt: &mon}, "x", ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.in.Validate()
			if tc.wantField != "" {
				assertField(t, err, tc.wantField)
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.Title != tc.wantTitle {
				t.Fatalf("title = %q, want %q", got.Title, tc.wantTitle)
			}
		})
	}
}

func decodePatch(t *testing.T, js string) ItemPatch {
	t.Helper()
	var p ItemPatch
	if err := json.Unmarshal([]byte(js), &p); err != nil {
		t.Fatalf("decode patch: %v", err)
	}
	return p
}

func TestApplyItemPatch(t *testing.T) {
	desc := "Problems 1-8"
	earlier := now.Add(-time.Hour)
	base := Item{Title: "Physics", Description: &desc, DeadlineAt: &mon, Status: StatusActive}
	completed := Item{Title: "Done thing", Status: StatusCompleted, CompletedAt: &earlier}

	t.Run("empty patch changes nothing", func(t *testing.T) {
		got, err := ApplyItemPatch(base, decodePatch(t, `{}`), now)
		if err != nil || got.Title != "Physics" || got.Description == nil || *got.Description != desc {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("absent description untouched, title trimmed", func(t *testing.T) {
		got, err := ApplyItemPatch(base, decodePatch(t, `{"title":"  New  "}`), now)
		if err != nil || got.Title != "New" || got.Description == nil {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("null description clears it", func(t *testing.T) {
		got, err := ApplyItemPatch(base, decodePatch(t, `{"description":null}`), now)
		if err != nil || got.Description != nil {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("null title rejected", func(t *testing.T) {
		_, err := ApplyItemPatch(base, decodePatch(t, `{"title":null}`), now)
		assertField(t, err, "title")
	})
	t.Run("complete sets completed_at", func(t *testing.T) {
		got, err := ApplyItemPatch(base, decodePatch(t, `{"status":"completed"}`), now)
		if err != nil || got.Status != StatusCompleted || got.CompletedAt == nil || !got.CompletedAt.Equal(now) {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("re-completing keeps original completed_at", func(t *testing.T) {
		got, err := ApplyItemPatch(completed, decodePatch(t, `{"status":"completed"}`), now)
		if err != nil || !got.CompletedAt.Equal(earlier) {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("reopen clears completed_at", func(t *testing.T) {
		got, err := ApplyItemPatch(completed, decodePatch(t, `{"status":"active"}`), now)
		if err != nil || got.Status != StatusActive || got.CompletedAt != nil {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("unknown status rejected", func(t *testing.T) {
		_, err := ApplyItemPatch(base, decodePatch(t, `{"status":"done"}`), now)
		assertField(t, err, "status")
	})
	t.Run("open after existing deadline rejected on merged result", func(t *testing.T) {
		_, err := ApplyItemPatch(base, decodePatch(t, `{"open_at":"2026-10-09T00:00:00Z"}`), now)
		assertField(t, err, "open_at")
	})
	t.Run("null deadline clears it", func(t *testing.T) {
		got, err := ApplyItemPatch(base, decodePatch(t, `{"deadline_at":null}`), now)
		if err != nil || got.DeadlineAt != nil {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("times are normalized to UTC", func(t *testing.T) {
		got, err := ApplyItemPatch(Item{Title: "x", Status: StatusActive},
			decodePatch(t, `{"open_at":"2026-10-05T00:00:00-07:00"}`), now)
		if err != nil || got.OpenAt.Location() != time.UTC || got.OpenAt.Hour() != 7 {
			t.Fatalf("got %v, %v", got.OpenAt, err)
		}
	})
}
