package httpapi_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/domain"
)

func canonical(t *testing.T, raw []byte) string {
	t.Helper()
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(v)
	return string(b)
}

type apiWorkspace struct {
	Layout    json.RawMessage `json:"layout"`
	UpdatedAt string          `json:"updated_at"`
}

func TestWorkspaceDefaultAndPut(t *testing.T) {
	a := newTestAPI(t)
	code, data := a.do(userA, "GET", "/api/v1/workspace", nil)
	ws := decodeAs[apiWorkspace](t, data)
	if code != 200 || canonical(t, ws.Layout) != canonical(t, domain.DefaultLayout()) || ws.UpdatedAt == "" {
		t.Fatalf("first GET must return the default layout: %d %s", code, data)
	}

	next := `{"version":1,"root":{"kind":"view","id":"v1","view":{"type":"dropbox","config":{"filter":"scheduled"}}}}`
	code, data = a.do(userA, "PUT", "/api/v1/workspace", `{"layout":`+next+`}`)
	if code != 200 || canonical(t, decodeAs[apiWorkspace](t, data).Layout) != canonical(t, []byte(next)) {
		t.Fatalf("PUT: %d %s", code, data)
	}
	_, data = a.do(userA, "GET", "/api/v1/workspace", nil)
	if canonical(t, decodeAs[apiWorkspace](t, data).Layout) != canonical(t, []byte(next)) {
		t.Fatalf("GET after PUT: %s", data)
	}

	_, data = a.do(userB, "GET", "/api/v1/workspace", nil)
	if canonical(t, decodeAs[apiWorkspace](t, data).Layout) != canonical(t, domain.DefaultLayout()) {
		t.Fatalf("other user must get their own default: %s", data)
	}
}

func TestWorkspaceRejectsInvalid(t *testing.T) {
	a := newTestAPI(t)
	a.do(userA, "GET", "/api/v1/workspace", nil)
	bad := []string{
		`{"layout":{"version":1,"root":{"kind":"split","id":"s","direction":"row","sizes":[1],"children":[{"kind":"view","id":"a","view":{"type":"timeline","config":{}}}]}}}`,
		`{"layout":{"version":1,"root":null},"extra":1}`,
		`{"layout":{"version":1,"root":null,"theme":"dark"}}`,
		`{}`,
		`{"layout":{"version":1,"root":null},"pad":"` + strings.Repeat("x", 70_000) + `"}`,
	}
	for i, body := range bad {
		code, data := a.do(userA, "PUT", "/api/v1/workspace", body)
		if code != http.StatusBadRequest {
			t.Fatalf("case %d: want 400, got %d %s", i, code, data)
		}
	}
	_, data := a.do(userA, "GET", "/api/v1/workspace", nil)
	if canonical(t, decodeAs[apiWorkspace](t, data).Layout) != canonical(t, domain.DefaultLayout()) {
		t.Fatal("rejected PUTs must not change the stored layout")
	}
}
