# Personal Sprint Planner — MVP Implementation Design

**Date:** 2026-10-03
**Status:** Draft for review
**Source documents:** `personal-sprint-planner-specs/PRD.md`, `FUNCTIONAL_SPEC.md`, `FEATURE_DESIGN.md`

This document turns the three source documents into concrete build decisions. Product behavior is defined by the source documents; where this document is more specific (names, shapes, limits), this document wins. Section references like FS §12 / FD §17 point to FUNCTIONAL_SPEC / FEATURE_DESIGN.

---

## 1. Goal and Definition of Done

Build the desktop-web MVP: one Item model shown through Dropbox, Timeline, and Calendar view instances inside a persistent, split-pane workspace.

The MVP is done when all of the following hold:

1. `make test` passes (Go unit + integration tests, Vitest unit/component tests).
2. `make e2e` passes `acceptance.spec.ts` (FS §20, all 20 steps) and `ux.spec.ts` (FD §28, all 7 steps).
3. The final whole-branch review has no open Critical or Important findings.

Out of scope: everything in PRD §9, plus real Google/Apple login testing (performed manually by the user after plugging in Supabase credentials), mobile layouts, dark mode.

---

## 2. Key Decisions

| Decision | Choice |
|---|---|
| Dev database | Postgres 16 via `docker compose`, host port **5433** (avoids local Homebrew Postgres on 5432) |
| Dev auth | `AUTH_MODE=dev`: fixed dev user, no login |
| Prod auth | `AUTH_MODE=supabase`: verify Supabase JWT via JWKS; frontend uses `@supabase/supabase-js` for auth only |
| Frontend | Expo (latest SDK) + TypeScript, targeting web first |
| Desktop interactions | Web-only `.web.tsx` components using **dnd-kit** and a custom split-tree renderer |
| Domain cache | TanStack Query (single source for all view instances) |
| UI-only state | Zustand (drag state, open popover, toasts) |
| Backend | Go 1.22+ stdlib `net/http` routing, `pgx/v5`, **sqlc**, **goose** migrations |
| Ports | API `:8080`, Expo web `:8081`, Postgres `:5433` |

---

## 3. Repository Layout

```
AI-Calendar/
  api/                      Go module (github.com/Jeffrey-F-Guo/ai-calendar/api)
    cmd/server/main.go
    internal/domain/        types + validation (pure, no DB)
    internal/store/         sqlc-generated + hand-written query wrappers
    internal/httpapi/       handlers, routing, JSON/error helpers
    internal/auth/          Authenticator interface, DevAuth, SupabaseJWT
    sqlc.yaml
  app/                      Expo app
    src/api/                fetch client, query keys, query + mutation hooks
    src/domain/             pure helpers (snap, ranges, filters, layout tree ops)
    src/workspace/          split-tree renderer, panels, docking, persistence
    src/views/dropbox/
    src/views/timeline/
    src/views/calendar/
    src/views/item/         item detail popover
    src/dnd/                DndContext, payload types, drop handlers, previews
    src/ui/                 tokens, primitives (Button, Menu, Toast, Popover)
    src/auth/               dev session / Supabase session
  db/migrations/            goose SQL migrations (shared by dev and Supabase)
  e2e/                      Playwright project
  api-contract/openapi.yaml API contract (frozen after phase 0)
  docker-compose.yml
  Makefile
  .env.example
```

Makefile targets: `db-up`, `db-down`, `migrate`, `api`, `app`, `dev` (db + api + app), `test-api`, `test-app`, `test`, `e2e`, `sqlc`.

---

## 4. Database

Migration `0001_init.sql`:

```sql
CREATE TABLE items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  description  TEXT NULL,
  open_at      TIMESTAMPTZ NULL,
  deadline_at  TIMESTAMPTZ NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  CHECK (open_at IS NULL OR deadline_at IS NULL OR open_at <= deadline_at)
);
CREATE INDEX items_user_idx          ON items (user_id);
CREATE INDEX items_user_status_idx   ON items (user_id, status);
CREATE INDEX items_user_deadline_idx ON items (user_id, deadline_at);

CREATE TABLE work_blocks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  item_id    UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  start_at   TIMESTAMPTZ NOT NULL,
  end_at     TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at - start_at >= interval '15 minutes')
);
CREATE INDEX work_blocks_user_start_idx ON work_blocks (user_id, start_at);
CREATE INDEX work_blocks_item_idx       ON work_blocks (item_id);

CREATE TABLE workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE,
  layout     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`user_id` is the Supabase `auth.users.id` (JWT `sub`). No foreign key to `auth.users`, so the schema works on plain Postgres. One workspace per user (MVP).

---

## 5. API Contract

Base path `/api/v1`. JSON everywhere. Timestamps are RFC 3339; the server stores and returns UTC.

### 5.1 Errors

```json
{ "error": { "code": "validation_failed", "message": "open_at must be before deadline_at", "field": "open_at" } }
```

Codes: `validation_failed` (400), `unauthorized` (401), `not_found` (404; also used for resources owned by another user), `internal` (500).

### 5.2 Items

Item response shape (FS §3 plus a derived count):

```json
{
  "id": "uuid", "title": "Physics Assignment 4", "description": "Problems 1-8",
  "open_at": "2026-10-05T07:00:00Z", "deadline_at": "2026-10-09T06:59:00Z",
  "status": "active", "work_block_count": 2,
  "created_at": "...", "updated_at": "...", "completed_at": null
}
```

`user_id` is not returned to clients.

| Method | Path | Notes |
|---|---|---|
| POST | `/items` | Body `{title, description?, open_at?, deadline_at?}`. Title is trimmed; 1–500 chars. Returns 201 + Item. |
| GET | `/items` | Query `status=active\|completed\|all` (default `active`), `scheduling=all\|scheduled\|unscheduled` (default `all`). Ordered by `created_at DESC`. Returns `{ "items": [...] }`. |
| GET | `/items/{id}` | Item. |
| PATCH | `/items/{id}` | Partial update of `title`, `description`, `open_at`, `deadline_at`, `status`. Explicit `null` clears nullable fields; absent fields are untouched. Setting `status=completed` sets `completed_at=now()`; setting `status=active` clears it. Validates `open_at <= deadline_at` against the merged result. |
| DELETE | `/items/{id}` | 204. Cascades to work blocks. (Confirmation is a client concern.) |

### 5.3 WorkBlocks

Shape: `{id, item_id, start_at, end_at, created_at, updated_at}`.

| Method | Path | Notes |
|---|---|---|
| POST | `/work-blocks` | Body `{item_id, start_at, end_at}`. Item must exist and belong to the user (else 404). `end_at - start_at >= 15m`. Returns 201. |
| GET | `/work-blocks` | Query `start`, `end` (RFC 3339; returns blocks overlapping `[start, end)`), optional `item_id`. At least one of (`start`+`end`) or `item_id` is required. Returns `{ "work_blocks": [...] }`. |
| GET | `/work-blocks/{id}` | WorkBlock. |
| PATCH | `/work-blocks/{id}` | Partial `{start_at?, end_at?}`; validated on merged result. Never touches the Item. |
| DELETE | `/work-blocks/{id}` | 204. |

### 5.4 Workspace

| Method | Path | Notes |
|---|---|---|
| GET | `/workspace` | Returns `{layout, updated_at}`. If the user has none, the server inserts and returns the default layout (§5.5). |
| PUT | `/workspace` | Body `{layout}`; validated (§5.5); replaces wholesale. Returns `{layout, updated_at}`. |

### 5.5 Layout tree

```ts
type Layout = { version: 1; root: LayoutNode | null };
type LayoutNode =
  | { kind: 'split'; id: string; direction: 'row' | 'column'; children: LayoutNode[]; sizes: number[] }
  | { kind: 'view';  id: string; view: ViewInstance };
type ViewInstance =
  | { type: 'dropbox';  config: { filter: 'all' | 'scheduled' | 'unscheduled' | 'completed' } }
  | { type: 'timeline'; config: Record<string, never> }
  | { type: 'calendar'; config: { mode: 'week' | 'day' } };
```

`direction: 'row'` lays children left-to-right. Navigation state (which week is shown) is not persisted; views open on the current week/day.

Validation (server is authoritative; client uses the same rules in `src/domain/layout.ts`):
- `version == 1`; `root` may be null (empty workspace).
- Split nodes have ≥ 2 children, `sizes.length == children.length`, every size > 0, sizes sum to 1 ± 0.01.
- Max depth 8; max 24 view leaves; all node `id`s unique.
- View `type` is one of the three; `config` matches its type (unknown keys rejected).
- Body ≤ 64 KB.

Default layout (FD §21):

```json
{ "version": 1, "root": {
  "kind": "split", "id": "s-root", "direction": "column", "sizes": [0.62, 0.38], "children": [
    { "kind": "split", "id": "s-top", "direction": "row", "sizes": [0.32, 0.68], "children": [
      { "kind": "view", "id": "v-dropbox", "view": { "type": "dropbox", "config": { "filter": "all" } } },
      { "kind": "view", "id": "v-calendar", "view": { "type": "calendar", "config": { "mode": "week" } } }
    ]},
    { "kind": "view", "id": "v-timeline", "view": { "type": "timeline", "config": {} } }
  ]}}
```

### 5.6 Auth

- Every `/api/v1` route requires authentication. `GET /healthz` does not.
- `Authenticator` interface: `Authenticate(r *http.Request) (userID uuid.UUID, err error)`.
- `DevAuth` (only when `AUTH_MODE=dev`): uses `X-Dev-User` header if it is a valid UUID, otherwise the fixed dev user `00000000-0000-0000-0000-000000000001`. The server refuses to start with `AUTH_MODE=dev` unless `APP_ENV != production`.
- `SupabaseJWT` (`AUTH_MODE=supabase`): `Authorization: Bearer <jwt>`; verify signature against `SUPABASE_JWKS_URL` (cached, refreshed on unknown `kid`), check `exp`, `aud=authenticated`, `iss` = `SUPABASE_URL/auth/v1`; `sub` is the user ID. Unit-tested with a locally generated key + fake JWKS server.
- CORS allows `CORS_ORIGINS` (default `http://localhost:8081`).

---

## 6. Frontend

### 6.1 Data flow and sync (FS §13)

- Query keys: `['items', {status}]` and `['workBlocks', {start, end}]`, plus `['workspace']`.
- Dropbox views use `['items', {status: 'all'}]` once and filter client-side, so every Dropbox instance shares one cache entry. Timeline uses the same list (active only). Calendar fetches work blocks for the visible range and joins titles from the items cache.
- Every mutation is optimistic: `onMutate` patches all affected cache entries (including `work_block_count` when blocks are created/deleted), `onError` restores the snapshot and shows a toast ("Couldn't save — change reverted"), `onSettled` invalidates the affected keys.
- Item creation uses a temporary client ID, replaced on success, so typing → Enter → typing never waits on the network.

### 6.2 Pure domain helpers (`src/domain/`, fully unit-tested)

- `scheduling.ts`: `isScheduled(item)`, `filterItems(items, filter)`.
- `time.ts`: `snap15(date)`, `DEFAULT_BLOCK_MINUTES = 60`, `MIN_BLOCK_MINUTES = 15`, week bounds (weeks start Monday, local time).
- `timeline.ts`: `timelineShape(item) → 'range' | 'deadline-marker' | 'hidden'` (open-only items are hidden, per FS §7 preferred behavior); `clampRange` enforcing `open_at <= deadline_at`. Day-granular edits set `open_at` to local 00:00 and `deadline_at` to local 23:59.
- `layout.ts`: `validate`, `removeView`, `duplicateView` (inserts a sibling split to the right of the source), `dockView(layout, viewId, targetId, edge: 'left'|'right'|'top'|'bottom'|'center')` (`center` swaps), `setSizes`, `addView` (splits the root on the right), `normalize` (collapses single-child splits, renormalizes sizes).

### 6.3 Shell and workspace

- Shell: narrow top bar with app name, `+ Item` (focuses the nearest Dropbox capture input; global shortcut `N` when no input is focused), and `+ View` menu (Dropbox / Calendar / Timeline). No sidebar in MVP; the workspace gets the screen.
- `WorkspaceRenderer.web.tsx` renders the layout tree with flex sizes; dividers are draggable (min panel size 160px).
- Panel header: view name, filter/mode control inline (Dropbox filter dropdown, Calendar Week/Day toggle), `⋯` menu with Duplicate view, Close view. Header is the drag handle for docking; dragging shows edge/center drop zones over target panels (FD §4).
- Layout changes update the `['workspace']` cache immediately and `PUT /workspace` debounced 500ms; flushed on `beforeunload`.
- Empty workspace shows "No views open" with the `+ View` options.

### 6.4 Views

**Dropbox (FD §6–8):** capture input at top ("Add something..."), Enter creates and clears, keeps focus. Rows: completion circle, title, muted secondary line (`Due Fri`, `Tue → Fri · 2 blocks`). Click row → item detail. Completed filter shows completed items with a filled circle; clicking it reopens. Empty state text from FD §22.

**Timeline (FD §10–12):** one week (Mon–Sun) with prev/next/today. Rows = active items with `range` or `deadline-marker` shape overlapping the week. Bar drag moves both dates by whole days; left edge changes `open_at`; right edge changes `deadline_at`; deadline-marker can be dragged (moves `deadline_at`). Hover tooltip `Title · Mon → Fri`. Day columns are drop targets for items from Dropbox.

**Calendar (FD §13–15):** week (default) and day modes, 24h vertical grid, 48px per hour, initial scroll to 8:00, prev/next/today. Blocks show title + time range (title only if short). Drag body moves (duration preserved), drag bottom edge resizes (min 15m), 15-minute snapping. Click a block → item detail. Empty state from FD §22.

**Item detail (FD §9):** popover anchored to the clicked element (centered fallback). Editable title, description, open date, deadline (date + time inputs), list of work blocks (each deletable), Delete (with confirm) and Done/Reopen. Edits save on blur/Enter.

### 6.5 Cross-view drag and drop (FS §12, FD §16–18)

One dnd-kit `DndContext` wraps the workspace (pointer sensor, 4px activation distance so clicks still work). Payloads:

```ts
type DragPayload =
  | { kind: 'item'; itemId: string }                        // from Dropbox row
  | { kind: 'timelineBar'; itemId: string }                 // from Timeline bar body
  | { kind: 'workBlock'; blockId: string }                  // from Calendar block
  | { kind: 'panel'; viewId: string };                      // from panel header
```

| Source → Target | Effect | Never changes |
|---|---|---|
| item / timelineBar → Calendar slot | create WorkBlock at snapped slot, 60 min | open_at, deadline_at |
| workBlock → Calendar slot | move block, keep duration | item fields |
| item → Timeline day | if item has no dates: `open_at = deadline_at` = that day; if it has dates: move range so `open_at` lands on that day | work blocks |
| panel → panel drop zone | `dockView` | domain data |

Within the Timeline, bar drags are handled by the Timeline itself (horizontal moves); dragging a bar vertically out of the Timeline panel hands off to the `timelineBar` payload for Calendar drops.

Drag feedback: a compact overlay chip with the title; Calendar shows a dashed 60-minute ghost at the snapped slot; Timeline shows a column highlight; docking shows a shaded region. Invalid targets show no preview.

### 6.6 Visual system (FD §23–24)

Tokens in `src/ui/tokens.ts`: background `#FBFBFA`, panel `#FFFFFF`, border `#E9E9E7`, text `#1F1F1F`, muted `#787774`, accent `#2F6FEB` (blocks/bars use accent at 12–16% fill with accent left/right edge for deadlines), danger `#D44C47`. Font Inter (via `@expo-google-fonts/inter`), weights 400/500/600, base 14px. Radius 6px (panels 8px). Shadows only on popovers/drag overlays. Animations ≤150ms, only for drag previews, docking, insert/remove.

### 6.7 Auth UI

`AUTH_MODE` comes from `EXPO_PUBLIC_AUTH_MODE`. Dev: no login; requests send `X-Dev-User` if `EXPO_PUBLIC_DEV_USER` is set. Supabase: login screen with "Continue with Google" / "Continue with Apple" (`signInWithOAuth`), session token attached as Bearer; sign-out in the `⋯` of the top bar.

### 6.8 Test IDs

Stable `testID`s (rendered as `data-testid` on web) used by Playwright:
`panel-{viewId}`, `panel-menu-{viewId}`, `dropbox-input`, `dropbox-filter`, `item-row-{itemId}`, `item-complete-{itemId}`, `timeline-day-{yyyy-mm-dd}`, `timeline-bar-{itemId}`, `timeline-bar-left-{itemId}`, `timeline-bar-right-{itemId}`, `calendar-slot-{yyyy-mm-dd}-{HHmm}`, `calendar-block-{blockId}`, `calendar-block-resize-{blockId}`, `item-detail`, `add-view`.

---

## 7. Testing

- **Go:** `internal/domain` table-driven unit tests; `internal/httpapi` integration tests against a real Postgres test database (`TEST_DATABASE_URL`, migrations applied, tables truncated per test). Must cover: validation failures, PATCH null-vs-absent semantics, completion timestamps, cascade delete, scheduled/unscheduled filters, overlapping range query, workspace default + validation, and cross-user isolation (user B gets 404 on every user-A resource, and list endpoints never leak).
- **Auth:** `SupabaseJWT` tests with a generated ES256/RS256 key and an httptest JWKS server (valid, expired, wrong aud, wrong iss, unknown kid).
- **Frontend:** Vitest for all `src/domain` helpers; React Testing Library (via react-native-web) for Dropbox capture/filter and optimistic rollback.
- **E2E:** Playwright Chromium; `make e2e` starts compose DB on a separate database name, the API (dev auth, fresh random `X-Dev-User` per test for isolation), and `expo export --platform web` served statically. `acceptance.spec.ts` scripts FS §20 literally, using `page.reload()` for steps 16–18. `ux.spec.ts` scripts FD §28. Dates are computed relative to the current week so tests are stable on any day.

---

## 8. Build Phases (agent loop)

| Phase | Work | Runs |
|---|---|---|
| 0 Foundation | Skeleton, compose, Makefile, `.env.example`, migrations, `openapi.yaml`, shared TS types (`app/src/api/types.ts`) | Orchestrator, sequential |
| 1 Backend | domain + validation; store (sqlc); handlers; auth | Parallel with 2 |
| 2 Frontend core | Expo scaffold, tokens/primitives, API client + hooks, domain helpers, shell | Parallel with 1 |
| 3 Views | Dropbox + item detail; Timeline; Calendar (each owns its directory) | Parallel with each other |
| 4 Workspace | Split renderer, dividers, panel menu, duplicate/close/add, docking, persistence | After 3 |
| 5 Cross-view DnD | Shared DndContext, payloads, drop semantics, previews | After 4 |
| 6 Acceptance | Playwright suites; failures become fix tasks | Loop until green |

Per task: implementer subagent (TDD, own worktree) → spec-compliance review → code-quality review → fixes, max 3 review rounds, then escalate to the user. The orchestrator merges to `main`. `openapi.yaml` and `app/src/api/types.ts` are frozen after phase 0; changes go through the orchestrator.

---

## 9. Handoff to User

After Definition of Done: user creates/opens a Supabase project, enables Google and Apple providers, runs `db/migrations` against Supabase Postgres, sets `AUTH_MODE=supabase`, `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `DATABASE_URL`, and `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`, then verifies login manually.
