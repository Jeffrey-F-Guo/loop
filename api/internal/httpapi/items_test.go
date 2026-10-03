package httpapi_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestCreateItemMinimal(t *testing.T) {
	a := newTestAPI(t)
	code, data := a.do(userA, "POST", "/api/v1/items", `{"title":"  Look into hackathon idea "}`)
	if code != http.StatusCreated {
		t.Fatalf("status %d: %s", code, data)
	}
	it := decodeAs[apiItem](t, data)
	if it.Title != "Look into hackathon idea" || it.Status != "active" || it.WorkBlockCount != 0 ||
		it.OpenAt != nil || it.DeadlineAt != nil || it.Description != nil || it.CompletedAt != nil {
		t.Fatalf("unexpected item %+v", it)
	}
	raw := decodeAs[map[string]any](t, data)
	if _, leaked := raw["user_id"]; leaked {
		t.Fatal("user_id must not be returned")
	}
	for _, k := range []string{"description", "open_at", "deadline_at", "completed_at"} {
		if _, present := raw[k]; !present {
			t.Fatalf("%s must be present as null", k)
		}
	}
}

func TestCreateItemValidation(t *testing.T) {
	a := newTestAPI(t)
	cases := []struct{ name, body, field string }{
		{"blank title", `{"title":"   "}`, "title"},
		{"too long", `{"title":"` + strings.Repeat("a", 501) + `"}`, "title"},
		{"open after deadline", `{"title":"x","open_at":"2026-10-09T07:00:00Z","deadline_at":"2026-10-05T07:00:00Z"}`, "open_at"},
		{"unknown field", `{"title":"x","color":"red"}`, "body"},
		{"malformed json", `{"title":`, "body"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			code, data := a.do(userA, "POST", "/api/v1/items", tc.body)
			e := decodeAs[apiError](t, data)
			if code != http.StatusBadRequest || e.Error.Code != "validation_failed" || e.Error.Field != tc.field {
				t.Fatalf("got %d %s", code, data)
			}
		})
	}
}

func TestListItemsFilters(t *testing.T) {
	a := newTestAPI(t)
	a.createItem(userA, map[string]any{"title": "one"})
	two := a.createItem(userA, map[string]any{"title": "two"})
	a.do(userA, "PATCH", "/api/v1/items/"+two.ID, `{"status":"completed"}`)

	get := func(q string) []string {
		code, data := a.do(userA, "GET", "/api/v1/items"+q, nil)
		if code != 200 {
			t.Fatalf("GET %s: %d %s", q, code, data)
		}
		var titles []string
		for _, it := range decodeAs[struct{ Items []apiItem }](t, data).Items {
			titles = append(titles, it.Title)
		}
		return titles
	}
	if got := get(""); len(got) != 1 || got[0] != "one" {
		t.Fatalf("default is active only, got %v", got)
	}
	if got := get("?status=all"); len(got) != 2 || got[0] != "two" {
		t.Fatalf("all newest first, got %v", got)
	}
	if got := get("?status=completed"); len(got) != 1 || got[0] != "two" {
		t.Fatalf("completed, got %v", got)
	}
	if got := get("?scheduling=scheduled"); len(got) != 0 {
		t.Fatalf("nothing scheduled yet, got %v", got)
	}
	if code, _ := a.do(userA, "GET", "/api/v1/items?status=later", nil); code != 400 {
		t.Fatalf("bad status filter: want 400, got %d", code)
	}
	code, data := a.do(uuid.New(), "GET", "/api/v1/items", nil)
	if code != 200 || !strings.Contains(string(data), `"items":[]`) {
		t.Fatalf("empty list must be [], got %s", data)
	}
}

func TestPatchItem(t *testing.T) {
	a := newTestAPI(t)
	it := a.createItem(userA, map[string]any{"title": "Physics", "description": "Problems 1-8", "deadline_at": "2026-10-05T07:00:00Z"})
	path := "/api/v1/items/" + it.ID

	_, data := a.do(userA, "PATCH", path, `{"title":"Physics Assignment"}`)
	if got := decodeAs[apiItem](t, data); got.Title != "Physics Assignment" || got.Description == nil {
		t.Fatalf("absent description must be untouched: %s", data)
	}
	_, data = a.do(userA, "PATCH", path, `{"description":null}`)
	if got := decodeAs[apiItem](t, data); got.Description != nil {
		t.Fatalf("null must clear description: %s", data)
	}
	code, data := a.do(userA, "PATCH", path, `{"open_at":"2026-10-09T07:00:00Z"}`)
	if code != 400 || decodeAs[apiError](t, data).Error.Field != "open_at" {
		t.Fatalf("merged open_at > deadline_at must 400: %d %s", code, data)
	}
	_, data = a.do(userA, "PATCH", path, `{"status":"completed"}`)
	if got := decodeAs[apiItem](t, data); got.CompletedAt == nil || *got.CompletedAt != "2026-10-03T12:00:00Z" {
		t.Fatalf("completed_at must be server now: %s", data)
	}
	_, data = a.do(userA, "PATCH", path, `{"status":"active"}`)
	if got := decodeAs[apiItem](t, data); got.CompletedAt != nil || got.Status != "active" {
		t.Fatalf("reopen must clear completed_at: %s", data)
	}
	_, data = a.do(userA, "PATCH", path, `{"open_at":"2026-10-05T00:00:00-07:00","deadline_at":null}`)
	if got := decodeAs[apiItem](t, data); got.OpenAt == nil || *got.OpenAt != "2026-10-05T07:00:00Z" {
		t.Fatalf("timestamps must be returned in UTC: %s", data)
	}
}

func TestDeleteItem(t *testing.T) {
	a := newTestAPI(t)
	it := a.createItem(userA, map[string]any{"title": "x"})
	if code, _ := a.do(userA, "DELETE", "/api/v1/items/"+it.ID, nil); code != http.StatusNoContent {
		t.Fatalf("delete: %d", code)
	}
	if code, _ := a.do(userA, "GET", "/api/v1/items/"+it.ID, nil); code != http.StatusNotFound {
		t.Fatalf("get after delete: %d", code)
	}
}

func TestItemsCrossUserIsolation(t *testing.T) {
	a := newTestAPI(t)
	it := a.createItem(userA, map[string]any{"title": "private"})
	path := "/api/v1/items/" + it.ID
	for _, tc := range []struct{ method, body string }{{"GET", ""}, {"PATCH", `{"title":"pwned"}`}, {"DELETE", ""}} {
		var body any
		if tc.body != "" {
			body = tc.body
		}
		code, data := a.do(userB, tc.method, path, body)
		if code != http.StatusNotFound || decodeAs[apiError](t, data).Error.Code != "not_found" {
			t.Fatalf("%s as other user: want 404 not_found, got %d %s", tc.method, code, data)
		}
	}
	_, data := a.do(userB, "GET", "/api/v1/items?status=all", nil)
	if strings.Contains(string(data), it.ID) {
		t.Fatal("other user's list leaked the item")
	}
	_, data = a.do(userA, "GET", path, nil)
	if decodeAs[apiItem](t, data).Title != "private" {
		t.Fatal("owner's item was modified")
	}
}

func TestMalformedAndUnknownIDs(t *testing.T) {
	a := newTestAPI(t)
	for _, p := range []string{"/api/v1/items/not-a-uuid", "/api/v1/items/" + uuid.NewString()} {
		if code, _ := a.do(userA, "GET", p, nil); code != http.StatusNotFound {
			t.Fatalf("%s: want 404, got %d", p, code)
		}
	}
}

func TestCORSAndHealth(t *testing.T) {
	a := newTestAPI(t)
	req, _ := http.NewRequest("OPTIONS", a.srv.URL+"/api/v1/items", nil)
	req.Header.Set("Origin", "http://localhost:8081")
	req.Header.Set("Access-Control-Request-Method", "PATCH")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusNoContent || res.Header.Get("Access-Control-Allow-Origin") != "http://localhost:8081" {
		t.Fatalf("preflight: %d %v", res.StatusCode, res.Header)
	}
	res, _ = http.Get(a.srv.URL + "/healthz")
	if res.StatusCode != 200 {
		t.Fatalf("healthz: %d", res.StatusCode)
	}
}
