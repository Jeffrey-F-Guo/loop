package domain

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestNewWorkBlockValidate(t *testing.T) {
	start := time.Date(2026, 10, 6, 2, 0, 0, 0, time.UTC)
	item := uuid.New()
	tests := []struct {
		name      string
		in        NewWorkBlock
		wantField string
	}{
		{"60 minutes ok", NewWorkBlock{item, start, start.Add(time.Hour)}, ""},
		{"exactly 15 minutes ok", NewWorkBlock{item, start, start.Add(15 * time.Minute)}, ""},
		{"14 minutes rejected", NewWorkBlock{item, start, start.Add(14 * time.Minute)}, "end_at"},
		{"end before start rejected", NewWorkBlock{item, start, start.Add(-time.Hour)}, "end_at"},
		{"missing item rejected", NewWorkBlock{uuid.Nil, start, start.Add(time.Hour)}, "item_id"},
		{"missing start rejected", NewWorkBlock{item, time.Time{}, start}, "start_at"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := tc.in.Validate()
			if tc.wantField == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			assertField(t, err, tc.wantField)
		})
	}
}

func TestApplyWorkBlockPatch(t *testing.T) {
	start := time.Date(2026, 10, 6, 2, 0, 0, 0, time.UTC)
	b := WorkBlock{StartAt: start, EndAt: start.Add(time.Hour)}
	decode := func(js string) WorkBlockPatch {
		var p WorkBlockPatch
		if err := json.Unmarshal([]byte(js), &p); err != nil {
			t.Fatal(err)
		}
		return p
	}

	t.Run("move keeps whatever is sent", func(t *testing.T) {
		got, err := ApplyWorkBlockPatch(b, decode(`{"start_at":"2026-10-07T02:00:00Z","end_at":"2026-10-07T03:00:00Z"}`))
		if err != nil || got.StartAt.Day() != 7 || got.EndAt.Sub(got.StartAt) != time.Hour {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("end only is validated against existing start", func(t *testing.T) {
		_, err := ApplyWorkBlockPatch(b, decode(`{"end_at":"2026-10-06T02:10:00Z"}`))
		assertField(t, err, "end_at")
	})
	t.Run("null start rejected", func(t *testing.T) {
		_, err := ApplyWorkBlockPatch(b, decode(`{"start_at":null}`))
		assertField(t, err, "start_at")
	})
}
