package auth

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// SupabaseJWT verifies Supabase Auth access tokens against the project's
// JWKS. keyfunc caches the key set and refetches it when it sees an unknown kid.
type SupabaseJWT struct {
	kf     keyfunc.Keyfunc
	issuer string
}

func NewSupabaseJWT(ctx context.Context, jwksURL, supabaseURL string) (*SupabaseJWT, error) {
	kf, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("load JWKS: %w", err)
	}
	return &SupabaseJWT{kf: kf, issuer: strings.TrimRight(supabaseURL, "/") + "/auth/v1"}, nil
}

func (s *SupabaseJWT) Authenticate(r *http.Request) (uuid.UUID, error) {
	raw, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || raw == "" {
		return uuid.Nil, ErrUnauthenticated
	}
	var claims jwt.RegisteredClaims
	_, err := jwt.ParseWithClaims(raw, &claims, s.kf.Keyfunc,
		jwt.WithValidMethods([]string{"ES256", "RS256"}),
		jwt.WithIssuer(s.issuer),
		jwt.WithAudience("authenticated"),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return uuid.Nil, ErrUnauthenticated
	}
	id, err := uuid.Parse(claims.Subject)
	if err != nil {
		return uuid.Nil, ErrUnauthenticated
	}
	return id, nil
}
