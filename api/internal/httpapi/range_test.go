package httpapi_test

import (
	"net/http"
	"testing"
)

// Mon 2026-10-05 00:00 → Fri 2026-10-09 23:59, America/Los_Angeles (PDT, UTC-7).
const (
	monOpen   = "2026-10-05T07:00:00Z"
	friDue    = "2026-10-10T06:59:00Z"
	tue7pmUTC = "2026-10-07T02:00:00Z"
	tue8pmUTC = "2026-10-07T03:00:00Z"
)

func TestWorkBlocksMustFitItemRange(t *testing.T) {
	a := newTestAPI(t)
	it := a.createItem(userA, map[string]any{"title": "Physics", "open_at": monOpen, "deadline_at": friDue})

	for _, tc := range []struct{ name, start, end, field string }{
		{"before open", "2026-10-04T16:00:00Z", "2026-10-04T17:00:00Z", "start_at"},
		{"after deadline", "2026-10-10T16:00:00Z", "2026-10-10T17:00:00Z", "end_at"},
	} {
		code, data := a.do(userA, "POST", "/api/v1/work-blocks", map[string]string{"item_id": it.ID, "start_at": tc.start, "end_at": tc.end})
		if code != http.StatusBadRequest || decodeAs[apiError](t, data).Error.Field != tc.field {
			t.Fatalf("%s: want 400 on %s, got %d %s", tc.name, tc.field, code, data)
		}
	}

	b := a.createBlock(it.ID, tue7pmUTC, tue8pmUTC)
	code, data := a.do(userA, "PATCH", "/api/v1/work-blocks/"+b.ID, `{"start_at":"2026-10-12T02:00:00Z","end_at":"2026-10-12T03:00:00Z"}`)
	if code != http.StatusBadRequest {
		t.Fatalf("moving a block past the deadline must 400, got %d %s", code, data)
	}

	undated := a.createItem(userA, map[string]any{"title": "Whenever"})
	a.createBlock(undated.ID, "2026-12-01T16:00:00Z", "2026-12-01T17:00:00Z") // no dates, no limits
}

func TestShiftDaysMovesItemAndBlocksTogether(t *testing.T) {
	a := newTestAPI(t)
	it := a.createItem(userA, map[string]any{"title": "Physics", "open_at": monOpen, "deadline_at": friDue})
	b := a.createBlock(it.ID, tue7pmUTC, tue8pmUTC)

	code, data := a.do(userA, "PATCH", "/api/v1/items/"+it.ID, `{"shift_days":2,"time_zone":"America/Los_Angeles"}`)
	if code != 200 {
		t.Fatalf("shift: %d %s", code, data)
	}
	got := decodeAs[apiItem](t, data)
	if *got.OpenAt != "2026-10-07T07:00:00Z" || *got.DeadlineAt != "2026-10-12T06:59:00Z" || got.WorkBlockCount != 1 {
		t.Fatalf("item not shifted: %s", data)
	}
	_, data = a.do(userA, "GET", "/api/v1/work-blocks/"+b.ID, nil)
	if blk := decodeAs[apiBlock](t, data); blk.StartAt != "2026-10-09T02:00:00Z" || blk.EndAt != "2026-10-09T03:00:00Z" {
		t.Fatalf("block not shifted with its item: %s", data)
	}

	if code, data := a.do(userA, "PATCH", "/api/v1/items/"+it.ID, `{"shift_days":1}`); code != 400 || decodeAs[apiError](t, data).Error.Field != "time_zone" {
		t.Fatalf("shift without time_zone: want 400 time_zone, got %d %s", code, data)
	}
	if code, _ := a.do(userB, "PATCH", "/api/v1/items/"+it.ID, `{"shift_days":1,"time_zone":"UTC"}`); code != 404 {
		t.Fatalf("other user shift: want 404, got %d", code)
	}
}

func TestDateEditsThatStrandBlocksAreRefused(t *testing.T) {
	a := newTestAPI(t)
	it := a.createItem(userA, map[string]any{"title": "Physics", "open_at": monOpen, "deadline_at": friDue})
	a.createBlock(it.ID, tue7pmUTC, tue8pmUTC) // Tue 7 PM local

	code, data := a.do(userA, "PATCH", "/api/v1/items/"+it.ID, `{"deadline_at":"2026-10-06T06:59:00Z"}`) // Mon 23:59
	if code != 400 || decodeAs[apiError](t, data).Error.Field != "deadline_at" {
		t.Fatalf("deadline before a block: want 400 deadline_at, got %d %s", code, data)
	}
	_, data = a.do(userA, "GET", "/api/v1/items/"+it.ID, nil)
	if got := decodeAs[apiItem](t, data); *got.DeadlineAt != friDue {
		t.Fatalf("refused edit must not persist: %s", data)
	}
	if code, data := a.do(userA, "PATCH", "/api/v1/items/"+it.ID, `{"title":"Renamed"}`); code != 200 {
		t.Fatalf("non-date edit: %d %s", code, data)
	}
}
