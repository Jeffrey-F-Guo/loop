package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const testSupabaseURL = "https://proj.supabase.co"

func jwksFor(t *testing.T, kid string, key *ecdsa.PrivateKey) []byte {
	t.Helper()
	pub, err := key.PublicKey.ECDH()
	if err != nil {
		t.Fatal(err)
	}
	raw := pub.Bytes() // 0x04 || X(32) || Y(32)
	enc := base64.RawURLEncoding.EncodeToString
	body, _ := json.Marshal(map[string]any{"keys": []map[string]string{{
		"kty": "EC", "crv": "P-256", "alg": "ES256", "use": "sig", "kid": kid,
		"x": enc(raw[1:33]), "y": enc(raw[33:65]),
	}}})
	return body
}

func sign(t *testing.T, key *ecdsa.PrivateKey, kid string, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	tok.Header["kid"] = kid
	s, err := tok.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestSupabaseJWT(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	stranger, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	jwks := jwksFor(t, "k1", key)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write(jwks) }))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	a, err := NewSupabaseJWT(ctx, srv.URL, testSupabaseURL)
	if err != nil {
		t.Fatal(err)
	}

	sub := uuid.New()
	good := jwt.MapClaims{
		"sub": sub.String(), "aud": "authenticated", "iss": testSupabaseURL + "/auth/v1",
		"exp": time.Now().Add(time.Hour).Unix(),
	}
	with := func(k string, v any) jwt.MapClaims {
		c := jwt.MapClaims{}
		for kk, vv := range good {
			c[kk] = vv
		}
		c[k] = v
		return c
	}
	req := func(header string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		if header != "" {
			r.Header.Set("Authorization", header)
		}
		return r
	}

	if id, err := a.Authenticate(req("Bearer " + sign(t, key, "k1", good))); err != nil || id != sub {
		t.Fatalf("valid token: %v, %v", id, err)
	}

	bad := map[string]string{
		"no header":     "",
		"not bearer":    "Basic abc",
		"garbage":       "Bearer not.a.jwt",
		"expired":       "Bearer " + sign(t, key, "k1", with("exp", time.Now().Add(-time.Minute).Unix())),
		"no exp":        "Bearer " + sign(t, key, "k1", with("exp", nil)),
		"wrong aud":     "Bearer " + sign(t, key, "k1", with("aud", "anon")),
		"wrong iss":     "Bearer " + sign(t, key, "k1", with("iss", "https://evil.example/auth/v1")),
		"non-uuid sub":  "Bearer " + sign(t, key, "k1", with("sub", "user-123")),
		"unknown key":   "Bearer " + sign(t, stranger, "k9", good),
		"wrong key/kid": "Bearer " + sign(t, stranger, "k1", good),
	}
	for name, header := range bad {
		t.Run(name, func(t *testing.T) {
			if _, err := a.Authenticate(req(header)); !errors.Is(err, ErrUnauthenticated) {
				t.Fatalf("want ErrUnauthenticated, got %v", err)
			}
		})
	}
}
