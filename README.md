# Personal Sprint Planner

Capture now, organize later. One Item model shown through Dropbox (what exists), Timeline (when it's active), and Calendar (when you'll work on it), in a desktop workspace you can rearrange.

Product docs: `personal-sprint-planner-specs/`. Implementation design: `docs/superpowers/specs/2026-10-03-personal-sprint-planner-mvp-design.md`.

## Requirements

Go 1.24+, Node 20+, Docker.

## Run locally

```bash
make dev          # Postgres (Docker, :5433) + migrations + API (:8080) + web app (:8081)
```

Open http://localhost:8081. Dev mode signs you in as a fixed dev user; add `?devUser=<uuid>` to act as someone else.

## Test

```bash
make test         # Go unit + integration tests, Vitest
make e2e          # Playwright: FUNCTIONAL_SPEC §20, FEATURE_DESIGN §28, workspace persistence
```

## Layout

| Path | What |
|---|---|
| `api/` | Go API (`internal/domain` rules, `internal/store` Postgres, `internal/httpapi` routes, `internal/auth`) |
| `db/migrations/` | goose migrations (same files for local and Supabase) |
| `api-contract/openapi.yaml` | API contract |
| `app/` | Expo / React Native Web client |
| `e2e/` | Playwright tests |

## Switching to Supabase (Google + Apple login)

1. Create a Supabase project. Under Authentication → Providers, enable Google and Apple and add `http://localhost:8081` to the redirect URLs.
2. Apply migrations to Supabase Postgres:
   `cd api && go tool goose -dir ../db/migrations postgres "$SUPABASE_DB_URL" up`
3. API environment:
   `AUTH_MODE=supabase SUPABASE_URL=https://<ref>.supabase.co DATABASE_URL=$SUPABASE_DB_URL APP_ENV=production`
   (`SUPABASE_JWKS_URL` defaults to `$SUPABASE_URL/auth/v1/.well-known/jwks.json`.)
4. App environment (`app/.env`):
   `EXPO_PUBLIC_AUTH_MODE=supabase`, `EXPO_PUBLIC_SUPABASE_URL=...`, `EXPO_PUBLIC_SUPABASE_ANON_KEY=...`, `EXPO_PUBLIC_API_URL=...`
5. Sign in with Google and with Apple and confirm items you create are only visible to that account.

The frontend uses Supabase for login only; all data goes through the Go API.
