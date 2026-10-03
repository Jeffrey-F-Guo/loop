// Package auth resolves the authenticated user for each API request.
package auth

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"
)

var ErrUnauthenticated = errors.New("unauthenticated")

type Authenticator interface {
	Authenticate(r *http.Request) (uuid.UUID, error)
}

type ctxKey struct{}

func WithUser(ctx context.Context, id uuid.UUID) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

func UserFrom(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(ctxKey{}).(uuid.UUID)
	return id, ok
}

func Middleware(a Authenticator, onFail http.Handler) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, err := a.Authenticate(r)
			if err != nil {
				onFail.ServeHTTP(w, r)
				return
			}
			next.ServeHTTP(w, r.WithContext(WithUser(r.Context(), id)))
		})
	}
}

// DevUserID is the user every request acts as in AUTH_MODE=dev unless
// X-Dev-User names another UUID (used by tests for isolation).
var DevUserID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

type DevAuth struct{}

func (DevAuth) Authenticate(r *http.Request) (uuid.UUID, error) {
	if h := r.Header.Get("X-Dev-User"); h != "" {
		if id, err := uuid.Parse(h); err == nil {
			return id, nil
		}
	}
	return DevUserID, nil
}
