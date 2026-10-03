package domain

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func la(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("America/Los_Angeles")
	if err != nil {
		t.Fatal(err)
	}
	return loc
}

func TestCheckBlockInItem(t *testing.T) {
	open := time.Date(2026, 10, 5, 7, 0, 0, 0, time.UTC)       // Mon 00:00 PDT
	deadline := time.Date(2026, 10, 10, 6, 59, 0, 0, time.UTC) // Fri 23:59 PDT
	ranged := Item{OpenAt: &open, DeadlineAt: &deadline}
	tests := []struct {
		name       string
		it         Item
		start, end time.Time
		wantField  string
	}{
		{"inside", ranged, open.Add(time.Hour), open.Add(2 * time.Hour), ""},
		{"exactly the whole range", ranged, open, deadline, ""},
		{"starts before open", ranged, open.Add(-time.Hour), open.Add(time.Hour), "start_at"},
		{"ends after deadline", ranged, deadline.Add(-time.Hour), deadline.Add(time.Minute), "end_at"},
		{"undated item allows anything", Item{}, open.Add(-48 * time.Hour), open.Add(-47 * time.Hour), ""},
		{"deadline-only item limits the end", Item{DeadlineAt: &deadline}, deadline.Add(time.Hour), deadline.Add(2 * time.Hour), "end_at"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := CheckBlockInItem(tc.it, tc.start, tc.end)
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

func TestApplyItemPatchWithBlocksShift(t *testing.T) {
	loc := la(t)
	open := time.Date(2026, 10, 26, 0, 0, 0, 0, loc)       // Mon
	deadline := time.Date(2026, 10, 30, 23, 59, 0, 0, loc) // Fri
	it := Item{Title: "x", Status: StatusActive, OpenAt: utcPtr(&open), DeadlineAt: utcPtr(&deadline)}
	blockStart := time.Date(2026, 10, 27, 19, 0, 0, 0, loc) // Tue 7 PM PDT
	blocks := []WorkBlock{{ID: uuid.New(), StartAt: blockStart.UTC(), EndAt: blockStart.Add(time.Hour).UTC()}}

	// Shift a week: crosses the 2026-11-01 DST change, wall-clock times must hold.
	p := ItemPatch{ShiftDays: Some(7), TimeZone: Some("America/Los_Angeles")}
	gotItem, gotBlocks, err := ApplyItemPatchWithBlocks(it, blocks, p, now)
	if err != nil {
		t.Fatal(err)
	}
	if o := gotItem.OpenAt.In(loc); o.Day() != 2 || o.Month() != 11 || o.Hour() != 0 {
		t.Fatalf("open = %v, want Nov 2 00:00 local", o)
	}
	if d := gotItem.DeadlineAt.In(loc); d.Day() != 6 || d.Hour() != 23 || d.Minute() != 59 {
		t.Fatalf("deadline = %v, want Nov 6 23:59 local", d)
	}
	if s := gotBlocks[0].StartAt.In(loc); s.Day() != 3 || s.Hour() != 19 {
		t.Fatalf("block start = %v, want Nov 3 19:00 local", s)
	}
	if gotBlocks[0].EndAt.Sub(gotBlocks[0].StartAt) != time.Hour {
		t.Fatal("block duration changed")
	}
	if gotItem.OpenAt.Location() != time.UTC || gotBlocks[0].StartAt.Location() != time.UTC {
		t.Fatal("results must be UTC")
	}
}

func TestApplyItemPatchWithBlocksRules(t *testing.T) {
	loc := la(t)
	open := time.Date(2026, 10, 5, 0, 0, 0, 0, loc)
	deadline := time.Date(2026, 10, 9, 23, 59, 0, 0, loc)
	it := Item{Title: "x", Status: StatusActive, OpenAt: utcPtr(&open), DeadlineAt: utcPtr(&deadline)}
	wed := time.Date(2026, 10, 7, 19, 0, 0, 0, loc).UTC()
	blocks := []WorkBlock{{ID: uuid.New(), StartAt: wed, EndAt: wed.Add(time.Hour)}}

	t.Run("deadline moved before a block is refused", func(t *testing.T) {
		tue := time.Date(2026, 10, 6, 23, 59, 0, 0, loc)
		_, _, err := ApplyItemPatchWithBlocks(it, blocks, ItemPatch{DeadlineAt: Some(tue)}, now)
		assertField(t, err, "deadline_at")
	})
	t.Run("open moved after a block is refused", func(t *testing.T) {
		thu := time.Date(2026, 10, 8, 0, 0, 0, 0, loc)
		_, _, err := ApplyItemPatchWithBlocks(it, blocks, ItemPatch{OpenAt: Some(thu)}, now)
		assertField(t, err, "open_at")
	})
	t.Run("non-date edits never check blocks (legacy strays stay editable)", func(t *testing.T) {
		stray := []WorkBlock{{ID: uuid.New(), StartAt: wed.Add(30 * 24 * time.Hour), EndAt: wed.Add(30*24*time.Hour + time.Hour)}}
		if _, _, err := ApplyItemPatchWithBlocks(it, stray, ItemPatch{Title: Some("renamed")}, now); err != nil {
			t.Fatalf("unexpected: %v", err)
		}
	})
	t.Run("shift needs a valid time zone", func(t *testing.T) {
		_, _, err := ApplyItemPatchWithBlocks(it, blocks, ItemPatch{ShiftDays: Some(1)}, now)
		assertField(t, err, "time_zone")
		_, _, err = ApplyItemPatchWithBlocks(it, blocks, ItemPatch{ShiftDays: Some(1), TimeZone: Some("Mars/Olympus")}, now)
		assertField(t, err, "time_zone")
	})
	t.Run("shift cannot be combined with explicit dates", func(t *testing.T) {
		_, _, err := ApplyItemPatchWithBlocks(it, blocks, ItemPatch{ShiftDays: Some(1), TimeZone: Some("UTC"), OpenAt: Some(open)}, now)
		assertField(t, err, "shift_days")
	})
	t.Run("blocks are untouched without a shift", func(t *testing.T) {
		_, got, err := ApplyItemPatchWithBlocks(it, blocks, ItemPatch{Title: Some("y")}, now)
		if err != nil || !got[0].StartAt.Equal(wed) {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
}
