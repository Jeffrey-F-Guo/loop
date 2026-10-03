package httpapi_test

import (
	"net/http"
	"testing"
)

func TestScheduledMinutesSumsAnItemsBlocks(t *testing.T) {
	a := newTestAPI(t)
	it := a.createItem(userA, map[string]any{"title": "Physics"})
	a.createBlock(it.ID, "2026-10-06T16:00:00Z", "2026-10-06T17:00:00Z")      // 60
	b := a.createBlock(it.ID, "2026-10-07T16:00:00Z", "2026-10-07T17:30:00Z") // 90

	minutes := func() int {
		_, data := a.do(userA, "GET", "/api/v1/items/"+it.ID, nil)
		return decodeAs[apiItem](t, data).ScheduledMins
	}
	if got := minutes(); got != 150 {
		t.Fatalf("scheduled_minutes = %d, want 150", got)
	}
	_, data := a.do(userA, "GET", "/api/v1/items?status=all", nil)
	if got := decodeAs[struct{ Items []apiItem }](t, data).Items[0].ScheduledMins; got != 150 {
		t.Fatalf("list scheduled_minutes = %d, want 150", got)
	}
	a.do(userA, "PATCH", "/api/v1/work-blocks/"+b.ID, map[string]string{"end_at": "2026-10-07T16:30:00Z"})
	if got := minutes(); got != 90 {
		t.Fatalf("after resize scheduled_minutes = %d, want 90", got)
	}
	_, data = a.do(userA, "PATCH", "/api/v1/items/"+it.ID, map[string]string{"title": "Physics HW"})
	if got := decodeAs[apiItem](t, data).ScheduledMins; got != 90 {
		t.Fatalf("patch response scheduled_minutes = %d, want 90", got)
	}
}

func TestUnscheduleClearsDatesAndBlocksButKeepsTheItem(t *testing.T) {
	a := newTestAPI(t)
	it := a.createItem(userA, map[string]any{"title": "Physics", "open_at": monOpen, "deadline_at": friDue})
	a.createBlock(it.ID, tue7pmUTC, tue8pmUTC)
	a.createBlock(it.ID, "2026-10-08T02:00:00Z", "2026-10-08T03:00:00Z")
	other := a.createItem(userA, map[string]any{"title": "Other"})
	keep := a.createBlock(other.ID, tue7pmUTC, tue8pmUTC)

	if code, _ := a.do(userB, "POST", "/api/v1/items/"+it.ID+"/unschedule", nil); code != http.StatusNotFound {
		t.Fatalf("other user: want 404, got %d", code)
	}

	code, data := a.do(userA, "POST", "/api/v1/items/"+it.ID+"/unschedule", nil)
	if code != http.StatusOK {
		t.Fatalf("unschedule: %d %s", code, data)
	}
	got := decodeAs[apiItem](t, data)
	if got.OpenAt != nil || got.DeadlineAt != nil || got.WorkBlockCount != 0 || got.ScheduledMins != 0 || got.Title != "Physics" {
		t.Fatalf("item not cleared: %s", data)
	}
	_, data = a.do(userA, "GET", "/api/v1/work-blocks?item_id="+it.ID, nil)
	if n := len(decodeAs[struct {
		WorkBlocks []apiBlock `json:"work_blocks"`
	}](t, data).WorkBlocks); n != 0 {
		t.Fatalf("blocks left: %d", n)
	}
	if code, _ := a.do(userA, "GET", "/api/v1/work-blocks/"+keep.ID, nil); code != http.StatusOK {
		t.Fatalf("another item's block was touched: %d", code)
	}
	if code, _ := a.do(userA, "GET", "/api/v1/items/"+it.ID, nil); code != http.StatusOK {
		t.Fatalf("item must remain: %d", code)
	}
}
