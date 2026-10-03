package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

func TestDevAuth(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	if id, err := (DevAuth{}).Authenticate(r); err != nil || id != DevUserID {
		t.Fatalf("no header: got %v, %v", id, err)
	}
	other := uuid.New()
	r.Header.Set("X-Dev-User", other.String())
	if id, _ := (DevAuth{}).Authenticate(r); id != other {
		t.Fatalf("header user: got %v", id)
	}
	r.Header.Set("X-Dev-User", "not-a-uuid")
	if id, _ := (DevAuth{}).Authenticate(r); id != DevUserID {
		t.Fatalf("bad header should fall back to dev user, got %v", id)
	}
}

type denyAll struct{}

func (denyAll) Authenticate(*http.Request) (uuid.UUID, error) { return uuid.Nil, ErrUnauthenticated }

func TestMiddleware(t *testing.T) {
	var seen uuid.UUID
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { seen, _ = UserFrom(r.Context()) })
	fail := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusUnauthorized) })

	rec := httptest.NewRecorder()
	Middleware(DevAuth{}, fail)(next).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if seen != DevUserID {
		t.Fatalf("user not set in context: %v", seen)
	}

	rec = httptest.NewRecorder()
	Middleware(denyAll{}, fail)(next).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}
