package httpapi_test

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
)

type apiBlock struct {
	ID      string `json:"id"`
	ItemID  string `json:"item_id"`
	StartAt string `json:"start_at"`
	EndAt   string `json:"end_at"`
}

func (a *testAPI) createBlock(item, start, end string) apiBlock {
	a.t.Helper()
	code, data := a.do(userA, "POST", "/api/v1/work-blocks", map[string]string{"item_id": item, "start_at": start, "end_at": end})
	if code != http.StatusCreated {
		a.t.Fatalf("create block: %d %s", code, data)
	}
	return decodeAs[apiBlock](a.t, data)
}

func TestCreateWorkBlock(t *testing.T) {
	a := newTestAPI(t)
	it := a.createItem(userA, map[string]any{"title": "Physics", "deadline_at": "2026-10-10T06:59:00Z"})

	b := a.createBlock(it.ID, "2026-10-06T19:00:00-07:00", "2026-10-06T20:00:00-07:00")
	if b.StartAt != "2026-10-07T02:00:00Z" || b.ItemID != it.ID {
		t.Fatalf("block must be stored in UTC: %+v", b)
	}

	code, data := a.do(userA, "POST", "/api/v1/work-blocks", map[string]string{"item_id": it.ID, "start_at": "2026-10-07T02:00:00Z", "end_at": "2026-10-07T02:14:00Z"})
	if code != 400 || decodeAs[apiError](t, data).Error.Field != "end_at" {
		t.Fatalf("14-minute block must 400 on end_at: %d %s", code, data)
	}

	other := a.createItem(userB, map[string]any{"title": "theirs"})
	code, _ = a.do(userA, "POST", "/api/v1/work-blocks", map[string]string{"item_id": other.ID, "start_at": "2026-10-07T02:00:00Z", "end_at": "2026-10-07T03:00:00Z"})
	if code != http.StatusNotFound {
		t.Fatalf("block on another user's item: want 404, got %d", code)
	}

	_, data = a.do(userA, "GET", "/api/v1/items/"+it.ID, nil)
	if got := decodeAs[apiItem](t, data); got.WorkBlockCount != 1 || *got.DeadlineAt != "2026-10-10T06:59:00Z" {
		t.Fatalf("count must be 1 and deadline untouched: %s", data)
	}
	_, data = a.do(userA, "GET", "/api/v1/items?scheduling=scheduled", nil)
	if !strings.Contains(string(data), it.ID) {
		t.Fatalf("item must now be scheduled: %s", data)
	}
}

func TestListWorkBlocks(t *testing.T) {
	a := newTestAPI(t)
	it := a.createItem(userA, map[string]any{"title": "x"})
	a.createBlock(it.ID, "2026-10-06T16:00:00Z", "2026-10-06T17:00:00Z")
	mid := a.createBlock(it.ID, "2026-10-06T17:00:00Z", "2026-10-06T18:00:00Z")
	a.createBlock(it.ID, "2026-10-06T18:00:00Z", "2026-10-06T19:00:00Z")

	q := url.Values{"start": {"2026-10-06T17:00:00Z"}, "end": {"2026-10-06T18:00:00Z"}}
	code, data := a.do(userA, "GET", "/api/v1/work-blocks?"+q.Encode(), nil)
	list := decodeAs[struct {
		WorkBlocks []apiBlock `json:"work_blocks"`
	}](t, data)
	if code != 200 || len(list.WorkBlocks) != 1 || list.WorkBlocks[0].ID != mid.ID {
		t.Fatalf("overlap [17,18): %d %s", code, data)
	}

	_, data = a.do(userA, "GET", "/api/v1/work-blocks?item_id="+it.ID, nil)
	if n := strings.Count(string(data), `"item_id"`); n != 3 {
		t.Fatalf("by item: want 3 blocks, got %d", n)
	}

	for _, bad := range []string{"", "?start=2026-10-06T17:00:00Z", "?start=yesterday&end=2026-10-06T18:00:00Z", "?start=2026-10-06T18:00:00Z&end=2026-10-06T17:00:00Z", "?item_id=nope"} {
		if code, data := a.do(userA, "GET", "/api/v1/work-blocks"+bad, nil); code != 400 {
			t.Fatalf("GET work-blocks%s: want 400, got %d %s", bad, code, data)
		}
	}
	_, data = a.do(userB, "GET", "/api/v1/work-blocks?item_id="+it.ID, nil)
	if strings.Contains(string(data), it.ID) {
		t.Fatal("other user saw blocks")
	}
}

func TestPatchAndDeleteWorkBlock(t *testing.T) {
	a := newTestAPI(t)
	it := a.createItem(userA, map[string]any{"title": "x", "open_at": "2026-10-05T07:00:00Z", "deadline_at": "2026-10-10T06:59:00Z"})
	b := a.createBlock(it.ID, "2026-10-07T02:00:00Z", "2026-10-07T03:00:00Z")
	path := "/api/v1/work-blocks/" + b.ID

	_, data := a.do(userA, "PATCH", path, `{"start_at":"2026-10-08T02:00:00Z","end_at":"2026-10-08T04:00:00Z"}`)
	if got := decodeAs[apiBlock](t, data); got.StartAt != "2026-10-08T02:00:00Z" || got.EndAt != "2026-10-08T04:00:00Z" {
		t.Fatalf("move: %s", data)
	}
	_, data = a.do(userA, "GET", "/api/v1/items/"+it.ID, nil)
	if got := decodeAs[apiItem](t, data); *got.OpenAt != "2026-10-05T07:00:00Z" || *got.DeadlineAt != "2026-10-10T06:59:00Z" {
		t.Fatalf("moving a block must not change item dates: %s", data)
	}
	if code, _ := a.do(userA, "PATCH", path, `{"end_at":"2026-10-08T02:10:00Z"}`); code != 400 {
		t.Fatalf("shrinking below 15m must 400, got %d", code)
	}
	if code, _ := a.do(userB, "PATCH", path, `{"end_at":"2026-10-08T05:00:00Z"}`); code != 404 {
		t.Fatalf("other user patch: want 404, got %d", code)
	}
	if code, _ := a.do(userB, "DELETE", path, nil); code != 404 {
		t.Fatalf("other user delete: want 404, got %d", code)
	}
	if code, _ := a.do(userA, "DELETE", path, nil); code != 204 {
		t.Fatalf("delete: want 204, got %d", code)
	}
	_, data = a.do(userA, "GET", "/api/v1/items/"+it.ID, nil)
	if decodeAs[apiItem](t, data).WorkBlockCount != 0 {
		t.Fatalf("count must drop to 0: %s", data)
	}
}

func TestDeletingItemCascadesBlocks(t *testing.T) {
	a := newTestAPI(t)
	it := a.createItem(userA, map[string]any{"title": "x"})
	b := a.createBlock(it.ID, "2026-10-07T02:00:00Z", "2026-10-07T03:00:00Z")
	a.do(userA, "DELETE", "/api/v1/items/"+it.ID, nil)
	if code, _ := a.do(userA, "GET", "/api/v1/work-blocks/"+b.ID, nil); code != 404 {
		t.Fatalf("block must be gone, got %d", code)
	}
}
