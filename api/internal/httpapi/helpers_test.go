package httpapi_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/auth"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/httpapi"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/store"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/testdb"
)

var (
	userA    = uuid.MustParse("aaaaaaaa-0000-0000-0000-000000000001")
	userB    = uuid.MustParse("bbbbbbbb-0000-0000-0000-000000000002")
	fixedNow = time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)
)

type testAPI struct {
	t   *testing.T
	srv *httptest.Server
}

func newTestAPI(t *testing.T) *testAPI {
	t.Helper()
	h := httpapi.New(store.New(testdb.New(t)), auth.DevAuth{}, httpapi.Options{
		CORSOrigins: []string{"http://localhost:8081"},
		Now:         func() time.Time { return fixedNow },
	})
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return &testAPI{t: t, srv: srv}
}

// do sends body as-is when it is a string, otherwise JSON-encodes it.
func (a *testAPI) do(user uuid.UUID, method, path string, body any) (int, []byte) {
	a.t.Helper()
	var rdr io.Reader
	switch b := body.(type) {
	case nil:
	case string:
		rdr = strings.NewReader(b)
	default:
		buf, err := json.Marshal(b)
		if err != nil {
			a.t.Fatal(err)
		}
		rdr = bytes.NewReader(buf)
	}
	req, err := http.NewRequest(method, a.srv.URL+path, rdr)
	if err != nil {
		a.t.Fatal(err)
	}
	req.Header.Set("X-Dev-User", user.String())
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		a.t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	return res.StatusCode, data
}

func decodeAs[T any](t *testing.T, data []byte) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatalf("decode %s: %v", data, err)
	}
	return v
}

type apiItem struct {
	ID             string  `json:"id"`
	Title          string  `json:"title"`
	Description    *string `json:"description"`
	OpenAt         *string `json:"open_at"`
	DeadlineAt     *string `json:"deadline_at"`
	Status         string  `json:"status"`
	WorkBlockCount int     `json:"work_block_count"`
	CompletedAt    *string `json:"completed_at"`
}

type apiError struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Field   string `json:"field"`
	} `json:"error"`
}

func (a *testAPI) createItem(user uuid.UUID, body any) apiItem {
	a.t.Helper()
	code, data := a.do(user, "POST", "/api/v1/items", body)
	if code != http.StatusCreated {
		a.t.Fatalf("create item: %d %s", code, data)
	}
	return decodeAs[apiItem](a.t, data)
}
