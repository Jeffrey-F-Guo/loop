# Personal Sprint Planner MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the desktop-web MVP of Personal Sprint Planner: one Item model rendered through Dropbox, Timeline, and Calendar view instances inside a persistent split-pane workspace, backed by a Go API and Postgres.

**Architecture:** Monorepo with a Go HTTP API (`api/`, stdlib routing + pgx + sqlc, goose migrations in `db/migrations/`) and an Expo/React Native Web client (`app/`). The client keeps all domain data in TanStack Query caches shared by every view instance; all drag-and-drop semantics are computed by one pure function (`planDrop`) and executed by one `DndProvider`. Playwright drives the full stack for acceptance.

**Tech Stack:** Go 1.24+ (local 1.27), pgx/v5, sqlc, goose, golang-jwt/v5 + keyfunc/v3; Postgres 16 (Docker); Expo (latest SDK) + TypeScript, react-native-web, TanStack Query v5, Zustand, dnd-kit, date-fns, Vitest + Testing Library; Playwright.

**Spec:** `docs/superpowers/specs/2026-10-03-personal-sprint-planner-mvp-design.md` (read it first; it in turn references `personal-sprint-planner-specs/*.md` for product behavior).

## Deviation from spec §8 phase table

The spec listed "Cross-view DnD" as its own phase after the workspace. This plan moves the DnD *foundation* (payload types, `planDrop`, `DndProvider`) into Phase 2 (Task 12), so each view task wires its own draggables, drop targets, and previews. The spec's phase 5 work is therefore spread across Tasks 12, 14, 16, 17, 19 and verified end-to-end in Tasks 20–21. Behavior is unchanged.

One more small deviation from spec §6.3: each view's filter/mode/navigation controls sit in a toolbar row directly under the panel header instead of inside the header itself. The header keeps the title and the `⋯` menu, and serves as the drag handle for docking.

## Global Constraints

Every task's requirements implicitly include this section.

- Go module path: `github.com/Jeffrey-F-Guo/ai-calendar/api`. Go tools (goose, sqlc) are declared with `go get -tool` and run via `go tool <name>`.
- Postgres 16 via `docker compose`, host port **5433**. Databases: `sprint` (dev), `sprint_test` (Go tests), `sprint_e2e` (Playwright). User/password `sprint`/`sprint`.
- Ports: API `:8080`, Expo web dev `:8081`, e2e static app `:8091`, e2e API `:8090`.
- Server stores and returns UTC RFC 3339 timestamps. The client converts to local time. Weeks start **Monday**.
- Item title: trimmed, 1–500 characters. WorkBlock minimum duration **15 minutes**. Calendar snap **15 minutes**. Default dropped block **60 minutes**. Calendar scale **48px per hour**.
- Day-granular date edits set `open_at` to local **00:00** and `deadline_at` to local **23:59**.
- Layout limits: version 1, max depth 8, max 24 views, split nodes ≥ 2 children, sizes > 0 summing to 1 ± 0.01, unique node ids, body ≤ 64 KB.
- Every SQL query is scoped by `user_id`. A resource owned by another user returns **404** `not_found`. `user_id` is never included in API responses.
- Error body: `{"error":{"code":"...","message":"...","field":"..."}}` with codes `validation_failed` (400), `unauthorized` (401), `not_found` (404), `internal` (500).
- Frontend never calls Supabase tables. `@supabase/supabase-js` is used for auth only.
- `api-contract/openapi.yaml` and `app/src/api/types.ts` are **frozen after Task 3**. A task that believes it needs a contract change stops and reports back instead of editing them.
- Everything rendered under `app/src/workspace/Workspace.web.tsx` is web-only and may use DOM elements (`div`, `input`, pointer events). The shell outside it (App, AuthGate, LoginScreen, TopBar) uses React Native primitives.
- All visual values come from `app/src/ui/tokens.ts`. Light theme only.
- Frontend tests run with `TZ=America/Los_Angeles`. Playwright uses `timezoneId: 'America/Los_Angeles'` and the runner also sets `TZ=America/Los_Angeles`.
- Commits: conventional prefix (`feat:`, `fix:`, `test:`, `chore:`, `docs:`), each ending with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Test hooks (shared contract between view tasks and Playwright)

| Hook | Where | Extra attributes |
|---|---|---|
| `panel-{viewId}` | panel root | `data-view-type` = `dropbox`/`timeline`/`calendar` |
| `panel-header-{viewId}` | panel header (dock drag handle) | |
| `panel-menu-{viewId}` | panel `⋯` button | |
| `panel-menu-duplicate`, `panel-menu-close` | panel menu items | |
| `dock-zone-{viewId}-{edge}` | dock zones, edge ∈ left/right/top/bottom/center | |
| `add-item`, `add-view`, `add-view-{type}` | top bar | |
| `dropbox-input`, `dropbox-filter`, `dropbox-filter-option-{filter}`, `dropbox-empty` | Dropbox | `dropbox-filter` has `data-filter` |
| `item-row-{itemId}`, `item-complete-{itemId}` | Dropbox row | |
| `item-detail`, `item-title`, `item-description`, `item-open-date`, `item-deadline-date`, `item-deadline-time`, `item-date-error`, `item-block-{blockId}`, `item-block-delete-{blockId}`, `item-delete`, `item-done` | Item detail | |
| `timeline-prev`, `timeline-next`, `timeline-today`, `timeline-empty` | Timeline | |
| `timeline-day-{yyyy-MM-dd}` | Timeline day column (drop target) | |
| `timeline-bar-{itemId}` | Timeline bar | `data-open-date`, `data-deadline-date` (local `yyyy-MM-dd`) |
| `timeline-bar-left-{itemId}`, `timeline-bar-right-{itemId}` | bar edge handles | |
| `timeline-marker-{itemId}` | deadline-only marker | `data-deadline-date` |
| `calendar-prev`, `calendar-next`, `calendar-today`, `calendar-mode-week`, `calendar-mode-day`, `calendar-empty` | Calendar | |
| `calendar-day-{yyyy-MM-dd}` | Calendar day column (drop target) | |
| `calendar-slot-{yyyy-MM-dd}-{HHmm}` | 15-minute slot cell | |
| `calendar-block-{blockId}` | WorkBlock | `data-start`, `data-end` (local `yyyy-MM-dd'T'HH:mm`) |
| `calendar-block-resize-{blockId}` | resize handle | |
| `calendar-ghost` | drop preview | |
| `toast` | toast message | |

React Native components set `testID` (rendered as `data-testid` on web). DOM elements set `data-testid` directly.

## Review Focus

The inputs and failure modes the spec implies but that are easy to break. Each has a test in the owning task.

1. **Rapid capture:** pressing Enter several times quickly (before the server answers) must create every item, in order, with none lost. Whitespace-only input must create nothing. Tested in Task 14.
2. **Failed mutation:** if the server rejects or the network fails during a drag or edit, the UI must revert and show a toast, and no item may disappear. Tested in Task 11.
3. **Delete with scheduled blocks:** deleting an Item must remove its blocks from every Calendar instance immediately, not after a refetch. Tested in Task 11.
4. **Timeline edge dragged past the other edge:** dragging the left edge beyond the deadline, or the right edge before the open date, must clamp to a one-day range and never send `open_at > deadline_at`. Tested in Tasks 9 and 16.
5. **Bad stored layout:** a stored workspace layout that fails client validation must fall back to the default layout (and be re-saved) instead of rendering a blank screen. Tested in Task 13.

Also pinned: DST-safe local time math (Task 9), cross-user isolation on every endpoint (Tasks 6–7).

## File Map

```
AI-Calendar/
  .gitignore  .env.example  docker-compose.yml  Makefile  README.md
  db/init/01-create-dbs.sql                  creates sprint_test, sprint_e2e
  db/migrations/00001_init.sql               items, work_blocks, workspaces
  api-contract/openapi.yaml                  frozen contract
  api/
    go.mod  sqlc.yaml
    cmd/server/main.go                       config, wiring, graceful shutdown
    internal/domain/opt.go                   Opt[T] (absent vs null vs value)
    internal/domain/errors.go                ValidationError
    internal/domain/item.go                  Item, NewItem, ItemPatch, rules
    internal/domain/workblock.go             WorkBlock, NewWorkBlock, WorkBlockPatch, rules
    internal/domain/layout.go                ValidateLayout, DefaultLayout, Workspace
    internal/domain/default_layout.json
    internal/store/queries/*.sql             sqlc input
    internal/store/db/                       sqlc output (generated, committed)
    internal/store/store.go                  Store wrapper → domain types, ErrNotFound
    internal/testdb/testdb.go                test DB pool + truncate
    internal/auth/auth.go                    Authenticator, middleware, context helpers, DevAuth
    internal/auth/supabase.go                SupabaseJWT
    internal/httpapi/server.go               routing + middleware
    internal/httpapi/respond.go              JSON + error helpers
    internal/httpapi/items.go  workblocks.go  workspace.go
  app/
    package.json  app.json  tsconfig.json  vitest.config.ts  vitest.setup.ts  App.tsx
    src/ui/tokens.ts  globalStyles.ts  Menu.tsx  Toast.tsx  toastStore.ts  itemDetailStore.ts  captureBus.ts
    src/api/types.ts  config.ts  client.ts  ApiProvider.tsx  keys.ts  items.ts  workBlocks.ts  workspace.ts  blockCache.ts
    src/domain/time.ts  scheduling.ts  timeline.ts  layout.ts
    src/dnd/types.ts  planDrop.ts  dragStore.ts  DndProvider.tsx  hooks.ts  usePreviewAction.ts
    src/auth/AuthGate.tsx  LoginScreen.tsx  supabase.ts
    src/app/Shell.tsx  TopBar.tsx  AddViewMenu.tsx
    src/workspace/Workspace.web.tsx  Workspace.tsx  LayoutNodeView.tsx  Panel.tsx  PanelMenu.tsx  Divider.tsx  DockZones.tsx  ViewHost.tsx  viewTypes.ts  useWorkspaceLayout.ts  panelTitle.ts
    src/views/dropbox/DropboxView.tsx  CaptureInput.tsx  ItemRow.tsx  FilterMenu.tsx  itemMeta.ts
    src/views/item/ItemDetailHost.tsx  ItemDetail.tsx
    src/views/timeline/TimelineView.tsx  TimelineBar.tsx  geometry.ts
    src/views/calendar/CalendarView.tsx  DayColumn.tsx  BlockView.tsx  lanes.ts
    src/test/fakeApi.ts  render.tsx
  e2e/
    package.json  playwright.config.ts  helpers.ts  acceptance.spec.ts  ux.spec.ts  serve-app.mjs
```

## Execution Order and Parallelism

```
Phase 0 (orchestrator, sequential):   T1 → T2 → T3
Phase 1 backend  ┐ parallel tracks     T4 → T5 → T6 → T7 → T8
Phase 2 frontend ┘                     (T9 ∥ T10) → T11 → T12 → T13
Phase 3 views (parallel, after T13):   T14 ∥ T15 ∥ T16 ∥ T17
Phase 4 workspace:                     T18 → T19
Phase 5 acceptance (needs all):        T20 → T21
```

Parallel tasks touch disjoint files. Phase 3 tasks each replace only their own stub files created in Task 13.

---
## Phase 0: Foundation (orchestrator)

### Task 1: Repo, database, and Go module foundation

**Files:**
- Create: `.gitignore`, `.env.example`, `docker-compose.yml`, `Makefile`, `db/init/01-create-dbs.sql`, `db/migrations/00001_init.sql`, `api/go.mod`

**Interfaces:**
- Produces: `make db-up`, `make migrate`, `make migrate-test`, `make sqlc`, `make api`, `make app`, `make dev`, `make test-api`, `make test-app`, `make test`; tables `items`, `work_blocks`, `workspaces` exactly as spec §4.

- [ ] **Step 1: Write `.gitignore`**

```gitignore
.DS_Store
.env
node_modules/
app/.expo/
app/dist/
app/web-build/
e2e/test-results/
e2e/playwright-report/
api/bin/
```

- [ ] **Step 2: Write `docker-compose.yml` and `db/init/01-create-dbs.sql`**

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: sprint
      POSTGRES_PASSWORD: sprint
      POSTGRES_DB: sprint
    ports:
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./db/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sprint -d sprint"]
      interval: 2s
      timeout: 3s
      retries: 30
volumes:
  pgdata:
```

```sql
-- db/init/01-create-dbs.sql (runs once, on first container start)
CREATE DATABASE sprint_test;
CREATE DATABASE sprint_e2e;
```

- [ ] **Step 3: Write the migration `db/migrations/00001_init.sql`**

```sql
-- +goose Up
CREATE TABLE items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  description  TEXT NULL,
  open_at      TIMESTAMPTZ NULL,
  deadline_at  TIMESTAMPTZ NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
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

-- +goose Down
DROP TABLE workspaces;
DROP TABLE work_blocks;
DROP TABLE items;
```

- [ ] **Step 4: Initialize the Go module with tool dependencies**

```bash
mkdir -p api && cd api
go mod init github.com/Jeffrey-F-Guo/ai-calendar/api
go get -tool github.com/pressly/goose/v3/cmd/goose@latest
go get -tool github.com/sqlc-dev/sqlc/cmd/sqlc@latest
```

`sqlc` builds with cgo and can take a few minutes the first time. If `go get -tool` for sqlc fails to build, run `brew install sqlc` instead and use `SQLC=sqlc make sqlc` (the Makefile below supports that override).

- [ ] **Step 5: Write `Makefile`**

```make
SHELL := /bin/bash
DATABASE_URL      ?= postgres://sprint:sprint@localhost:5433/sprint?sslmode=disable
TEST_DATABASE_URL ?= postgres://sprint:sprint@localhost:5433/sprint_test?sslmode=disable
E2E_DATABASE_URL  ?= postgres://sprint:sprint@localhost:5433/sprint_e2e?sslmode=disable
SQLC              ?= go tool sqlc
GOOSE             := cd api && go tool goose -dir ../db/migrations postgres

.PHONY: db-up db-down migrate migrate-test migrate-e2e sqlc api app dev test-api test-app test

db-up:
	docker compose up -d --wait db

db-down:
	docker compose down

migrate: db-up
	$(GOOSE) "$(DATABASE_URL)" up

migrate-test: db-up
	$(GOOSE) "$(TEST_DATABASE_URL)" up

migrate-e2e: db-up
	$(GOOSE) "$(E2E_DATABASE_URL)" up

sqlc:
	cd api && $(SQLC) generate

api:
	cd api && DATABASE_URL="$(DATABASE_URL)" AUTH_MODE=dev go run ./cmd/server

app:
	cd app && npx expo start --web --port 8081

dev: migrate
	$(MAKE) -j2 api app

test-api: migrate-test
	cd api && TEST_DATABASE_URL="$(TEST_DATABASE_URL)" go test -p 1 ./...

test-app:
	cd app && npm test

test: test-api test-app
```

`go test -p 1` is required: all Go packages share one test database and truncate it between tests.

- [ ] **Step 6: Write `.env.example`**

```bash
# API
DATABASE_URL=postgres://sprint:sprint@localhost:5433/sprint?sslmode=disable
PORT=8080
APP_ENV=development          # "production" forbids AUTH_MODE=dev
AUTH_MODE=dev                # dev | supabase
CORS_ORIGINS=http://localhost:8081
SUPABASE_URL=                # e.g. https://abcd.supabase.co (AUTH_MODE=supabase)
SUPABASE_JWKS_URL=           # e.g. https://abcd.supabase.co/auth/v1/.well-known/jwks.json

# App (Expo inlines EXPO_PUBLIC_* at build time)
EXPO_PUBLIC_API_URL=http://localhost:8080
EXPO_PUBLIC_AUTH_MODE=dev
EXPO_PUBLIC_DEV_USER=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 7: Verify the database comes up and migrates**

Run: `make migrate && make migrate-test && make migrate-e2e && psql "postgres://sprint:sprint@localhost:5433/sprint" -c '\dt'`
Expected: goose reports `OK 00001_init.sql` for each database (or "no migrations to run" on reruns); `\dt` lists `goose_db_version`, `items`, `work_blocks`, `workspaces`.

If the `sprint_test` database does not exist (volume created before the init script existed), run `make db-down && docker volume rm ai-calendar_pgdata && make db-up` and retry.

- [ ] **Step 8: Commit**

```bash
git add .gitignore .env.example docker-compose.yml Makefile db api/go.mod api/go.sum
git commit -m "chore: add database, migrations, Makefile, and Go module skeleton

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Expo app scaffold, test tooling, and design tokens

**Files:**
- Create: `app/` (via create-expo-app), `app/vitest.config.ts`, `app/vitest.setup.ts`, `app/src/ui/tokens.ts`, `app/src/ui/globalStyles.ts`, `app/src/test/setup.test.tsx`
- Modify: `app/package.json` (scripts), `app/app.json` (web config), `app/App.tsx`

**Interfaces:**
- Produces: `npm test` (Vitest, jsdom, `react-native` aliased to `react-native-web`, `.web.tsx` resolved first); `tokens` object; `injectGlobalStyles(): void`.

- [ ] **Step 1: Scaffold and install dependencies**

```bash
npx create-expo-app@latest app --template blank-typescript
rm -rf app/.git   # only if create-expo-app created a nested repo
cd app
npx expo install react-dom react-native-web @expo/metro-runtime
npm install @tanstack/react-query zustand @dnd-kit/core date-fns @supabase/supabase-js
npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 2: Configure scripts in `app/package.json`**

Add/replace these entries under `"scripts"` (keep the generated `start`/`android`/`ios` entries):

```json
"web": "expo start --web --port 8081",
"export:web": "expo export --platform web",
"test": "TZ=America/Los_Angeles vitest run",
"test:watch": "TZ=America/Los_Angeles vitest",
"typecheck": "tsc --noEmit"
```

In `app/app.json`, set `expo.web` to `{ "bundler": "metro", "output": "single" }` and `expo.name` to `"Personal Sprint"`.

- [ ] **Step 3: Write Vitest config**

`app/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { 'react-native': 'react-native-web' },
    extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.js', '.js', '.json'],
  },
  define: {
    __DEV__: 'true',
    'process.env.EXPO_OS': '"web"',
  },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

`app/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom may lack PointerEvent; component tests fire pointer events with clientX/clientY.
if (typeof window !== 'undefined' && !('PointerEvent' in window)) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent = PointerEventPolyfill;
}
```

- [ ] **Step 4: Write the failing smoke test**

`app/src/test/setup.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { Text, View } from 'react-native';
import { describe, expect, it } from 'vitest';
import { tokens } from '../ui/tokens';

describe('test environment', () => {
  it('renders react-native primitives through react-native-web', () => {
    render(
      <View testID="root">
        <Text>hello</Text>
      </View>,
    );
    expect(screen.getByTestId('root')).toHaveTextContent('hello');
  });

  it('runs in the Los Angeles time zone', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(480);
  });

  it('exposes design tokens', () => {
    expect(tokens.color.accent).toBe('#2F6FEB');
    expect(tokens.radius.md).toBe(6);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `cd app && npm test`
Expected: FAIL, `Cannot find module '../ui/tokens'` (the first two tests pass once tokens exist).

- [ ] **Step 6: Write tokens and global styles**

`app/src/ui/tokens.ts`:

```ts
export const tokens = {
  color: {
    bg: '#FBFBFA',
    panel: '#FFFFFF',
    border: '#E9E9E7',
    borderStrong: '#D9D9D6',
    text: '#1F1F1F',
    muted: '#787774',
    faint: '#A5A5A2',
    hover: '#F1F1EF',
    accent: '#2F6FEB',
    accentSoft: 'rgba(47, 111, 235, 0.14)',
    accentFaint: 'rgba(47, 111, 235, 0.07)',
    danger: '#D44C47',
  },
  font: {
    family: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    size: { xs: 11, sm: 12, md: 14, lg: 16 },
    weight: { regular: '400', medium: '500', semibold: '600' },
  },
  radius: { sm: 4, md: 6, lg: 8 },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 },
  shadow: {
    popover: '0 8px 24px rgba(15, 15, 15, 0.12), 0 0 0 1px rgba(15, 15, 15, 0.05)',
    drag: '0 4px 12px rgba(15, 15, 15, 0.16)',
  },
  motion: { fast: '120ms', base: '150ms' },
} as const;
```

`app/src/ui/globalStyles.ts`:

```ts
import { tokens } from './tokens';

const STYLE_ID = 'sprint-global-styles';

export function injectGlobalStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap';
  document.head.appendChild(font);
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    html, body, #root { height: 100%; margin: 0; }
    body {
      background: ${tokens.color.bg};
      color: ${tokens.color.text};
      font-family: ${tokens.font.family};
      font-size: ${tokens.font.size.md}px;
      -webkit-font-smoothing: antialiased;
    }
    * { box-sizing: border-box; }
    input, textarea, button, select { font: inherit; color: inherit; }
    button { cursor: pointer; }
  `;
  document.head.appendChild(style);
}
```

Replace `app/App.tsx` with a placeholder (Task 13 replaces it):

```tsx
import { Text, View } from 'react-native';
import { injectGlobalStyles } from './src/ui/globalStyles';

injectGlobalStyles();

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Personal Sprint</Text>
    </View>
  );
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `cd app && npm test && npm run typecheck`
Expected: 3 tests PASS; `tsc` exits 0.

- [ ] **Step 8: Verify the web build boots**

Run: `cd app && npx expo export --platform web`
Expected: exits 0 and writes `app/dist/index.html`.

- [ ] **Step 9: Commit**

```bash
git add app
git commit -m "chore: scaffold Expo app with Vitest and design tokens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: API contract (frozen after this task)

**Files:**
- Create: `api-contract/openapi.yaml`, `app/src/api/types.ts`

**Interfaces:**
- Produces: every request/response type used by both tracks. Field names are snake_case on the wire and in `types.ts` (no client-side renaming).

- [ ] **Step 1: Write `app/src/api/types.ts`**

```ts
// Wire types for /api/v1. Frozen after Task 3; see api-contract/openapi.yaml.

export type ItemStatus = 'active' | 'completed';

export interface Item {
  id: string;
  title: string;
  description: string | null;
  open_at: string | null;
  deadline_at: string | null;
  status: ItemStatus;
  work_block_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CreateItemInput {
  title: string;
  description?: string | null;
  open_at?: string | null;
  deadline_at?: string | null;
}

export type UpdateItemInput = Partial<{
  title: string;
  description: string | null;
  open_at: string | null;
  deadline_at: string | null;
  status: ItemStatus;
}>;

export interface WorkBlock {
  id: string;
  item_id: string;
  start_at: string;
  end_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkBlockInput {
  item_id: string;
  start_at: string;
  end_at: string;
}

export type UpdateWorkBlockInput = Partial<{ start_at: string; end_at: string }>;

export type DropboxFilter = 'all' | 'scheduled' | 'unscheduled' | 'completed';
export type CalendarMode = 'week' | 'day';

export type ViewInstance =
  | { type: 'dropbox'; config: { filter: DropboxFilter } }
  | { type: 'timeline'; config: Record<string, never> }
  | { type: 'calendar'; config: { mode: CalendarMode } };

export type ViewType = ViewInstance['type'];

export interface SplitNode {
  kind: 'split';
  id: string;
  direction: 'row' | 'column';
  children: LayoutNode[];
  sizes: number[];
}

export interface ViewNode {
  kind: 'view';
  id: string;
  view: ViewInstance;
}

export type LayoutNode = SplitNode | ViewNode;

export interface Layout {
  version: 1;
  root: LayoutNode | null;
}

export interface WorkspaceResponse {
  layout: Layout;
  updated_at: string;
}

export type ApiErrorCode = 'validation_failed' | 'unauthorized' | 'not_found' | 'internal';

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; field?: string };
}

export interface ItemsResponse {
  items: Item[];
}

export interface WorkBlocksResponse {
  work_blocks: WorkBlock[];
}
```

- [ ] **Step 2: Write `api-contract/openapi.yaml`**

```yaml
openapi: 3.1.0
info:
  title: Personal Sprint Planner API
  version: 0.1.0
servers:
  - url: http://localhost:8080/api/v1
security:
  - bearer: []
  - devUser: []
paths:
  /items:
    post:
      operationId: createItem
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateItemInput' }
      responses:
        '201': { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/Item' } } } }
        '400': { $ref: '#/components/responses/Error' }
        '401': { $ref: '#/components/responses/Error' }
    get:
      operationId: listItems
      parameters:
        - { name: status, in: query, schema: { type: string, enum: [active, completed, all], default: active } }
        - { name: scheduling, in: query, schema: { type: string, enum: [all, scheduled, unscheduled], default: all } }
      responses:
        '200':
          description: OK (ordered by created_at DESC)
          content:
            application/json:
              schema:
                type: object
                required: [items]
                properties: { items: { type: array, items: { $ref: '#/components/schemas/Item' } } }
        '400': { $ref: '#/components/responses/Error' }
  /items/{id}:
    parameters: [{ $ref: '#/components/parameters/Id' }]
    get:
      operationId: getItem
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/Item' } } } }
        '404': { $ref: '#/components/responses/Error' }
    patch:
      operationId: updateItem
      description: >
        Partial update. Absent fields are untouched; explicit null clears nullable fields.
        status=completed sets completed_at=now (unless already completed); status=active clears completed_at.
        open_at <= deadline_at is validated on the merged result.
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateItemInput' }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/Item' } } } }
        '400': { $ref: '#/components/responses/Error' }
        '404': { $ref: '#/components/responses/Error' }
    delete:
      operationId: deleteItem
      description: Deletes the item and all of its work blocks.
      responses:
        '204': { description: Deleted }
        '404': { $ref: '#/components/responses/Error' }
  /work-blocks:
    post:
      operationId: createWorkBlock
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateWorkBlockInput' }
      responses:
        '201': { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/WorkBlock' } } } }
        '400': { $ref: '#/components/responses/Error' }
        '404': { description: Item not found or not owned, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    get:
      operationId: listWorkBlocks
      description: Requires start+end (blocks overlapping [start, end)), item_id, or both.
      parameters:
        - { name: start, in: query, schema: { type: string, format: date-time } }
        - { name: end, in: query, schema: { type: string, format: date-time } }
        - { name: item_id, in: query, schema: { type: string, format: uuid } }
      responses:
        '200':
          description: OK (ordered by start_at)
          content:
            application/json:
              schema:
                type: object
                required: [work_blocks]
                properties: { work_blocks: { type: array, items: { $ref: '#/components/schemas/WorkBlock' } } }
        '400': { $ref: '#/components/responses/Error' }
  /work-blocks/{id}:
    parameters: [{ $ref: '#/components/parameters/Id' }]
    get:
      operationId: getWorkBlock
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/WorkBlock' } } } }
        '404': { $ref: '#/components/responses/Error' }
    patch:
      operationId: updateWorkBlock
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateWorkBlockInput' }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/WorkBlock' } } } }
        '400': { $ref: '#/components/responses/Error' }
        '404': { $ref: '#/components/responses/Error' }
    delete:
      operationId: deleteWorkBlock
      responses:
        '204': { description: Deleted }
        '404': { $ref: '#/components/responses/Error' }
  /workspace:
    get:
      operationId: getWorkspace
      description: Returns the user's layout, creating the default layout on first access.
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/Workspace' } } } }
    put:
      operationId: putWorkspace
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [layout]
              additionalProperties: false
              properties: { layout: { $ref: '#/components/schemas/Layout' } }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/Workspace' } } } }
        '400': { $ref: '#/components/responses/Error' }
components:
  securitySchemes:
    bearer: { type: http, scheme: bearer, bearerFormat: JWT }
    devUser: { type: apiKey, in: header, name: X-Dev-User, description: AUTH_MODE=dev only }
  parameters:
    Id: { name: id, in: path, required: true, schema: { type: string, format: uuid } }
  responses:
    Error:
      description: Error
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
  schemas:
    Error:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message]
          properties:
            code: { type: string, enum: [validation_failed, unauthorized, not_found, internal] }
            message: { type: string }
            field: { type: string }
    Item:
      type: object
      required: [id, title, description, open_at, deadline_at, status, work_block_count, created_at, updated_at, completed_at]
      properties:
        id: { type: string, format: uuid }
        title: { type: string, minLength: 1, maxLength: 500 }
        description: { type: [string, 'null'] }
        open_at: { type: [string, 'null'], format: date-time }
        deadline_at: { type: [string, 'null'], format: date-time }
        status: { type: string, enum: [active, completed] }
        work_block_count: { type: integer, minimum: 0 }
        created_at: { type: string, format: date-time }
        updated_at: { type: string, format: date-time }
        completed_at: { type: [string, 'null'], format: date-time }
    CreateItemInput:
      type: object
      required: [title]
      additionalProperties: false
      properties:
        title: { type: string }
        description: { type: [string, 'null'] }
        open_at: { type: [string, 'null'], format: date-time }
        deadline_at: { type: [string, 'null'], format: date-time }
    UpdateItemInput:
      type: object
      additionalProperties: false
      properties:
        title: { type: string }
        description: { type: [string, 'null'] }
        open_at: { type: [string, 'null'], format: date-time }
        deadline_at: { type: [string, 'null'], format: date-time }
        status: { type: string, enum: [active, completed] }
    WorkBlock:
      type: object
      required: [id, item_id, start_at, end_at, created_at, updated_at]
      properties:
        id: { type: string, format: uuid }
        item_id: { type: string, format: uuid }
        start_at: { type: string, format: date-time }
        end_at: { type: string, format: date-time }
        created_at: { type: string, format: date-time }
        updated_at: { type: string, format: date-time }
    CreateWorkBlockInput:
      type: object
      required: [item_id, start_at, end_at]
      additionalProperties: false
      properties:
        item_id: { type: string, format: uuid }
        start_at: { type: string, format: date-time }
        end_at: { type: string, format: date-time, description: 'end_at - start_at >= 15 minutes' }
    UpdateWorkBlockInput:
      type: object
      additionalProperties: false
      properties:
        start_at: { type: string, format: date-time }
        end_at: { type: string, format: date-time }
    Workspace:
      type: object
      required: [layout, updated_at]
      properties:
        layout: { $ref: '#/components/schemas/Layout' }
        updated_at: { type: string, format: date-time }
    Layout:
      type: object
      required: [version, root]
      additionalProperties: false
      properties:
        version: { const: 1 }
        root: { oneOf: [{ $ref: '#/components/schemas/LayoutNode' }, { type: 'null' }] }
    LayoutNode:
      oneOf:
        - $ref: '#/components/schemas/SplitNode'
        - $ref: '#/components/schemas/ViewNode'
      discriminator: { propertyName: kind }
    SplitNode:
      type: object
      required: [kind, id, direction, children, sizes]
      additionalProperties: false
      properties:
        kind: { const: split }
        id: { type: string, minLength: 1 }
        direction: { type: string, enum: [row, column] }
        children: { type: array, minItems: 2, items: { $ref: '#/components/schemas/LayoutNode' } }
        sizes: { type: array, items: { type: number, exclusiveMinimum: 0 } }
    ViewNode:
      type: object
      required: [kind, id, view]
      additionalProperties: false
      properties:
        kind: { const: view }
        id: { type: string, minLength: 1 }
        view:
          oneOf:
            - type: object
              required: [type, config]
              additionalProperties: false
              properties:
                type: { const: dropbox }
                config:
                  type: object
                  required: [filter]
                  additionalProperties: false
                  properties: { filter: { type: string, enum: [all, scheduled, unscheduled, completed] } }
            - type: object
              required: [type, config]
              additionalProperties: false
              properties:
                type: { const: timeline }
                config: { type: object, additionalProperties: false }
            - type: object
              required: [type, config]
              additionalProperties: false
              properties:
                type: { const: calendar }
                config:
                  type: object
                  required: [mode]
                  additionalProperties: false
                  properties: { mode: { type: string, enum: [week, day] } }
```

- [ ] **Step 3: Validate both artifacts**

Run: `npx --yes @redocly/cli@latest lint api-contract/openapi.yaml --skip-rule operation-4xx-response --skip-rule info-license --skip-rule no-server-example.com`
Expected: no errors (warnings acceptable).

Run: `cd app && npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add api-contract app/src/api/types.ts
git commit -m "docs: add frozen API contract and shared wire types

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Phase 1: Backend track

All backend tasks run from `api/`. Integration tests need the DB: `make test-api` (from repo root) runs migrations on `sprint_test` and then `go test -p 1 ./...`. To run one package: `cd api && TEST_DATABASE_URL=postgres://sprint:sprint@localhost:5433/sprint_test?sslmode=disable go test -p 1 ./internal/httpapi/ -run TestName -v`.

### Task 4: Domain types and validation

**Files:**
- Create: `api/internal/domain/opt.go`, `errors.go`, `item.go`, `workblock.go`, `layout.go`, `default_layout.json`
- Test: `api/internal/domain/item_test.go`, `workblock_test.go`, `layout_test.go`

**Interfaces:**
- Produces (package `domain`):
  - `type Opt[T any] struct { Set, Null bool; Value T }` with `UnmarshalJSON`; `Some[T](v T) Opt[T]`; `Null[T]() Opt[T]`
  - `type ValidationError struct { Field, Message string }` (`*ValidationError` implements `error`)
  - `type ItemStatus string`; `StatusActive`, `StatusCompleted`; `MaxTitleLength = 500`
  - `type Item struct` (JSON per contract; `UserID` tagged `json:"-"`)
  - `type NewItem struct { Title string; Description *string; OpenAt, DeadlineAt *time.Time }`; `func (n NewItem) Validate() (NewItem, error)`
  - `type ItemPatch struct { Title Opt[string]; Description Opt[string]; OpenAt, DeadlineAt Opt[time.Time]; Status Opt[ItemStatus] }`; `func ApplyItemPatch(it Item, p ItemPatch, now time.Time) (Item, error)`
  - `MinBlockDuration = 15 * time.Minute`; `type WorkBlock struct`; `type NewWorkBlock struct { ItemID uuid.UUID; StartAt, EndAt time.Time }`; `func (n NewWorkBlock) Validate() (NewWorkBlock, error)`; `type WorkBlockPatch struct { StartAt, EndAt Opt[time.Time] }`; `func ApplyWorkBlockPatch(b WorkBlock, p WorkBlockPatch) (WorkBlock, error)`
  - `type Workspace struct { Layout json.RawMessage; UpdatedAt time.Time }`; `func ValidateLayout(raw json.RawMessage) error`; `func DefaultLayout() json.RawMessage`

- [ ] **Step 1: Add the uuid dependency**

Run: `cd api && go get github.com/google/uuid`

- [ ] **Step 2: Write the failing item tests**

`api/internal/domain/item_test.go`:

```go
package domain

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

var (
	mon = time.Date(2026, 10, 5, 7, 0, 0, 0, time.UTC)
	fri = time.Date(2026, 10, 10, 6, 59, 0, 0, time.UTC)
	now = time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)
)

func assertField(t *testing.T, err error, field string) {
	t.Helper()
	var ve *ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("want ValidationError on %q, got %v", field, err)
	}
	if ve.Field != field {
		t.Fatalf("want field %q, got %q (%s)", field, ve.Field, ve.Message)
	}
}

func TestNewItemValidate(t *testing.T) {
	tests := []struct {
		name      string
		in        NewItem
		wantTitle string
		wantField string
	}{
		{"trims title", NewItem{Title: "  Physics  "}, "Physics", ""},
		{"blank title", NewItem{Title: "   "}, "", "title"},
		{"500 runes ok", NewItem{Title: strings.Repeat("é", 500)}, strings.Repeat("é", 500), ""},
		{"501 runes rejected", NewItem{Title: strings.Repeat("a", 501)}, "", "title"},
		{"open after deadline", NewItem{Title: "x", OpenAt: &fri, DeadlineAt: &mon}, "", "open_at"},
		{"open equals deadline", NewItem{Title: "x", OpenAt: &mon, DeadlineAt: &mon}, "x", ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.in.Validate()
			if tc.wantField != "" {
				assertField(t, err, tc.wantField)
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.Title != tc.wantTitle {
				t.Fatalf("title = %q, want %q", got.Title, tc.wantTitle)
			}
		})
	}
}

func decodePatch(t *testing.T, js string) ItemPatch {
	t.Helper()
	var p ItemPatch
	if err := json.Unmarshal([]byte(js), &p); err != nil {
		t.Fatalf("decode patch: %v", err)
	}
	return p
}

func TestApplyItemPatch(t *testing.T) {
	desc := "Problems 1-8"
	earlier := now.Add(-time.Hour)
	base := Item{Title: "Physics", Description: &desc, DeadlineAt: &mon, Status: StatusActive}
	completed := Item{Title: "Done thing", Status: StatusCompleted, CompletedAt: &earlier}

	t.Run("empty patch changes nothing", func(t *testing.T) {
		got, err := ApplyItemPatch(base, decodePatch(t, `{}`), now)
		if err != nil || got.Title != "Physics" || got.Description == nil || *got.Description != desc {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("absent description untouched, title trimmed", func(t *testing.T) {
		got, err := ApplyItemPatch(base, decodePatch(t, `{"title":"  New  "}`), now)
		if err != nil || got.Title != "New" || got.Description == nil {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("null description clears it", func(t *testing.T) {
		got, err := ApplyItemPatch(base, decodePatch(t, `{"description":null}`), now)
		if err != nil || got.Description != nil {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("null title rejected", func(t *testing.T) {
		_, err := ApplyItemPatch(base, decodePatch(t, `{"title":null}`), now)
		assertField(t, err, "title")
	})
	t.Run("complete sets completed_at", func(t *testing.T) {
		got, err := ApplyItemPatch(base, decodePatch(t, `{"status":"completed"}`), now)
		if err != nil || got.Status != StatusCompleted || got.CompletedAt == nil || !got.CompletedAt.Equal(now) {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("re-completing keeps original completed_at", func(t *testing.T) {
		got, err := ApplyItemPatch(completed, decodePatch(t, `{"status":"completed"}`), now)
		if err != nil || !got.CompletedAt.Equal(earlier) {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("reopen clears completed_at", func(t *testing.T) {
		got, err := ApplyItemPatch(completed, decodePatch(t, `{"status":"active"}`), now)
		if err != nil || got.Status != StatusActive || got.CompletedAt != nil {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("unknown status rejected", func(t *testing.T) {
		_, err := ApplyItemPatch(base, decodePatch(t, `{"status":"done"}`), now)
		assertField(t, err, "status")
	})
	t.Run("open after existing deadline rejected on merged result", func(t *testing.T) {
		_, err := ApplyItemPatch(base, decodePatch(t, `{"open_at":"2026-10-09T00:00:00Z"}`), now)
		assertField(t, err, "open_at")
	})
	t.Run("null deadline clears it", func(t *testing.T) {
		got, err := ApplyItemPatch(base, decodePatch(t, `{"deadline_at":null}`), now)
		if err != nil || got.DeadlineAt != nil {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("times are normalized to UTC", func(t *testing.T) {
		got, err := ApplyItemPatch(Item{Title: "x", Status: StatusActive},
			decodePatch(t, `{"open_at":"2026-10-05T00:00:00-07:00"}`), now)
		if err != nil || got.OpenAt.Location() != time.UTC || got.OpenAt.Hour() != 7 {
			t.Fatalf("got %v, %v", got.OpenAt, err)
		}
	})
}
```

- [ ] **Step 3: Run to verify failure**

Run: `cd api && go test ./internal/domain/`
Expected: FAIL to compile (`undefined: NewItem`, etc.).

- [ ] **Step 4: Implement `opt.go`, `errors.go`, `item.go`**

`api/internal/domain/opt.go`:

```go
package domain

import (
	"bytes"
	"encoding/json"
)

// Opt distinguishes an absent JSON field (Set=false), an explicit null
// (Set=true, Null=true), and a present value. encoding/json only calls
// UnmarshalJSON for keys that are present, so absent fields stay zero.
type Opt[T any] struct {
	Set   bool
	Null  bool
	Value T
}

func (o *Opt[T]) UnmarshalJSON(b []byte) error {
	o.Set = true
	if bytes.Equal(bytes.TrimSpace(b), []byte("null")) {
		o.Null = true
		return nil
	}
	return json.Unmarshal(b, &o.Value)
}

func Some[T any](v T) Opt[T] { return Opt[T]{Set: true, Value: v} }
func Null[T any]() Opt[T]    { return Opt[T]{Set: true, Null: true} }
```

`api/internal/domain/errors.go`:

```go
package domain

// ValidationError is returned for any input that violates a domain rule.
// The HTTP layer maps it to 400 validation_failed.
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string { return e.Field + ": " + e.Message }

func invalid(field, message string) error {
	return &ValidationError{Field: field, Message: message}
}
```

`api/internal/domain/item.go`:

```go
package domain

import (
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

const MaxTitleLength = 500

type ItemStatus string

const (
	StatusActive    ItemStatus = "active"
	StatusCompleted ItemStatus = "completed"
)

type Item struct {
	ID             uuid.UUID  `json:"id"`
	UserID         uuid.UUID  `json:"-"`
	Title          string     `json:"title"`
	Description    *string    `json:"description"`
	OpenAt         *time.Time `json:"open_at"`
	DeadlineAt     *time.Time `json:"deadline_at"`
	Status         ItemStatus `json:"status"`
	WorkBlockCount int        `json:"work_block_count"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	CompletedAt    *time.Time `json:"completed_at"`
}

type NewItem struct {
	Title       string     `json:"title"`
	Description *string    `json:"description"`
	OpenAt      *time.Time `json:"open_at"`
	DeadlineAt  *time.Time `json:"deadline_at"`
}

type ItemPatch struct {
	Title       Opt[string]     `json:"title"`
	Description Opt[string]     `json:"description"`
	OpenAt      Opt[time.Time]  `json:"open_at"`
	DeadlineAt  Opt[time.Time]  `json:"deadline_at"`
	Status      Opt[ItemStatus] `json:"status"`
}

func NormalizeTitle(s string) (string, error) {
	t := strings.TrimSpace(s)
	if t == "" {
		return "", invalid("title", "title is required")
	}
	if utf8.RuneCountInString(t) > MaxTitleLength {
		return "", invalid("title", "title must be at most 500 characters")
	}
	return t, nil
}

func utcPtr(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := t.UTC()
	return &u
}

func validateDates(open, deadline *time.Time) error {
	if open != nil && deadline != nil && open.After(*deadline) {
		return invalid("open_at", "open_at must be on or before deadline_at")
	}
	return nil
}

func (n NewItem) Validate() (NewItem, error) {
	title, err := NormalizeTitle(n.Title)
	if err != nil {
		return n, err
	}
	n.Title = title
	n.OpenAt = utcPtr(n.OpenAt)
	n.DeadlineAt = utcPtr(n.DeadlineAt)
	return n, validateDates(n.OpenAt, n.DeadlineAt)
}

func ApplyItemPatch(it Item, p ItemPatch, now time.Time) (Item, error) {
	if p.Title.Set {
		if p.Title.Null {
			return it, invalid("title", "title is required")
		}
		title, err := NormalizeTitle(p.Title.Value)
		if err != nil {
			return it, err
		}
		it.Title = title
	}
	if p.Description.Set {
		if p.Description.Null {
			it.Description = nil
		} else {
			d := p.Description.Value
			it.Description = &d
		}
	}
	if p.OpenAt.Set {
		if p.OpenAt.Null {
			it.OpenAt = nil
		} else {
			it.OpenAt = utcPtr(&p.OpenAt.Value)
		}
	}
	if p.DeadlineAt.Set {
		if p.DeadlineAt.Null {
			it.DeadlineAt = nil
		} else {
			it.DeadlineAt = utcPtr(&p.DeadlineAt.Value)
		}
	}
	if p.Status.Set {
		if p.Status.Null {
			return it, invalid("status", "status is required")
		}
		switch p.Status.Value {
		case StatusCompleted:
			if it.Status != StatusCompleted || it.CompletedAt == nil {
				t := now.UTC()
				it.CompletedAt = &t
			}
		case StatusActive:
			it.CompletedAt = nil
		default:
			return it, invalid("status", "status must be active or completed")
		}
		it.Status = p.Status.Value
	}
	return it, validateDates(it.OpenAt, it.DeadlineAt)
}
```

- [ ] **Step 5: Run item tests**

Run: `cd api && go test ./internal/domain/ -run 'TestNewItem|TestApplyItemPatch' -v`
Expected: PASS.

- [ ] **Step 6: Write failing work block tests**

`api/internal/domain/workblock_test.go`:

```go
package domain

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestNewWorkBlockValidate(t *testing.T) {
	start := time.Date(2026, 10, 6, 2, 0, 0, 0, time.UTC)
	item := uuid.New()
	tests := []struct {
		name      string
		in        NewWorkBlock
		wantField string
	}{
		{"60 minutes ok", NewWorkBlock{item, start, start.Add(time.Hour)}, ""},
		{"exactly 15 minutes ok", NewWorkBlock{item, start, start.Add(15 * time.Minute)}, ""},
		{"14 minutes rejected", NewWorkBlock{item, start, start.Add(14 * time.Minute)}, "end_at"},
		{"end before start rejected", NewWorkBlock{item, start, start.Add(-time.Hour)}, "end_at"},
		{"missing item rejected", NewWorkBlock{uuid.Nil, start, start.Add(time.Hour)}, "item_id"},
		{"missing start rejected", NewWorkBlock{item, time.Time{}, start}, "start_at"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := tc.in.Validate()
			if tc.wantField == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			assertField(t, err, tc.wantField)
		})
	}
}

func TestApplyWorkBlockPatch(t *testing.T) {
	start := time.Date(2026, 10, 6, 2, 0, 0, 0, time.UTC)
	b := WorkBlock{StartAt: start, EndAt: start.Add(time.Hour)}
	decode := func(js string) WorkBlockPatch {
		var p WorkBlockPatch
		if err := json.Unmarshal([]byte(js), &p); err != nil {
			t.Fatal(err)
		}
		return p
	}

	t.Run("move keeps whatever is sent", func(t *testing.T) {
		got, err := ApplyWorkBlockPatch(b, decode(`{"start_at":"2026-10-07T02:00:00Z","end_at":"2026-10-07T03:00:00Z"}`))
		if err != nil || got.StartAt.Day() != 7 || got.EndAt.Sub(got.StartAt) != time.Hour {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("end only is validated against existing start", func(t *testing.T) {
		_, err := ApplyWorkBlockPatch(b, decode(`{"end_at":"2026-10-06T02:10:00Z"}`))
		assertField(t, err, "end_at")
	})
	t.Run("null start rejected", func(t *testing.T) {
		_, err := ApplyWorkBlockPatch(b, decode(`{"start_at":null}`))
		assertField(t, err, "start_at")
	})
}
```

- [ ] **Step 7: Implement `workblock.go`**

```go
package domain

import (
	"time"

	"github.com/google/uuid"
)

const MinBlockDuration = 15 * time.Minute

type WorkBlock struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"-"`
	ItemID    uuid.UUID `json:"item_id"`
	StartAt   time.Time `json:"start_at"`
	EndAt     time.Time `json:"end_at"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type NewWorkBlock struct {
	ItemID  uuid.UUID `json:"item_id"`
	StartAt time.Time `json:"start_at"`
	EndAt   time.Time `json:"end_at"`
}

type WorkBlockPatch struct {
	StartAt Opt[time.Time] `json:"start_at"`
	EndAt   Opt[time.Time] `json:"end_at"`
}

func validateBlockTimes(start, end time.Time) error {
	if start.IsZero() {
		return invalid("start_at", "start_at is required")
	}
	if end.IsZero() {
		return invalid("end_at", "end_at is required")
	}
	if end.Sub(start) < MinBlockDuration {
		return invalid("end_at", "work block must be at least 15 minutes long")
	}
	return nil
}

func (n NewWorkBlock) Validate() (NewWorkBlock, error) {
	if n.ItemID == uuid.Nil {
		return n, invalid("item_id", "item_id is required")
	}
	n.StartAt = n.StartAt.UTC()
	n.EndAt = n.EndAt.UTC()
	return n, validateBlockTimes(n.StartAt, n.EndAt)
}

func ApplyWorkBlockPatch(b WorkBlock, p WorkBlockPatch) (WorkBlock, error) {
	if p.StartAt.Set {
		if p.StartAt.Null {
			return b, invalid("start_at", "start_at is required")
		}
		b.StartAt = p.StartAt.Value.UTC()
	}
	if p.EndAt.Set {
		if p.EndAt.Null {
			return b, invalid("end_at", "end_at is required")
		}
		b.EndAt = p.EndAt.Value.UTC()
	}
	return b, validateBlockTimes(b.StartAt, b.EndAt)
}
```

Note: `NewWorkBlock.Validate` must check `StartAt.IsZero()` **before** calling `.UTC()` (zero time stays zero under `.UTC()`, so the order above is fine).

- [ ] **Step 8: Run work block tests**

Run: `cd api && go test ./internal/domain/ -run 'WorkBlock' -v`
Expected: PASS.

- [ ] **Step 9: Write failing layout tests**

`api/internal/domain/layout_test.go`:

```go
package domain

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func leaf(id string) string {
	return fmt.Sprintf(`{"kind":"view","id":%q,"view":{"type":"timeline","config":{}}}`, id)
}

func doc(root string) string { return `{"version":1,"root":` + root + `}` }

// nested builds a chain of row splits `depth` levels deep.
func nested(depth int) string {
	node := leaf("leaf-0")
	for i := 1; i < depth; i++ {
		node = fmt.Sprintf(`{"kind":"split","id":"s-%d","direction":"row","sizes":[0.5,0.5],"children":[%s,%s]}`,
			i, node, leaf(fmt.Sprintf("leaf-%d", i)))
	}
	return node
}

func wide(n int) string {
	children := make([]string, n)
	sizes := make([]string, n)
	for i := range n {
		children[i] = leaf(fmt.Sprintf("v-%d", i))
		sizes[i] = fmt.Sprintf("%g", 1.0/float64(n))
	}
	return fmt.Sprintf(`{"kind":"split","id":"root","direction":"row","sizes":[%s],"children":[%s]}`,
		strings.Join(sizes, ","), strings.Join(children, ","))
}

func TestDefaultLayoutIsValid(t *testing.T) {
	if err := ValidateLayout(DefaultLayout()); err != nil {
		t.Fatalf("default layout invalid: %v", err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(DefaultLayout(), &parsed); err != nil {
		t.Fatal(err)
	}
}

func TestValidateLayout(t *testing.T) {
	two := func(a, b string, sizes string) string {
		return `{"kind":"split","id":"s","direction":"row","sizes":` + sizes + `,"children":[` + a + `,` + b + `]}`
	}
	tests := []struct {
		name  string
		raw   string
		valid bool
	}{
		{"empty workspace", doc(`null`), true},
		{"single view", doc(leaf("a")), true},
		{"dropbox config", doc(`{"kind":"view","id":"a","view":{"type":"dropbox","config":{"filter":"unscheduled"}}}`), true},
		{"calendar config", doc(`{"kind":"view","id":"a","view":{"type":"calendar","config":{"mode":"day"}}}`), true},
		{"sizes within tolerance", doc(two(leaf("a"), leaf("b"), `[0.505,0.5]`)), true},
		{"depth 8 ok", doc(nested(8)), true},
		{"24 views ok", doc(wide(24)), true},
		{"missing version", `{"root":null}`, false},
		{"version 2", `{"version":2,"root":null}`, false},
		{"extra top-level key", `{"version":1,"root":null,"x":1}`, false},
		{"not an object", `[]`, false},
		{"duplicate ids", doc(two(leaf("a"), leaf("a"), `[0.5,0.5]`)), false},
		{"split with one child", doc(`{"kind":"split","id":"s","direction":"row","sizes":[1],"children":[` + leaf("a") + `]}`), false},
		{"sizes length mismatch", doc(two(leaf("a"), leaf("b"), `[1]`)), false},
		{"sizes do not sum to 1", doc(two(leaf("a"), leaf("b"), `[0.5,0.4]`)), false},
		{"zero size", doc(two(leaf("a"), leaf("b"), `[1,0]`)), false},
		{"bad direction", doc(`{"kind":"split","id":"s","direction":"diagonal","sizes":[0.5,0.5],"children":[` + leaf("a") + `,` + leaf("b") + `]}`), false},
		{"unknown kind", doc(`{"kind":"tab","id":"a"}`), false},
		{"unknown view type", doc(`{"kind":"view","id":"a","view":{"type":"kanban","config":{}}}`), false},
		{"bad dropbox filter", doc(`{"kind":"view","id":"a","view":{"type":"dropbox","config":{"filter":"later"}}}`), false},
		{"timeline config has keys", doc(`{"kind":"view","id":"a","view":{"type":"timeline","config":{"zoom":2}}}`), false},
		{"calendar missing mode", doc(`{"kind":"view","id":"a","view":{"type":"calendar","config":{}}}`), false},
		{"config null", doc(`{"kind":"view","id":"a","view":{"type":"timeline","config":null}}`), false},
		{"empty id", doc(leaf("")), false},
		{"depth 9 rejected", doc(nested(9)), false},
		{"25 views rejected", doc(wide(25)), false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateLayout(json.RawMessage(tc.raw))
			if tc.valid && err != nil {
				t.Fatalf("want valid, got %v", err)
			}
			if !tc.valid {
				assertField(t, err, "layout")
			}
		})
	}
}
```

- [ ] **Step 10: Implement `layout.go` and `default_layout.json`**

`api/internal/domain/default_layout.json`:

```json
{
  "version": 1,
  "root": {
    "kind": "split", "id": "s-root", "direction": "column", "sizes": [0.62, 0.38],
    "children": [
      {
        "kind": "split", "id": "s-top", "direction": "row", "sizes": [0.32, 0.68],
        "children": [
          { "kind": "view", "id": "v-dropbox", "view": { "type": "dropbox", "config": { "filter": "all" } } },
          { "kind": "view", "id": "v-calendar", "view": { "type": "calendar", "config": { "mode": "week" } } }
        ]
      },
      { "kind": "view", "id": "v-timeline", "view": { "type": "timeline", "config": {} } }
    ]
  }
}
```

`api/internal/domain/layout.go`:

```go
package domain

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"math"
	"time"
)

const (
	maxLayoutDepth = 8
	maxLayoutViews = 24
)

//go:embed default_layout.json
var defaultLayout []byte

type Workspace struct {
	Layout    json.RawMessage `json:"layout"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// DefaultLayout returns a fresh copy of the first-run layout (FEATURE_DESIGN §21).
func DefaultLayout() json.RawMessage {
	return append(json.RawMessage(nil), defaultLayout...)
}

func layoutErr(msg string) error { return invalid("layout", msg) }

func ValidateLayout(raw json.RawMessage) error {
	var doc struct {
		Version *int            `json:"version"`
		Root    json.RawMessage `json:"root"`
	}
	if !isJSONObject(raw) || strictDecode(raw, &doc) != nil {
		return layoutErr("layout is malformed")
	}
	if doc.Version == nil || *doc.Version != 1 {
		return layoutErr("layout version must be 1")
	}
	if len(doc.Root) == 0 || string(bytes.TrimSpace(doc.Root)) == "null" {
		return nil
	}
	v := &layoutValidator{ids: map[string]bool{}}
	return v.node(doc.Root, 1)
}

type layoutValidator struct {
	ids   map[string]bool
	views int
}

func (v *layoutValidator) claimID(id string) error {
	if id == "" {
		return layoutErr("node id is required")
	}
	if v.ids[id] {
		return layoutErr("node ids must be unique")
	}
	v.ids[id] = true
	return nil
}

func (v *layoutValidator) node(raw json.RawMessage, depth int) error {
	if depth > maxLayoutDepth {
		return layoutErr("layout is nested too deeply")
	}
	if !isJSONObject(raw) {
		return layoutErr("layout node must be an object")
	}
	var head struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(raw, &head); err != nil {
		return layoutErr("layout node is malformed")
	}
	switch head.Kind {
	case "split":
		var s struct {
			Kind      string            `json:"kind"`
			ID        string            `json:"id"`
			Direction string            `json:"direction"`
			Children  []json.RawMessage `json:"children"`
			Sizes     []float64         `json:"sizes"`
		}
		if strictDecode(raw, &s) != nil {
			return layoutErr("split node is malformed")
		}
		if err := v.claimID(s.ID); err != nil {
			return err
		}
		if s.Direction != "row" && s.Direction != "column" {
			return layoutErr("split direction must be row or column")
		}
		if len(s.Children) < 2 {
			return layoutErr("split must have at least two children")
		}
		if len(s.Sizes) != len(s.Children) {
			return layoutErr("split sizes must match children")
		}
		sum := 0.0
		for _, size := range s.Sizes {
			if size <= 0 {
				return layoutErr("split sizes must be positive")
			}
			sum += size
		}
		if math.Abs(sum-1) > 0.01 {
			return layoutErr("split sizes must sum to 1")
		}
		for _, child := range s.Children {
			if err := v.node(child, depth+1); err != nil {
				return err
			}
		}
		return nil
	case "view":
		var n struct {
			Kind string          `json:"kind"`
			ID   string          `json:"id"`
			View json.RawMessage `json:"view"`
		}
		if strictDecode(raw, &n) != nil {
			return layoutErr("view node is malformed")
		}
		if err := v.claimID(n.ID); err != nil {
			return err
		}
		v.views++
		if v.views > maxLayoutViews {
			return layoutErr("too many views")
		}
		return validateView(n.View)
	default:
		return layoutErr("unknown layout node kind")
	}
}

func validateView(raw json.RawMessage) error {
	var vi struct {
		Type   string          `json:"type"`
		Config json.RawMessage `json:"config"`
	}
	if !isJSONObject(raw) || strictDecode(raw, &vi) != nil || !isJSONObject(vi.Config) {
		return layoutErr("view is malformed")
	}
	switch vi.Type {
	case "dropbox":
		var c struct {
			Filter string `json:"filter"`
		}
		if strictDecode(vi.Config, &c) != nil {
			return layoutErr("dropbox config is malformed")
		}
		switch c.Filter {
		case "all", "scheduled", "unscheduled", "completed":
			return nil
		}
		return layoutErr("dropbox filter is invalid")
	case "timeline":
		var c struct{}
		if strictDecode(vi.Config, &c) != nil {
			return layoutErr("timeline config must be empty")
		}
		return nil
	case "calendar":
		var c struct {
			Mode string `json:"mode"`
		}
		if strictDecode(vi.Config, &c) != nil || (c.Mode != "week" && c.Mode != "day") {
			return layoutErr("calendar mode must be week or day")
		}
		return nil
	default:
		return layoutErr("unknown view type")
	}
}

func strictDecode(raw json.RawMessage, v any) error {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return err
	}
	if dec.More() {
		return errors.New("trailing data")
	}
	return nil
}

func isJSONObject(raw json.RawMessage) bool {
	t := bytes.TrimSpace(raw)
	return len(t) > 0 && t[0] == '{'
}
```

- [ ] **Step 11: Run all domain tests**

Run: `cd api && go test ./internal/domain/ -v`
Expected: all PASS.

- [ ] **Step 12: Commit**

```bash
git add api
git commit -m "feat(api): add domain types and validation rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Postgres store (sqlc)

**Files:**
- Create: `api/sqlc.yaml`, `api/internal/store/queries/items.sql`, `work_blocks.sql`, `workspaces.sql`, `api/internal/store/store.go`, `api/internal/testdb/testdb.go`
- Generate: `api/internal/store/db/*` (commit the generated code)
- Test: `api/internal/store/store_test.go`

**Interfaces:**
- Consumes: `domain.*` from Task 4.
- Produces (package `store`):
  - `var ErrNotFound`
  - `func Connect(ctx context.Context, url string) (*pgxpool.Pool, error)`; `func New(pool *pgxpool.Pool) *Store`
  - `type ItemFilter struct { Status *domain.ItemStatus; Scheduled *bool }` (nil = no filter)
  - `type BlockFilter struct { ItemID *uuid.UUID; Start, End *time.Time }`
  - `(*Store) CreateItem(ctx, userID uuid.UUID, n domain.NewItem) (domain.Item, error)`
  - `(*Store) GetItem(ctx, userID, id uuid.UUID) (domain.Item, error)`
  - `(*Store) ListItems(ctx, userID uuid.UUID, f ItemFilter) ([]domain.Item, error)` (never nil)
  - `(*Store) UpdateItem(ctx, userID, id uuid.UUID, apply func(domain.Item) (domain.Item, error)) (domain.Item, error)`
  - `(*Store) DeleteItem(ctx, userID, id uuid.UUID) error`
  - `(*Store) CreateWorkBlock(ctx, userID uuid.UUID, n domain.NewWorkBlock) (domain.WorkBlock, error)` (ErrNotFound if item missing/not owned)
  - `(*Store) GetWorkBlock`, `ListWorkBlocks(ctx, userID, f BlockFilter) ([]domain.WorkBlock, error)`, `UpdateWorkBlock(ctx, userID, id, apply func(domain.WorkBlock) (domain.WorkBlock, error))`, `DeleteWorkBlock`
  - `(*Store) GetOrCreateWorkspace(ctx, userID uuid.UUID, def json.RawMessage) (domain.Workspace, error)`; `(*Store) PutWorkspace(ctx, userID uuid.UUID, layout json.RawMessage) (domain.Workspace, error)`
  - package `testdb`: `func New(t *testing.T) *pgxpool.Pool` (connects to `TEST_DATABASE_URL`, truncates all tables)
  - All returned timestamps are UTC.

- [ ] **Step 1: Add dependencies and sqlc config**

Run: `cd api && go get github.com/jackc/pgx/v5`

`api/sqlc.yaml`:

```yaml
version: "2"
sql:
  - engine: postgresql
    schema: ../db/migrations
    queries: internal/store/queries
    gen:
      go:
        package: db
        out: internal/store/db
        sql_package: pgx/v5
        emit_pointers_for_null_types: true
        overrides:
          - db_type: uuid
            go_type: github.com/google/uuid.UUID
          - db_type: uuid
            nullable: true
            go_type:
              import: github.com/google/uuid
              type: UUID
              pointer: true
          - db_type: timestamptz
            go_type: time.Time
          - db_type: timestamptz
            nullable: true
            go_type:
              type: time.Time
              pointer: true
```

- [ ] **Step 2: Write the queries**

`api/internal/store/queries/items.sql`:

```sql
-- name: CreateItem :one
INSERT INTO items (user_id, title, description, open_at, deadline_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetItem :one
SELECT i.*, (SELECT count(*) FROM work_blocks w WHERE w.item_id = i.id)::int AS work_block_count
FROM items i
WHERE i.id = $1 AND i.user_id = $2;

-- name: ListItems :many
SELECT i.*, (SELECT count(*) FROM work_blocks w WHERE w.item_id = i.id)::int AS work_block_count
FROM items i
WHERE i.user_id = @user_id
  AND (sqlc.narg('status')::text IS NULL OR i.status = sqlc.narg('status')::text)
  AND (sqlc.narg('scheduled')::bool IS NULL
       OR EXISTS (SELECT 1 FROM work_blocks w WHERE w.item_id = i.id) = sqlc.narg('scheduled')::bool)
ORDER BY i.created_at DESC, i.id;

-- name: LockItem :one
SELECT * FROM items WHERE id = $1 AND user_id = $2 FOR UPDATE;

-- name: UpdateItem :one
UPDATE items
SET title = $3, description = $4, open_at = $5, deadline_at = $6,
    status = $7, completed_at = $8, updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: CountWorkBlocks :one
SELECT count(*)::int FROM work_blocks WHERE item_id = $1;

-- name: DeleteItem :execrows
DELETE FROM items WHERE id = $1 AND user_id = $2;

-- name: ItemExists :one
SELECT EXISTS (SELECT 1 FROM items WHERE id = $1 AND user_id = $2);
```

`api/internal/store/queries/work_blocks.sql`:

```sql
-- name: CreateWorkBlock :one
INSERT INTO work_blocks (user_id, item_id, start_at, end_at)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetWorkBlock :one
SELECT * FROM work_blocks WHERE id = $1 AND user_id = $2;

-- name: LockWorkBlock :one
SELECT * FROM work_blocks WHERE id = $1 AND user_id = $2 FOR UPDATE;

-- name: ListWorkBlocks :many
SELECT * FROM work_blocks
WHERE user_id = @user_id
  AND (sqlc.narg('item_id')::uuid IS NULL OR item_id = sqlc.narg('item_id')::uuid)
  AND (sqlc.narg('range_start')::timestamptz IS NULL OR end_at > sqlc.narg('range_start')::timestamptz)
  AND (sqlc.narg('range_end')::timestamptz IS NULL OR start_at < sqlc.narg('range_end')::timestamptz)
ORDER BY start_at, id;

-- name: UpdateWorkBlock :one
UPDATE work_blocks
SET start_at = $3, end_at = $4, updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: DeleteWorkBlock :execrows
DELETE FROM work_blocks WHERE id = $1 AND user_id = $2;
```

`api/internal/store/queries/workspaces.sql`:

```sql
-- name: GetWorkspace :one
SELECT layout, updated_at FROM workspaces WHERE user_id = $1;

-- name: InsertWorkspaceIfMissing :exec
INSERT INTO workspaces (user_id, layout) VALUES ($1, $2)
ON CONFLICT (user_id) DO NOTHING;

-- name: UpsertWorkspace :one
INSERT INTO workspaces (user_id, layout) VALUES ($1, $2)
ON CONFLICT (user_id) DO UPDATE SET layout = EXCLUDED.layout, updated_at = now()
RETURNING layout, updated_at;
```

- [ ] **Step 3: Generate**

Run: `make sqlc && cd api && go build ./...`
Expected: `api/internal/store/db/{db.go,models.go,items.sql.go,work_blocks.sql.go,workspaces.sql.go}` exist and the module builds. Read `models.go` and the `*Row`/`*Params` types; the store code below assumes sqlc's default naming (`db.Item`, `db.GetItemRow`, `db.ListItemsParams{UserID, Status, Scheduled}`, `db.ListWorkBlocksParams{UserID, ItemID, RangeStart, RangeEnd}`, etc.). Adjust field names in `store.go` to what was actually generated; do not change the queries.

- [ ] **Step 4: Write the test DB helper**

`api/internal/testdb/testdb.go`:

```go
// Package testdb gives integration tests a clean Postgres database.
// Tests using it must not run in parallel across packages (make test-api uses go test -p 1).
package testdb

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func New(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Fatal("TEST_DATABASE_URL is not set; run `make test-api` from the repo root")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if _, err := pool.Exec(ctx, "TRUNCATE work_blocks, items, workspaces"); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}
```

- [ ] **Step 5: Write failing store tests**

`api/internal/store/store_test.go`:

```go
package store_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/domain"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/store"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/testdb"
)

var (
	ctx   = context.Background()
	userA = uuid.MustParse("aaaaaaaa-0000-0000-0000-000000000001")
	userB = uuid.MustParse("bbbbbbbb-0000-0000-0000-000000000002")
	t0    = time.Date(2026, 10, 6, 16, 0, 0, 0, time.UTC)
)

func newStore(t *testing.T) *store.Store { return store.New(testdb.New(t)) }

func mustItem(t *testing.T, s *store.Store, user uuid.UUID, title string) domain.Item {
	t.Helper()
	it, err := s.CreateItem(ctx, user, domain.NewItem{Title: title})
	if err != nil {
		t.Fatal(err)
	}
	return it
}

func mustBlock(t *testing.T, s *store.Store, user, item uuid.UUID, start time.Time, d time.Duration) domain.WorkBlock {
	t.Helper()
	b, err := s.CreateWorkBlock(ctx, user, domain.NewWorkBlock{ItemID: item, StartAt: start, EndAt: start.Add(d)})
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func ids(items []domain.Item) []string {
	out := make([]string, len(items))
	for i, it := range items {
		out[i] = it.Title
	}
	return out
}

func TestItemCRUDAndOwnership(t *testing.T) {
	s := newStore(t)
	it := mustItem(t, s, userA, "Physics")
	if it.Status != domain.StatusActive || it.WorkBlockCount != 0 || it.CreatedAt.Location() != time.UTC {
		t.Fatalf("unexpected created item %+v", it)
	}
	if _, err := s.GetItem(ctx, userB, it.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("other user read: want ErrNotFound, got %v", err)
	}
	if err := s.DeleteItem(ctx, userB, it.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("other user delete: want ErrNotFound, got %v", err)
	}
	if _, err := s.GetItem(ctx, userA, it.ID); err != nil {
		t.Fatalf("owner read after foreign delete: %v", err)
	}
}

func TestListItemsFilters(t *testing.T) {
	s := newStore(t)
	unscheduled := mustItem(t, s, userA, "unscheduled")
	scheduled := mustItem(t, s, userA, "scheduled")
	done := mustItem(t, s, userA, "done")
	mustItem(t, s, userB, "someone else")
	mustBlock(t, s, userA, scheduled.ID, t0, time.Hour)
	if _, err := s.UpdateItem(ctx, userA, done.ID, func(it domain.Item) (domain.Item, error) {
		return domain.ApplyItemPatch(it, domain.ItemPatch{Status: domain.Some(domain.StatusCompleted)}, t0)
	}); err != nil {
		t.Fatal(err)
	}
	_ = unscheduled

	active, completed := domain.StatusActive, domain.StatusCompleted
	yes, no := true, false
	cases := []struct {
		name string
		f    store.ItemFilter
		want []string
	}{
		{"all", store.ItemFilter{}, []string{"done", "scheduled", "unscheduled"}},
		{"active", store.ItemFilter{Status: &active}, []string{"scheduled", "unscheduled"}},
		{"completed", store.ItemFilter{Status: &completed}, []string{"done"}},
		{"active scheduled", store.ItemFilter{Status: &active, Scheduled: &yes}, []string{"scheduled"}},
		{"active unscheduled", store.ItemFilter{Status: &active, Scheduled: &no}, []string{"unscheduled"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := s.ListItems(ctx, userA, tc.f)
			if err != nil {
				t.Fatal(err)
			}
			if g := ids(got); len(g) != len(tc.want) || func() bool {
				for i := range g {
					if g[i] != tc.want[i] {
						return true
					}
				}
				return false
			}() {
				t.Fatalf("got %v, want %v (newest first)", g, tc.want)
			}
		})
	}

	empty, err := s.ListItems(ctx, uuid.New(), store.ItemFilter{})
	if err != nil || empty == nil || len(empty) != 0 {
		t.Fatalf("empty list must be non-nil and empty, got %#v, %v", empty, err)
	}
}

func TestUpdateItemApplyErrorPersistsNothing(t *testing.T) {
	s := newStore(t)
	it := mustItem(t, s, userA, "Physics")
	boom := errors.New("boom")
	_, err := s.UpdateItem(ctx, userA, it.ID, func(cur domain.Item) (domain.Item, error) {
		cur.Title = "changed"
		return cur, boom
	})
	if !errors.Is(err, boom) {
		t.Fatalf("want boom, got %v", err)
	}
	got, _ := s.GetItem(ctx, userA, it.ID)
	if got.Title != "Physics" {
		t.Fatalf("title changed to %q", got.Title)
	}
}

func TestWorkBlocks(t *testing.T) {
	s := newStore(t)
	it := mustItem(t, s, userA, "Physics")
	other := mustItem(t, s, userB, "theirs")

	if _, err := s.CreateWorkBlock(ctx, userA, domain.NewWorkBlock{ItemID: other.ID, StartAt: t0, EndAt: t0.Add(time.Hour)}); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("block on foreign item: want ErrNotFound, got %v", err)
	}

	b9 := mustBlock(t, s, userA, it.ID, t0, time.Hour)                   // 16:00-17:00
	b10 := mustBlock(t, s, userA, it.ID, t0.Add(time.Hour), time.Hour)   // 17:00-18:00
	mustBlock(t, s, userA, it.ID, t0.Add(2*time.Hour), time.Hour)        // 18:00-19:00
	_ = b9

	start, end := t0.Add(time.Hour), t0.Add(2*time.Hour)
	got, err := s.ListWorkBlocks(ctx, userA, store.BlockFilter{Start: &start, End: &end})
	if err != nil || len(got) != 1 || got[0].ID != b10.ID {
		t.Fatalf("range [17,18) should return only the 17:00 block, got %+v, %v", got, err)
	}

	withCount, _ := s.GetItem(ctx, userA, it.ID)
	if withCount.WorkBlockCount != 3 {
		t.Fatalf("work_block_count = %d, want 3", withCount.WorkBlockCount)
	}

	if err := s.DeleteItem(ctx, userA, it.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetWorkBlock(ctx, userA, b10.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("blocks must cascade on item delete, got %v", err)
	}
}

func TestWorkspace(t *testing.T) {
	s := newStore(t)
	first, err := s.GetOrCreateWorkspace(ctx, userA, domain.DefaultLayout())
	if err != nil {
		t.Fatal(err)
	}
	var a, b any
	_ = json.Unmarshal(first.Layout, &a)
	_ = json.Unmarshal(domain.DefaultLayout(), &b)
	if ja, jb := mustJSON(a), mustJSON(b); ja != jb {
		t.Fatalf("default layout not stored:\n%s\n%s", ja, jb)
	}

	next := json.RawMessage(`{"version":1,"root":null}`)
	put, err := s.PutWorkspace(ctx, userA, next)
	if err != nil || put.UpdatedAt.Location() != time.UTC {
		t.Fatalf("put: %+v, %v", put, err)
	}
	again, _ := s.GetOrCreateWorkspace(ctx, userA, domain.DefaultLayout())
	if mustJSON(decode(again.Layout)) != mustJSON(decode(next)) {
		t.Fatalf("GetOrCreate must not overwrite an existing layout, got %s", again.Layout)
	}
}

func decode(raw json.RawMessage) any { var v any; _ = json.Unmarshal(raw, &v); return v }
func mustJSON(v any) string         { b, _ := json.Marshal(v); return string(b) }
```

- [ ] **Step 6: Run to verify failure**

Run: `make test-api`
Expected: FAIL to compile (`undefined: store.New`, ...).

- [ ] **Step 7: Implement `store.go`**

```go
// Package store maps domain operations onto Postgres. Every query is scoped
// by user_id; rows owned by another user are indistinguishable from missing.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/domain"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/store/db"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

type ItemFilter struct {
	Status    *domain.ItemStatus
	Scheduled *bool
}

type BlockFilter struct {
	ItemID     *uuid.UUID
	Start, End *time.Time
}

func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool, q: db.New(pool)} }

func mapErr(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23503" { // FK violation: item vanished
		return ErrNotFound
	}
	return err
}

func utc(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := t.UTC()
	return &u
}

func itemFrom(i db.Item, count int32) domain.Item {
	return domain.Item{
		ID: i.ID, UserID: i.UserID, Title: i.Title, Description: i.Description,
		OpenAt: utc(i.OpenAt), DeadlineAt: utc(i.DeadlineAt),
		Status: domain.ItemStatus(i.Status), WorkBlockCount: int(count),
		CreatedAt: i.CreatedAt.UTC(), UpdatedAt: i.UpdatedAt.UTC(), CompletedAt: utc(i.CompletedAt),
	}
}

func blockFrom(b db.WorkBlock) domain.WorkBlock {
	return domain.WorkBlock{
		ID: b.ID, UserID: b.UserID, ItemID: b.ItemID,
		StartAt: b.StartAt.UTC(), EndAt: b.EndAt.UTC(),
		CreatedAt: b.CreatedAt.UTC(), UpdatedAt: b.UpdatedAt.UTC(),
	}
}

func (s *Store) CreateItem(ctx context.Context, userID uuid.UUID, n domain.NewItem) (domain.Item, error) {
	row, err := s.q.CreateItem(ctx, db.CreateItemParams{
		UserID: userID, Title: n.Title, Description: n.Description, OpenAt: n.OpenAt, DeadlineAt: n.DeadlineAt,
	})
	if err != nil {
		return domain.Item{}, mapErr(err)
	}
	return itemFrom(row, 0), nil
}

func (s *Store) GetItem(ctx context.Context, userID, id uuid.UUID) (domain.Item, error) {
	r, err := s.q.GetItem(ctx, db.GetItemParams{ID: id, UserID: userID})
	if err != nil {
		return domain.Item{}, mapErr(err)
	}
	return itemFrom(db.Item{
		ID: r.ID, UserID: r.UserID, Title: r.Title, Description: r.Description, OpenAt: r.OpenAt,
		DeadlineAt: r.DeadlineAt, Status: r.Status, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
		CompletedAt: r.CompletedAt,
	}, r.WorkBlockCount), nil
}

func (s *Store) ListItems(ctx context.Context, userID uuid.UUID, f ItemFilter) ([]domain.Item, error) {
	var status *string
	if f.Status != nil {
		v := string(*f.Status)
		status = &v
	}
	rows, err := s.q.ListItems(ctx, db.ListItemsParams{UserID: userID, Status: status, Scheduled: f.Scheduled})
	if err != nil {
		return nil, mapErr(err)
	}
	out := make([]domain.Item, 0, len(rows))
	for _, r := range rows {
		out = append(out, itemFrom(db.Item{
			ID: r.ID, UserID: r.UserID, Title: r.Title, Description: r.Description, OpenAt: r.OpenAt,
			DeadlineAt: r.DeadlineAt, Status: r.Status, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
			CompletedAt: r.CompletedAt,
		}, r.WorkBlockCount))
	}
	return out, nil
}

// UpdateItem locks the row, applies the caller's change (which validates the
// merged result), and writes it back in one transaction.
func (s *Store) UpdateItem(ctx context.Context, userID, id uuid.UUID, apply func(domain.Item) (domain.Item, error)) (domain.Item, error) {
	var out domain.Item
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.q.WithTx(tx)
		cur, err := q.LockItem(ctx, db.LockItemParams{ID: id, UserID: userID})
		if err != nil {
			return mapErr(err)
		}
		next, err := apply(itemFrom(cur, 0))
		if err != nil {
			return err
		}
		row, err := q.UpdateItem(ctx, db.UpdateItemParams{
			ID: id, UserID: userID, Title: next.Title, Description: next.Description,
			OpenAt: next.OpenAt, DeadlineAt: next.DeadlineAt, Status: string(next.Status), CompletedAt: next.CompletedAt,
		})
		if err != nil {
			return mapErr(err)
		}
		count, err := q.CountWorkBlocks(ctx, id)
		if err != nil {
			return err
		}
		out = itemFrom(row, count)
		return nil
	})
	return out, err
}

func (s *Store) DeleteItem(ctx context.Context, userID, id uuid.UUID) error {
	n, err := s.q.DeleteItem(ctx, db.DeleteItemParams{ID: id, UserID: userID})
	if err != nil {
		return mapErr(err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) CreateWorkBlock(ctx context.Context, userID uuid.UUID, n domain.NewWorkBlock) (domain.WorkBlock, error) {
	ok, err := s.q.ItemExists(ctx, db.ItemExistsParams{ID: n.ItemID, UserID: userID})
	if err != nil {
		return domain.WorkBlock{}, mapErr(err)
	}
	if !ok {
		return domain.WorkBlock{}, ErrNotFound
	}
	row, err := s.q.CreateWorkBlock(ctx, db.CreateWorkBlockParams{UserID: userID, ItemID: n.ItemID, StartAt: n.StartAt, EndAt: n.EndAt})
	if err != nil {
		return domain.WorkBlock{}, mapErr(err)
	}
	return blockFrom(row), nil
}

func (s *Store) GetWorkBlock(ctx context.Context, userID, id uuid.UUID) (domain.WorkBlock, error) {
	row, err := s.q.GetWorkBlock(ctx, db.GetWorkBlockParams{ID: id, UserID: userID})
	if err != nil {
		return domain.WorkBlock{}, mapErr(err)
	}
	return blockFrom(row), nil
}

func (s *Store) ListWorkBlocks(ctx context.Context, userID uuid.UUID, f BlockFilter) ([]domain.WorkBlock, error) {
	rows, err := s.q.ListWorkBlocks(ctx, db.ListWorkBlocksParams{UserID: userID, ItemID: f.ItemID, RangeStart: f.Start, RangeEnd: f.End})
	if err != nil {
		return nil, mapErr(err)
	}
	out := make([]domain.WorkBlock, 0, len(rows))
	for _, r := range rows {
		out = append(out, blockFrom(r))
	}
	return out, nil
}

func (s *Store) UpdateWorkBlock(ctx context.Context, userID, id uuid.UUID, apply func(domain.WorkBlock) (domain.WorkBlock, error)) (domain.WorkBlock, error) {
	var out domain.WorkBlock
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.q.WithTx(tx)
		cur, err := q.LockWorkBlock(ctx, db.LockWorkBlockParams{ID: id, UserID: userID})
		if err != nil {
			return mapErr(err)
		}
		next, err := apply(blockFrom(cur))
		if err != nil {
			return err
		}
		row, err := q.UpdateWorkBlock(ctx, db.UpdateWorkBlockParams{ID: id, UserID: userID, StartAt: next.StartAt, EndAt: next.EndAt})
		if err != nil {
			return mapErr(err)
		}
		out = blockFrom(row)
		return nil
	})
	return out, err
}

func (s *Store) DeleteWorkBlock(ctx context.Context, userID, id uuid.UUID) error {
	n, err := s.q.DeleteWorkBlock(ctx, db.DeleteWorkBlockParams{ID: id, UserID: userID})
	if err != nil {
		return mapErr(err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) GetOrCreateWorkspace(ctx context.Context, userID uuid.UUID, def json.RawMessage) (domain.Workspace, error) {
	if err := s.q.InsertWorkspaceIfMissing(ctx, db.InsertWorkspaceIfMissingParams{UserID: userID, Layout: def}); err != nil {
		return domain.Workspace{}, mapErr(err)
	}
	row, err := s.q.GetWorkspace(ctx, userID)
	if err != nil {
		return domain.Workspace{}, mapErr(err)
	}
	return domain.Workspace{Layout: row.Layout, UpdatedAt: row.UpdatedAt.UTC()}, nil
}

func (s *Store) PutWorkspace(ctx context.Context, userID uuid.UUID, layout json.RawMessage) (domain.Workspace, error) {
	row, err := s.q.UpsertWorkspace(ctx, db.UpsertWorkspaceParams{UserID: userID, Layout: layout})
	if err != nil {
		return domain.Workspace{}, mapErr(err)
	}
	return domain.Workspace{Layout: row.Layout, UpdatedAt: row.UpdatedAt.UTC()}, nil
}
```

- [ ] **Step 8: Run store tests**

Run: `make test-api`
Expected: domain and store tests PASS.

- [ ] **Step 9: Commit**

```bash
git add api
git commit -m "feat(api): add Postgres store with sqlc queries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: HTTP server, dev auth, and Items API

**Files:**
- Create: `api/internal/auth/auth.go`, `api/internal/httpapi/server.go`, `respond.go`, `items.go`, `api/cmd/server/main.go`
- Test: `api/internal/auth/auth_test.go`, `api/internal/httpapi/helpers_test.go`, `api/internal/httpapi/items_test.go`

**Interfaces:**
- Consumes: `store.*`, `domain.*`.
- Produces:
  - package `auth`: `var ErrUnauthenticated`; `type Authenticator interface { Authenticate(r *http.Request) (uuid.UUID, error) }`; `func WithUser(ctx, uuid.UUID) context.Context`; `func UserFrom(ctx) (uuid.UUID, bool)`; `func Middleware(a Authenticator, onFail http.Handler) func(http.Handler) http.Handler`; `var DevUserID`; `type DevAuth struct{}`
  - package `httpapi`: `type Options struct { CORSOrigins []string; Now func() time.Time; Logger *slog.Logger }`; `func New(st *store.Store, a auth.Authenticator, opts Options) http.Handler`
  - Routes: `GET /healthz`, `POST|GET /api/v1/items`, `GET|PATCH|DELETE /api/v1/items/{id}`.
  - Test helpers (package `httpapi_test`): `newTestAPI(t) *testAPI`, `(*testAPI).do(user uuid.UUID, method, path string, body any) (int, []byte)`, `decodeAs[T](t, []byte) T`, `userA`, `userB`, `fixedNow`.

- [ ] **Step 1: Write the failing auth test**

`api/internal/auth/auth_test.go`:

```go
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
```

- [ ] **Step 2: Implement `auth.go`**

```go
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
```

Run: `cd api && go test ./internal/auth/ -v` → PASS.

- [ ] **Step 3: Write HTTP test helpers**

`api/internal/httpapi/helpers_test.go`:

```go
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
```

- [ ] **Step 4: Write failing Items API tests**

`api/internal/httpapi/items_test.go`:

```go
package httpapi_test

import (
	"net/http"
	"strings"
	"testing"
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
```

Add `"github.com/google/uuid"` to the import block of `items_test.go`.

- [ ] **Step 5: Run to verify failure**

Run: `make test-api`
Expected: FAIL to compile (`undefined: httpapi.New`).

- [ ] **Step 6: Implement `respond.go`**

```go
package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/domain"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/store"
)

const maxBodyBytes = 64 << 10

type errorBody struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Field   string `json:"field,omitempty"`
	} `json:"error"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message, field string) {
	var body errorBody
	body.Error.Code, body.Error.Message, body.Error.Field = code, message, field
	writeJSON(w, status, body)
}

func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error) {
	var ve *domain.ValidationError
	switch {
	case errors.As(err, &ve):
		writeError(w, http.StatusBadRequest, "validation_failed", ve.Message, ve.Field)
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "not found", "")
	default:
		s.log.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "internal error", "")
	}
}

func decodeJSON(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return &domain.ValidationError{Field: "body", Message: "invalid JSON body: " + err.Error()}
	}
	if dec.More() {
		return &domain.ValidationError{Field: "body", Message: "invalid JSON body: trailing data"}
	}
	return nil
}

// pathID treats a malformed id the same as an unknown one.
func pathID(r *http.Request) (uuid.UUID, error) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		return uuid.Nil, store.ErrNotFound
	}
	return id, nil
}
```

- [ ] **Step 7: Implement `server.go`**

```go
// Package httpapi exposes the /api/v1 HTTP interface.
package httpapi

import (
	"log/slog"
	"net/http"
	"slices"
	"time"

	"github.com/google/uuid"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/auth"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/store"
)

type Options struct {
	CORSOrigins []string
	Now         func() time.Time
	Logger      *slog.Logger
}

type Server struct {
	store *store.Store
	now   func() time.Time
	log   *slog.Logger
}

func New(st *store.Store, a auth.Authenticator, opts Options) http.Handler {
	s := &Server{store: st, now: opts.Now, log: opts.Logger}
	if s.now == nil {
		s.now = time.Now
	}
	if s.log == nil {
		s.log = slog.Default()
	}

	api := http.NewServeMux()
	api.HandleFunc("POST /api/v1/items", s.createItem)
	api.HandleFunc("GET /api/v1/items", s.listItems)
	api.HandleFunc("GET /api/v1/items/{id}", s.getItem)
	api.HandleFunc("PATCH /api/v1/items/{id}", s.patchItem)
	api.HandleFunc("DELETE /api/v1/items/{id}", s.deleteItem)
	s.registerWorkBlocks(api)
	s.registerWorkspace(api)

	unauthorized := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required", "")
	})

	root := http.NewServeMux()
	root.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("ok")) })
	root.Handle("/api/v1/", auth.Middleware(a, unauthorized)(api))

	return s.recoverer(cors(opts.CORSOrigins, root))
}

// Task 7 replaces these two with real route registration.
func (s *Server) registerWorkBlocks(*http.ServeMux) {}
func (s *Server) registerWorkspace(*http.ServeMux)  {}

func userOf(r *http.Request) uuid.UUID {
	id, _ := auth.UserFrom(r.Context())
	return id
}

func cors(origins []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && slices.Contains(origins, origin) {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Add("Vary", "Origin")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Dev-User")
			h.Set("Access-Control-Max-Age", "600")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				s.log.Error("panic", "path", r.URL.Path, "panic", rec)
				writeError(w, http.StatusInternalServerError, "internal", "internal error", "")
			}
		}()
		next.ServeHTTP(w, r)
	})
}
```

- [ ] **Step 8: Implement `items.go`**

```go
package httpapi

import (
	"net/http"
	"net/url"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/domain"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/store"
)

func (s *Server) createItem(w http.ResponseWriter, r *http.Request) {
	var in domain.NewItem
	if err := decodeJSON(w, r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	in, err := in.Validate()
	if err != nil {
		s.fail(w, r, err)
		return
	}
	it, err := s.store.CreateItem(r.Context(), userOf(r), in)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, it)
}

func parseItemFilter(q url.Values) (store.ItemFilter, error) {
	var f store.ItemFilter
	switch q.Get("status") {
	case "", "active":
		v := domain.StatusActive
		f.Status = &v
	case "completed":
		v := domain.StatusCompleted
		f.Status = &v
	case "all":
	default:
		return f, &domain.ValidationError{Field: "status", Message: "status must be active, completed, or all"}
	}
	switch q.Get("scheduling") {
	case "", "all":
	case "scheduled":
		v := true
		f.Scheduled = &v
	case "unscheduled":
		v := false
		f.Scheduled = &v
	default:
		return f, &domain.ValidationError{Field: "scheduling", Message: "scheduling must be all, scheduled, or unscheduled"}
	}
	return f, nil
}

func (s *Server) listItems(w http.ResponseWriter, r *http.Request) {
	f, err := parseItemFilter(r.URL.Query())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	items, err := s.store.ListItems(r.Context(), userOf(r), f)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) getItem(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	it, err := s.store.GetItem(r.Context(), userOf(r), id)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, it)
}

func (s *Server) patchItem(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	var p domain.ItemPatch
	if err := decodeJSON(w, r, &p); err != nil {
		s.fail(w, r, err)
		return
	}
	it, err := s.store.UpdateItem(r.Context(), userOf(r), id, func(cur domain.Item) (domain.Item, error) {
		return domain.ApplyItemPatch(cur, p, s.now())
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, it)
}

func (s *Server) deleteItem(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if err := s.store.DeleteItem(r.Context(), userOf(r), id); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 9: Implement `cmd/server/main.go`**

```go
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/auth"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/httpapi"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/store"
)

type config struct {
	DatabaseURL     string
	Port            string
	AppEnv          string
	AuthMode        string
	CORSOrigins     []string
	SupabaseURL     string
	SupabaseJWKSURL string
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func loadConfig() config {
	return config{
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		Port:            env("PORT", "8080"),
		AppEnv:          env("APP_ENV", "development"),
		AuthMode:        env("AUTH_MODE", "dev"),
		CORSOrigins:     strings.Split(env("CORS_ORIGINS", "http://localhost:8081"), ","),
		SupabaseURL:     os.Getenv("SUPABASE_URL"),
		SupabaseJWKSURL: os.Getenv("SUPABASE_JWKS_URL"),
	}
}

func buildAuthenticator(ctx context.Context, cfg config) (auth.Authenticator, error) {
	switch cfg.AuthMode {
	case "dev":
		if cfg.AppEnv == "production" {
			return nil, errors.New("AUTH_MODE=dev is not allowed when APP_ENV=production")
		}
		return auth.DevAuth{}, nil
	default:
		return nil, fmt.Errorf("unsupported AUTH_MODE %q", cfg.AuthMode)
	}
}

func run(ctx context.Context, logger *slog.Logger) error {
	cfg := loadConfig()
	if cfg.DatabaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := store.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect database: %w", err)
	}
	defer pool.Close()

	authn, err := buildAuthenticator(ctx, cfg)
	if err != nil {
		return err
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httpapi.New(store.New(pool), authn, httpapi.Options{CORSOrigins: cfg.CORSOrigins, Logger: logger}),
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()
	logger.Info("listening", "addr", srv.Addr, "auth_mode", cfg.AuthMode)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	if err := run(context.Background(), logger); err != nil {
		logger.Error("server exited", "err", err)
		os.Exit(1)
	}
}
```

- [ ] **Step 10: Run all API tests and smoke the binary**

Run: `make test-api`
Expected: all PASS.

Run: `make migrate && (make api &) && sleep 3 && curl -s localhost:8080/healthz && curl -s -XPOST localhost:8080/api/v1/items -d '{"title":"smoke"}' && kill %1`
Expected: `ok`, then a JSON item with `"title":"smoke"`.

- [ ] **Step 11: Commit**

```bash
git add api
git commit -m "feat(api): add HTTP server, dev auth, and items endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: WorkBlocks and Workspace API

**Files:**
- Create: `api/internal/httpapi/workblocks.go`, `api/internal/httpapi/workspace.go`
- Modify: `api/internal/httpapi/server.go` (delete the two placeholder `register*` stubs)
- Test: `api/internal/httpapi/workblocks_test.go`, `api/internal/httpapi/workspace_test.go`

**Interfaces:**
- Consumes: `Server`, `writeJSON`, `fail`, `decodeJSON`, `pathID`, `userOf` (Task 6); store methods (Task 5).
- Produces: `(*Server) registerWorkBlocks(mux *http.ServeMux)`, `(*Server) registerWorkspace(mux *http.ServeMux)`; routes `POST|GET /api/v1/work-blocks`, `GET|PATCH|DELETE /api/v1/work-blocks/{id}`, `GET|PUT /api/v1/workspace`.

- [ ] **Step 1: Write failing work block tests**

`api/internal/httpapi/workblocks_test.go`:

```go
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
```

- [ ] **Step 2: Write failing workspace tests**

`api/internal/httpapi/workspace_test.go`:

```go
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
```

- [ ] **Step 3: Run to verify failure**

Run: `make test-api`
Expected: FAIL (`404` responses, since routes aren't registered).

- [ ] **Step 4: Implement `workblocks.go`**

Remove the two placeholder methods from `server.go`, then:

```go
package httpapi

import (
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/domain"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/store"
)

func (s *Server) registerWorkBlocks(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/work-blocks", s.createWorkBlock)
	mux.HandleFunc("GET /api/v1/work-blocks", s.listWorkBlocks)
	mux.HandleFunc("GET /api/v1/work-blocks/{id}", s.getWorkBlock)
	mux.HandleFunc("PATCH /api/v1/work-blocks/{id}", s.patchWorkBlock)
	mux.HandleFunc("DELETE /api/v1/work-blocks/{id}", s.deleteWorkBlock)
}

func (s *Server) createWorkBlock(w http.ResponseWriter, r *http.Request) {
	var in domain.NewWorkBlock
	if err := decodeJSON(w, r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	in, err := in.Validate()
	if err != nil {
		s.fail(w, r, err)
		return
	}
	b, err := s.store.CreateWorkBlock(r.Context(), userOf(r), in)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, b)
}

func parseBlockFilter(r *http.Request) (store.BlockFilter, error) {
	q := r.URL.Query()
	var f store.BlockFilter
	if v := q.Get("item_id"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			return f, &domain.ValidationError{Field: "item_id", Message: "item_id must be a UUID"}
		}
		f.ItemID = &id
	}
	startS, endS := q.Get("start"), q.Get("end")
	if (startS == "") != (endS == "") {
		return f, &domain.ValidationError{Field: "start", Message: "start and end must be provided together"}
	}
	if startS != "" {
		start, err := time.Parse(time.RFC3339, startS)
		if err != nil {
			return f, &domain.ValidationError{Field: "start", Message: "start must be RFC 3339"}
		}
		end, err := time.Parse(time.RFC3339, endS)
		if err != nil {
			return f, &domain.ValidationError{Field: "end", Message: "end must be RFC 3339"}
		}
		if !end.After(start) {
			return f, &domain.ValidationError{Field: "end", Message: "end must be after start"}
		}
		f.Start, f.End = &start, &end
	}
	if f.ItemID == nil && f.Start == nil {
		return f, &domain.ValidationError{Field: "start", Message: "provide start and end, item_id, or both"}
	}
	return f, nil
}

func (s *Server) listWorkBlocks(w http.ResponseWriter, r *http.Request) {
	f, err := parseBlockFilter(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	blocks, err := s.store.ListWorkBlocks(r.Context(), userOf(r), f)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"work_blocks": blocks})
}

func (s *Server) getWorkBlock(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	b, err := s.store.GetWorkBlock(r.Context(), userOf(r), id)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, b)
}

func (s *Server) patchWorkBlock(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	var p domain.WorkBlockPatch
	if err := decodeJSON(w, r, &p); err != nil {
		s.fail(w, r, err)
		return
	}
	b, err := s.store.UpdateWorkBlock(r.Context(), userOf(r), id, func(cur domain.WorkBlock) (domain.WorkBlock, error) {
		return domain.ApplyWorkBlockPatch(cur, p)
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, b)
}

func (s *Server) deleteWorkBlock(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if err := s.store.DeleteWorkBlock(r.Context(), userOf(r), id); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 5: Implement `workspace.go`**

```go
package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/domain"
)

func (s *Server) registerWorkspace(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/workspace", s.getWorkspace)
	mux.HandleFunc("PUT /api/v1/workspace", s.putWorkspace)
}

func (s *Server) getWorkspace(w http.ResponseWriter, r *http.Request) {
	ws, err := s.store.GetOrCreateWorkspace(r.Context(), userOf(r), domain.DefaultLayout())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

func (s *Server) putWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Layout json.RawMessage `json:"layout"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		s.fail(w, r, err)
		return
	}
	if err := domain.ValidateLayout(body.Layout); err != nil {
		s.fail(w, r, err)
		return
	}
	ws, err := s.store.PutWorkspace(r.Context(), userOf(r), body.Layout)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, ws)
}
```

- [ ] **Step 6: Run all API tests**

Run: `make test-api`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add api
git commit -m "feat(api): add work block and workspace endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Supabase JWT authenticator

**Files:**
- Create: `api/internal/auth/supabase.go`
- Modify: `api/cmd/server/main.go` (`buildAuthenticator` gains the `supabase` case)
- Test: `api/internal/auth/supabase_test.go`

**Interfaces:**
- Consumes: `auth.Authenticator`, `auth.ErrUnauthenticated` (Task 6).
- Produces: `func NewSupabaseJWT(ctx context.Context, jwksURL, supabaseURL string) (*SupabaseJWT, error)`; `(*SupabaseJWT) Authenticate(r *http.Request) (uuid.UUID, error)`.

- [ ] **Step 1: Add dependencies**

Run: `cd api && go get github.com/golang-jwt/jwt/v5 github.com/MicahParks/keyfunc/v3`

- [ ] **Step 2: Write failing tests**

`api/internal/auth/supabase_test.go`:

```go
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
```

Note: in the `"no exp"` case `with("exp", nil)` sets the claim to JSON `null`, which `jwt.WithExpirationRequired()` must reject.

- [ ] **Step 3: Run to verify failure**

Run: `cd api && go test ./internal/auth/ -run TestSupabaseJWT -v`
Expected: FAIL to compile (`undefined: NewSupabaseJWT`).

- [ ] **Step 4: Implement `supabase.go`**

```go
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
```

- [ ] **Step 5: Wire it into `main.go`**

Add this case to the `switch` in `buildAuthenticator`:

```go
	case "supabase":
		if cfg.SupabaseURL == "" {
			return nil, errors.New("SUPABASE_URL is required when AUTH_MODE=supabase")
		}
		jwks := cfg.SupabaseJWKSURL
		if jwks == "" {
			jwks = strings.TrimRight(cfg.SupabaseURL, "/") + "/auth/v1/.well-known/jwks.json"
		}
		return auth.NewSupabaseJWT(ctx, jwks, cfg.SupabaseURL)
```

- [ ] **Step 6: Run all API tests and verify the guard**

Run: `make test-api`
Expected: all PASS.

Run: `cd api && APP_ENV=production AUTH_MODE=dev DATABASE_URL=postgres://sprint:sprint@localhost:5433/sprint?sslmode=disable go run ./cmd/server; echo "exit=$?"`
Expected: logs `AUTH_MODE=dev is not allowed when APP_ENV=production` and `exit=1`.

- [ ] **Step 7: Commit**

```bash
git add api
git commit -m "feat(api): verify Supabase JWTs via JWKS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Phase 2: Frontend core track

All frontend commands run from `app/`. Run one test file with `npm test -- src/domain/time.test.ts`.

### Task 9: Time, scheduling, and timeline helpers

**Files:**
- Create: `app/src/domain/time.ts`, `app/src/domain/scheduling.ts`, `app/src/domain/timeline.ts`
- Test: `app/src/domain/time.test.ts`, `app/src/domain/scheduling.test.ts`, `app/src/domain/timeline.test.ts`

**Interfaces:**
- Consumes: `Item`, `DropboxFilter`, `UpdateItemInput` from `src/api/types.ts`.
- Produces:
  - `time.ts`: `SNAP_MINUTES=15`, `DEFAULT_BLOCK_MINUTES=60`, `MIN_BLOCK_MINUTES=15`, `HOUR_PX=48`, `MINUTES_PER_DAY=1440`; `snapDown15(m)`, `roundTo15(m)`, `clamp(v, lo, hi)`, `weekStart(d): Date`, `weekDays(start): Date[]`, `toDateKey(d): string`, `fromDateKey(k): Date`, `atMinutes(day, minutes): Date`, `minutesSinceMidnight(d): number`, `startOfDayLocal(d)`, `endOfDayLocal(d)` (23:59), `shiftDays(d, n)`, `daysBetween(a, b)` (calendar days from a to b), `toLocalStamp(d): string` (`yyyy-MM-dd'T'HH:mm`)
  - `scheduling.ts`: `isScheduled(item)`, `filterItems(items, filter)`, `DROPBOX_FILTER_LABELS: Record<DropboxFilter, string>`
  - `timeline.ts`: `type TimelineShape = 'range' | 'deadline-marker' | 'hidden'`; `timelineShape(item)`; `setOpenDay(item, day): UpdateItemInput`; `setDeadlineDay(item, day): UpdateItemInput`; `shiftItemDays(item, n): UpdateItemInput`; `placeOnDay(item, day): UpdateItemInput`

- [ ] **Step 1: Write failing tests**

`app/src/domain/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  atMinutes, daysBetween, endOfDayLocal, fromDateKey, minutesSinceMidnight, roundTo15, shiftDays,
  snapDown15, toDateKey, toLocalStamp, weekDays, weekStart,
} from './time';

describe('time helpers', () => {
  it('snaps to 15-minute increments', () => {
    expect(snapDown15(74)).toBe(60);
    expect(snapDown15(75)).toBe(75);
    expect(roundTo15(67)).toBe(60);
    expect(roundTo15(68)).toBe(75);
  });

  it('starts weeks on Monday, including when today is Sunday', () => {
    const sunday = new Date(2026, 9, 11, 15, 0);
    expect(toDateKey(weekStart(sunday))).toBe('2026-10-05');
    expect(weekDays(weekStart(sunday)).map(toDateKey)).toEqual([
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
    ]);
  });

  it('round-trips date keys at local midnight', () => {
    const d = fromDateKey('2026-10-06');
    expect(d.getHours()).toBe(0);
    expect(toDateKey(d)).toBe('2026-10-06');
  });

  it('keeps wall-clock times across the DST change (2026-11-01, America/Los_Angeles)', () => {
    const dstDay = fromDateKey('2026-11-01');
    const sevenPm = atMinutes(dstDay, 19 * 60);
    expect(sevenPm.getHours()).toBe(19);
    expect(minutesSinceMidnight(sevenPm)).toBe(19 * 60);
    const nextWeek = shiftDays(fromDateKey('2026-10-29'), 4);
    expect(toDateKey(nextWeek)).toBe('2026-11-02');
    expect(nextWeek.getHours()).toBe(0);
    expect(daysBetween(fromDateKey('2026-10-26'), fromDateKey('2026-11-02'))).toBe(7);
  });

  it('formats local stamps and end of day', () => {
    expect(toLocalStamp(new Date(2026, 9, 6, 19, 5))).toBe('2026-10-06T19:05');
    const eod = endOfDayLocal(new Date(2026, 9, 9, 8, 0));
    expect([eod.getHours(), eod.getMinutes()]).toEqual([23, 59]);
  });
});
```

`app/src/domain/scheduling.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Item } from '../api/types';
import { filterItems, isScheduled } from './scheduling';

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id, title: id, description: null, open_at: null, deadline_at: null, status: 'active',
  work_block_count: 0, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  completed_at: null, ...over,
});

describe('filterItems', () => {
  const items = [
    item('unscheduled'),
    item('scheduled', { work_block_count: 2 }),
    item('done', { status: 'completed', work_block_count: 1 }),
  ];
  const ids = (f: Parameters<typeof filterItems>[1]) => filterItems(items, f).map((i) => i.id);

  it('derives scheduling from work blocks, not status', () => {
    expect(isScheduled(items[1])).toBe(true);
    expect(isScheduled(items[0])).toBe(false);
  });
  it('all = every active item, preserving order', () => expect(ids('all')).toEqual(['unscheduled', 'scheduled']));
  it('scheduled excludes completed', () => expect(ids('scheduled')).toEqual(['scheduled']));
  it('unscheduled', () => expect(ids('unscheduled')).toEqual(['unscheduled']));
  it('completed', () => expect(ids('completed')).toEqual(['done']));
});
```

`app/src/domain/timeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Item } from '../api/types';
import { fromDateKey } from './time';
import { placeOnDay, setDeadlineDay, setOpenDay, shiftItemDays, timelineShape } from './timeline';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const item = (over: Partial<Item> = {}): Item => ({
  id: 'i', title: 'i', description: null, open_at: null, deadline_at: null, status: 'active',
  work_block_count: 0, created_at: '', updated_at: '', completed_at: null, ...over,
});
const mon = local(2026, 10, 5);
const friEnd = local(2026, 10, 9, 23, 59);

describe('timelineShape', () => {
  it('range needs both dates', () => expect(timelineShape(item({ open_at: mon, deadline_at: friEnd }))).toBe('range'));
  it('deadline only is a marker', () => expect(timelineShape(item({ deadline_at: friEnd }))).toBe('deadline-marker'));
  it('open only is hidden', () => expect(timelineShape(item({ open_at: mon }))).toBe('hidden'));
  it('no dates is hidden', () => expect(timelineShape(item())).toBe('hidden'));
});

describe('edge edits', () => {
  const ranged = item({ open_at: mon, deadline_at: friEnd });

  it('left edge sets open_at to local midnight', () => {
    expect(setOpenDay(ranged, fromDateKey('2026-10-06'))).toEqual({ open_at: local(2026, 10, 6) });
  });
  it('left edge dragged past the deadline clamps to the deadline day', () => {
    expect(setOpenDay(ranged, fromDateKey('2026-10-12'))).toEqual({ open_at: local(2026, 10, 9) });
  });
  it('right edge sets deadline_at to 23:59', () => {
    expect(setDeadlineDay(ranged, fromDateKey('2026-10-10'))).toEqual({ deadline_at: local(2026, 10, 10, 23, 59) });
  });
  it('right edge dragged before the open day clamps to the open day', () => {
    expect(setDeadlineDay(ranged, fromDateKey('2026-10-01'))).toEqual({ deadline_at: local(2026, 10, 5, 23, 59) });
  });
});

describe('shiftItemDays', () => {
  it('moves both dates and keeps time of day', () => {
    expect(shiftItemDays(item({ open_at: mon, deadline_at: friEnd }), 2)).toEqual({
      open_at: local(2026, 10, 7), deadline_at: local(2026, 10, 11, 23, 59),
    });
  });
  it('moves only the dates that exist', () => {
    expect(shiftItemDays(item({ deadline_at: friEnd }), -1)).toEqual({ deadline_at: local(2026, 10, 8, 23, 59) });
  });
  it('zero days is an empty patch', () => expect(shiftItemDays(item({ open_at: mon }), 0)).toEqual({}));
});

describe('placeOnDay (Dropbox → Timeline)', () => {
  const wed = fromDateKey('2026-10-07');
  it('no dates → one-day range', () => {
    expect(placeOnDay(item(), wed)).toEqual({ open_at: local(2026, 10, 7), deadline_at: local(2026, 10, 7, 23, 59) });
  });
  it('open only → one-day range on that day', () => {
    expect(placeOnDay(item({ open_at: mon }), wed)).toEqual({ open_at: local(2026, 10, 7), deadline_at: local(2026, 10, 7, 23, 59) });
  });
  it('both dates → range moves so it opens on that day', () => {
    expect(placeOnDay(item({ open_at: mon, deadline_at: friEnd }), wed)).toEqual({
      open_at: local(2026, 10, 7), deadline_at: local(2026, 10, 11, 23, 59),
    });
  });
  it('deadline only, dropped on or before the deadline → opens that day, deadline kept', () => {
    expect(placeOnDay(item({ deadline_at: friEnd }), wed)).toEqual({ open_at: local(2026, 10, 7) });
  });
  it('deadline only, dropped after the deadline → one-day range on that day', () => {
    expect(placeOnDay(item({ deadline_at: friEnd }), fromDateKey('2026-10-12'))).toEqual({
      open_at: local(2026, 10, 12), deadline_at: local(2026, 10, 12, 23, 59),
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/domain`
Expected: FAIL (`Cannot find module './time'`).

- [ ] **Step 3: Implement `time.ts`**

```ts
import { addDays, differenceInCalendarDays, format, parse, startOfDay, startOfWeek } from 'date-fns';

export const SNAP_MINUTES = 15;
export const DEFAULT_BLOCK_MINUTES = 60;
export const MIN_BLOCK_MINUTES = 15;
export const HOUR_PX = 48;
export const MINUTES_PER_DAY = 1440;

export const snapDown15 = (m: number) => Math.floor(m / SNAP_MINUTES) * SNAP_MINUTES;
export const roundTo15 = (m: number) => Math.round(m / SNAP_MINUTES) * SNAP_MINUTES;
export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export const weekStart = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });
export const weekDays = (start: Date) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

export const toDateKey = (d: Date) => format(d, 'yyyy-MM-dd');
export const fromDateKey = (key: string) => parse(key, 'yyyy-MM-dd', new Date());
export const toLocalStamp = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

/** Local wall-clock time `minutes` after midnight of `day` (DST-safe). */
export function atMinutes(day: Date, minutes: number): Date {
  const d = startOfDay(day);
  d.setHours(0, minutes, 0, 0);
  return d;
}

export const minutesSinceMidnight = (d: Date) => d.getHours() * 60 + d.getMinutes();
export const startOfDayLocal = (d: Date) => startOfDay(d);
export function endOfDayLocal(d: Date): Date {
  const e = startOfDay(d);
  e.setHours(23, 59, 0, 0);
  return e;
}

/** Shift by whole calendar days, keeping wall-clock time. */
export const shiftDays = (d: Date, n: number) => addDays(d, n);
/** Calendar days from `a` to `b` (positive when b is later). */
export const daysBetween = (a: Date, b: Date) => differenceInCalendarDays(b, a);
```

- [ ] **Step 4: Implement `scheduling.ts`**

```ts
import type { DropboxFilter, Item } from '../api/types';

export const isScheduled = (item: Item) => item.work_block_count > 0;

export const DROPBOX_FILTER_LABELS: Record<DropboxFilter, string> = {
  all: 'All',
  unscheduled: 'Unscheduled',
  scheduled: 'Scheduled',
  completed: 'Completed',
};

/** Client-side Dropbox query (FUNCTIONAL_SPEC §6). Preserves input order. */
export function filterItems(items: Item[], filter: DropboxFilter): Item[] {
  switch (filter) {
    case 'all':
      return items.filter((i) => i.status === 'active');
    case 'scheduled':
      return items.filter((i) => i.status === 'active' && isScheduled(i));
    case 'unscheduled':
      return items.filter((i) => i.status === 'active' && !isScheduled(i));
    case 'completed':
      return items.filter((i) => i.status === 'completed');
  }
}
```

- [ ] **Step 5: Implement `timeline.ts`**

```ts
import type { Item, UpdateItemInput } from '../api/types';
import { daysBetween, endOfDayLocal, shiftDays, startOfDayLocal } from './time';

export type TimelineShape = 'range' | 'deadline-marker' | 'hidden';
type Dated = Pick<Item, 'open_at' | 'deadline_at'>;

const iso = (d: Date) => d.toISOString();
const date = (s: string) => new Date(s);

export function timelineShape(item: Dated): TimelineShape {
  if (item.open_at && item.deadline_at) return 'range';
  if (item.deadline_at) return 'deadline-marker';
  return 'hidden';
}

/** Left-edge drag. Never moves open_at past the deadline's day. */
export function setOpenDay(item: Dated, day: Date): UpdateItemInput {
  let open = startOfDayLocal(day);
  if (item.deadline_at) {
    const deadlineDay = startOfDayLocal(date(item.deadline_at));
    if (open > deadlineDay) open = deadlineDay;
  }
  return { open_at: iso(open) };
}

/** Right-edge drag. Never moves deadline_at before the open day. */
export function setDeadlineDay(item: Dated, day: Date): UpdateItemInput {
  let deadline = endOfDayLocal(day);
  if (item.open_at) {
    const openDay = startOfDayLocal(date(item.open_at));
    if (startOfDayLocal(day) < openDay) deadline = endOfDayLocal(openDay);
  }
  return { deadline_at: iso(deadline) };
}

export function shiftItemDays(item: Dated, n: number): UpdateItemInput {
  if (n === 0) return {};
  const patch: UpdateItemInput = {};
  if (item.open_at) patch.open_at = iso(shiftDays(date(item.open_at), n));
  if (item.deadline_at) patch.deadline_at = iso(shiftDays(date(item.deadline_at), n));
  return patch;
}

/** Dropbox → Timeline drop (spec §6.5). */
export function placeOnDay(item: Dated, day: Date): UpdateItemInput {
  const oneDay = { open_at: iso(startOfDayLocal(day)), deadline_at: iso(endOfDayLocal(day)) };
  if (item.open_at && item.deadline_at) {
    return shiftItemDays(item, daysBetween(startOfDayLocal(date(item.open_at)), startOfDayLocal(day)));
  }
  if (item.deadline_at) {
    const deadlineDay = startOfDayLocal(date(item.deadline_at));
    return startOfDayLocal(day) <= deadlineDay ? { open_at: oneDay.open_at } : oneDay;
  }
  return oneDay;
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- src/domain`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/domain
git commit -m "feat(app): add time, scheduling, and timeline domain helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Workspace layout tree operations

**Files:**
- Create: `app/src/domain/layout.ts`
- Test: `app/src/domain/layout.test.ts`

**Interfaces:**
- Consumes: `Layout`, `LayoutNode`, `SplitNode`, `ViewNode`, `ViewInstance` from `src/api/types.ts`.
- Produces: `type DockEdge = 'left' | 'right' | 'top' | 'bottom' | 'center'`; `DEFAULT_LAYOUT`; `genId(prefix)`; `listViews(layout): ViewNode[]`; `findView(layout, viewId): ViewNode | null`; `validateLayout(value: unknown): value is Layout`; `normalize(layout): Layout`; `setViewConfig(layout, viewId, config)`; `removeView(layout, viewId)`; `duplicateView(layout, viewId, newId?)`; `addView(layout, view, newId?)`; `setSizes(layout, splitId, sizes)`; `dockView(layout, viewId, targetViewId, edge)`. Every mutating op returns a new, normalized, valid layout, or the input layout unchanged if the result would be invalid (for example over 24 views or depth 8).

- [ ] **Step 1: Write failing tests**

`app/src/domain/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Layout, LayoutNode, SplitNode, ViewNode } from '../api/types';
import {
  DEFAULT_LAYOUT, addView, dockView, duplicateView, findView, listViews, normalize, removeView,
  setSizes, setViewConfig, validateLayout,
} from './layout';

const leaf = (id: string): ViewNode => ({ kind: 'view', id, view: { type: 'timeline', config: {} } });
const split = (id: string, direction: 'row' | 'column', children: LayoutNode[], sizes?: number[]): SplitNode => ({
  kind: 'split', id, direction, children, sizes: sizes ?? children.map(() => 1 / children.length),
});
const L = (root: LayoutNode | null): Layout => ({ version: 1, root });
const ids = (l: Layout) => listViews(l).map((v) => v.id);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('validateLayout', () => {
  it('accepts the default layout and an empty workspace', () => {
    expect(validateLayout(DEFAULT_LAYOUT)).toBe(true);
    expect(validateLayout(L(null))).toBe(true);
  });
  it.each([
    ['not an object', 'nope'],
    ['wrong version', { version: 2, root: null }],
    ['one-child split', L(split('s', 'row', [leaf('a')], [1]))],
    ['duplicate ids', L(split('s', 'row', [leaf('a'), leaf('a')]))],
    ['bad sizes', L(split('s', 'row', [leaf('a'), leaf('b')], [0.5, 0.2]))],
    ['unknown view type', L({ kind: 'view', id: 'a', view: { type: 'kanban', config: {} } } as unknown as LayoutNode)],
    ['bad dropbox filter', L({ kind: 'view', id: 'a', view: { type: 'dropbox', config: { filter: 'later' } } } as unknown as LayoutNode)],
    ['timeline config with keys', L({ kind: 'view', id: 'a', view: { type: 'timeline', config: { zoom: 1 } } } as unknown as LayoutNode)],
  ])('rejects %s', (_name, value) => {
    expect(validateLayout(value)).toBe(false);
  });
});

describe('normalize', () => {
  it('collapses single-child splits and renormalizes sizes', () => {
    const l = normalize(L(split('s', 'row', [split('inner', 'column', [leaf('a')], [1]), leaf('b')], [2, 2])));
    expect(l.root).toMatchObject({ kind: 'split', children: [{ id: 'a' }, { id: 'b' }], sizes: [0.5, 0.5] });
  });
  it('flattens nested splits with the same direction', () => {
    const l = normalize(L(split('s', 'row', [split('inner', 'row', [leaf('a'), leaf('b')], [0.5, 0.5]), leaf('c')], [0.5, 0.5])));
    expect((l.root as SplitNode).children.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect((l.root as SplitNode).sizes).toEqual([0.25, 0.25, 0.5]);
  });
});

describe('view operations', () => {
  it('setViewConfig changes only that view', () => {
    const l = setViewConfig(DEFAULT_LAYOUT, 'v-dropbox', { filter: 'unscheduled' });
    expect(findView(l, 'v-dropbox')?.view).toEqual({ type: 'dropbox', config: { filter: 'unscheduled' } });
    expect(findView(DEFAULT_LAYOUT, 'v-dropbox')?.view).toEqual({ type: 'dropbox', config: { filter: 'all' } });
  });

  it('removeView collapses the parent split', () => {
    const l = removeView(DEFAULT_LAYOUT, 'v-calendar');
    expect(ids(l)).toEqual(['v-dropbox', 'v-timeline']);
    expect(validateLayout(l)).toBe(true);
    expect(removeView(L(leaf('only')), 'only').root).toBeNull();
  });

  it('duplicateView inserts an independent copy to the right', () => {
    const l = duplicateView(DEFAULT_LAYOUT, 'v-dropbox', 'v-copy');
    expect(ids(l)).toEqual(['v-dropbox', 'v-copy', 'v-calendar', 'v-timeline']);
    const top = (l.root as SplitNode).children[0] as SplitNode;
    expect(top.direction).toBe('row');
    expect(sum(top.sizes)).toBeCloseTo(1);
    const again = setViewConfig(l, 'v-copy', { filter: 'scheduled' });
    expect(findView(again, 'v-dropbox')?.view.config).toEqual({ filter: 'all' });
  });

  it('addView places the new view at the right edge, or as root when empty', () => {
    const l = addView(DEFAULT_LAYOUT, { type: 'calendar', config: { mode: 'day' } }, 'v-new');
    expect(ids(l).at(-1)).toBe('v-new');
    expect(validateLayout(l)).toBe(true);
    expect(addView(L(null), { type: 'timeline', config: {} }, 'v-1').root).toMatchObject({ kind: 'view', id: 'v-1' });
  });

  it('refuses to exceed 24 views', () => {
    let l = L(leaf('v-0'));
    for (let i = 1; i < 24; i++) l = addView(l, { type: 'timeline', config: {} }, `v-${i}`);
    expect(listViews(l)).toHaveLength(24);
    expect(addView(l, { type: 'timeline', config: {} }, 'v-24')).toBe(l);
    expect(duplicateView(l, 'v-0', 'v-dup')).toBe(l);
  });

  it('setSizes updates one split and renormalizes', () => {
    const l = setSizes(DEFAULT_LAYOUT, 's-top', [1, 3]);
    expect((((l.root as SplitNode).children[0]) as SplitNode).sizes).toEqual([0.25, 0.75]);
  });
});

describe('dockView', () => {
  it('docking to the left of a target splits the target in a row', () => {
    const l = dockView(DEFAULT_LAYOUT, 'v-timeline', 'v-dropbox', 'left');
    expect(ids(l)).toEqual(['v-timeline', 'v-dropbox', 'v-calendar']);
    expect(validateLayout(l)).toBe(true);
  });
  it('docking to the bottom splits in a column', () => {
    const l = dockView(DEFAULT_LAYOUT, 'v-calendar', 'v-timeline', 'bottom');
    const root = l.root as SplitNode;
    expect(root.direction).toBe('column');
    expect(ids(l)).toEqual(['v-dropbox', 'v-timeline', 'v-calendar']);
  });
  it('center swaps the two views', () => {
    const l = dockView(DEFAULT_LAYOUT, 'v-dropbox', 'v-timeline', 'center');
    expect(ids(l)).toEqual(['v-timeline', 'v-calendar', 'v-dropbox']);
  });
  it('docking onto itself is a no-op', () => {
    expect(dockView(DEFAULT_LAYOUT, 'v-dropbox', 'v-dropbox', 'left')).toBe(DEFAULT_LAYOUT);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/domain/layout.test.ts`
Expected: FAIL (`Cannot find module './layout'`).

- [ ] **Step 3: Implement `layout.ts`**

```ts
import type { Layout, LayoutNode, SplitNode, ViewInstance, ViewNode } from '../api/types';

export type DockEdge = 'left' | 'right' | 'top' | 'bottom' | 'center';

export const MAX_DEPTH = 8;
export const MAX_VIEWS = 24;

export const DEFAULT_LAYOUT: Layout = {
  version: 1,
  root: {
    kind: 'split', id: 's-root', direction: 'column', sizes: [0.62, 0.38],
    children: [
      {
        kind: 'split', id: 's-top', direction: 'row', sizes: [0.32, 0.68],
        children: [
          { kind: 'view', id: 'v-dropbox', view: { type: 'dropbox', config: { filter: 'all' } } },
          { kind: 'view', id: 'v-calendar', view: { type: 'calendar', config: { mode: 'week' } } },
        ],
      },
      { kind: 'view', id: 'v-timeline', view: { type: 'timeline', config: {} } },
    ],
  },
};

export const genId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export function listViews(layout: Layout): ViewNode[] {
  const out: ViewNode[] = [];
  const walk = (n: LayoutNode) => (n.kind === 'view' ? out.push(n) : n.children.forEach(walk));
  if (layout.root) walk(layout.root);
  return out;
}

export const findView = (layout: Layout, viewId: string) => listViews(layout).find((v) => v.id === viewId) ?? null;

// ---------- validation (mirrors api/internal/domain/layout.go) ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const onlyKeys = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));

function validView(v: unknown): boolean {
  if (!isObj(v) || !onlyKeys(v, ['type', 'config']) || !isObj(v.config)) return false;
  const c = v.config;
  switch (v.type) {
    case 'dropbox':
      return onlyKeys(c, ['filter']) && ['all', 'scheduled', 'unscheduled', 'completed'].includes(c.filter as string);
    case 'timeline':
      return Object.keys(c).length === 0;
    case 'calendar':
      return onlyKeys(c, ['mode']) && (c.mode === 'week' || c.mode === 'day');
    default:
      return false;
  }
}

export function validateLayout(value: unknown): value is Layout {
  if (!isObj(value) || !onlyKeys(value, ['version', 'root']) || value.version !== 1) return false;
  if (value.root === null || value.root === undefined) return true;
  const ids = new Set<string>();
  let views = 0;
  const node = (n: unknown, depth: number): boolean => {
    if (depth > MAX_DEPTH || !isObj(n) || typeof n.id !== 'string' || n.id === '' || ids.has(n.id)) return false;
    ids.add(n.id);
    if (n.kind === 'view') {
      views++;
      return onlyKeys(n, ['kind', 'id', 'view']) && views <= MAX_VIEWS && validView(n.view);
    }
    if (n.kind !== 'split' || !onlyKeys(n, ['kind', 'id', 'direction', 'children', 'sizes'])) return false;
    if (n.direction !== 'row' && n.direction !== 'column') return false;
    if (!Array.isArray(n.children) || !Array.isArray(n.sizes) || n.children.length < 2) return false;
    if (n.sizes.length !== n.children.length || n.sizes.some((s) => typeof s !== 'number' || s <= 0)) return false;
    if (Math.abs((n.sizes as number[]).reduce((a, b) => a + b, 0) - 1) > 0.01) return false;
    return n.children.every((c) => node(c, depth + 1));
  };
  return node(value.root, 1);
}

// ---------- normalization ----------

function normNode(n: LayoutNode): LayoutNode | null {
  if (n.kind === 'view') return n;
  const kids: LayoutNode[] = [];
  const sizes: number[] = [];
  n.children.forEach((c, i) => {
    const nc = normNode(c);
    if (!nc) return;
    const s = n.sizes[i] > 0 ? n.sizes[i] : 0;
    if (nc.kind === 'split' && nc.direction === n.direction) {
      nc.children.forEach((gc, j) => {
        kids.push(gc);
        sizes.push(s * nc.sizes[j]);
      });
    } else {
      kids.push(nc);
      sizes.push(s);
    }
  });
  if (kids.length === 0) return null;
  if (kids.length === 1) return kids[0];
  const total = sizes.reduce((a, b) => a + b, 0);
  const norm = total > 0 && sizes.every((s) => s > 0) ? sizes.map((s) => s / total) : kids.map(() => 1 / kids.length);
  return { ...n, children: kids, sizes: norm };
}

export function normalize(layout: Layout): Layout {
  return { version: 1, root: layout.root ? normNode(layout.root) : null };
}

/** Apply `next`, normalized, only if the result is still valid; otherwise keep `prev`. */
function guard(prev: Layout, next: Layout): Layout {
  const n = normalize(next);
  return validateLayout(n) ? n : prev;
}

function mapNode(n: LayoutNode, fn: (n: LayoutNode) => LayoutNode): LayoutNode {
  const mapped = fn(n);
  if (mapped !== n || mapped.kind === 'view') return mapped;
  return { ...mapped, children: mapped.children.map((c) => mapNode(c, fn)) };
}

const mapLayout = (l: Layout, fn: (n: LayoutNode) => LayoutNode): Layout =>
  ({ version: 1, root: l.root ? mapNode(l.root, fn) : null });

function dropNode(n: LayoutNode, viewId: string): LayoutNode | null {
  if (n.kind === 'view') return n.id === viewId ? null : n;
  const kept: LayoutNode[] = [];
  const sizes: number[] = [];
  n.children.forEach((c, i) => {
    const r = dropNode(c, viewId);
    if (r) {
      kept.push(r);
      sizes.push(n.sizes[i]);
    }
  });
  return kept.length ? { ...n, children: kept, sizes } : null;
}

// ---------- operations ----------

export function setViewConfig<V extends ViewInstance>(layout: Layout, viewId: string, config: V['config']): Layout {
  return guard(layout, mapLayout(layout, (n) =>
    n.kind === 'view' && n.id === viewId ? { ...n, view: { ...n.view, config } as ViewInstance } : n));
}

export function removeView(layout: Layout, viewId: string): Layout {
  return guard(layout, { version: 1, root: layout.root ? dropNode(layout.root, viewId) : null });
}

export function duplicateView(layout: Layout, viewId: string, newId = genId('v')): Layout {
  const src = findView(layout, viewId);
  if (!src) return layout;
  const copy: ViewNode = { kind: 'view', id: newId, view: structuredClone(src.view) };
  return guard(layout, mapLayout(layout, (n) =>
    n.kind === 'view' && n.id === viewId
      ? { kind: 'split', id: genId('s'), direction: 'row', sizes: [0.5, 0.5], children: [n, copy] }
      : n));
}

export function addView(layout: Layout, view: ViewInstance, newId = genId('v')): Layout {
  const node: ViewNode = { kind: 'view', id: newId, view };
  if (!layout.root) return guard(layout, { version: 1, root: node });
  return guard(layout, {
    version: 1,
    root: { kind: 'split', id: genId('s'), direction: 'row', sizes: [0.7, 0.3], children: [layout.root, node] },
  });
}

export function setSizes(layout: Layout, splitId: string, sizes: number[]): Layout {
  return guard(layout, mapLayout(layout, (n) =>
    n.kind === 'split' && n.id === splitId && sizes.length === n.children.length ? { ...n, sizes } : n));
}

export function dockView(layout: Layout, viewId: string, targetViewId: string, edge: DockEdge): Layout {
  if (viewId === targetViewId) return layout;
  const src = findView(layout, viewId);
  const tgt = findView(layout, targetViewId);
  if (!src || !tgt) return layout;
  if (edge === 'center') {
    return guard(layout, mapLayout(layout, (n) =>
      n.kind === 'view' && n.id === viewId ? tgt : n.kind === 'view' && n.id === targetViewId ? src : n));
  }
  const without: Layout = { version: 1, root: layout.root ? dropNode(layout.root, viewId) : null };
  const direction = edge === 'left' || edge === 'right' ? 'row' : 'column';
  const first = edge === 'left' || edge === 'top';
  return guard(layout, mapLayout(without, (n) =>
    n.kind === 'view' && n.id === targetViewId
      ? { kind: 'split', id: genId('s'), direction, sizes: [0.5, 0.5], children: first ? [src, n] : [n, src] } as SplitNode
      : n));
}
```

Note on `mapNode`: when `fn` replaces a node, the replacement is not walked again. This stops `duplicateView` from recursing into the split it just created.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/domain/layout.test.ts`
Expected: PASS. If the `DEFAULT_LAYOUT` center-swap test fails because the swapped leaves are walked again, check that `mapNode` returns `mapped` without recursing when `mapped !== n`.

- [ ] **Step 5: Commit**

```bash
git add app/src/domain/layout.ts app/src/domain/layout.test.ts
git commit -m "feat(app): add workspace layout tree operations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: API client, query hooks, and optimistic cache

**Files:**
- Create: `app/src/api/config.ts`, `client.ts`, `ApiProvider.tsx`, `keys.ts`, `blockCache.ts`, `items.ts`, `workBlocks.ts`, `workspace.ts`; `app/src/ui/toastStore.ts`; `app/src/test/fakeApi.ts`, `app/src/test/render.tsx`
- Test: `app/src/api/client.test.ts`, `app/src/api/items.test.tsx`, `app/src/api/workBlocks.test.tsx`

**Interfaces:**
- Consumes: wire types (Task 3).
- Produces:
  - `config.ts`: `API_URL`, `AUTH_MODE: 'dev' | 'supabase'`, `resolveDevUser(): string | null` (URL `?devUser=` then `localStorage['sprint.devUser']` then `EXPO_PUBLIC_DEV_USER`), `setAccessTokenGetter(fn)`, `authHeaders()`
  - `client.ts`: `class ApiError { status; code; field? }`, `type HttpMethod`, `interface ApiClient { request<T>(method, path, body?, opts?: { keepalive?: boolean }): Promise<T> }`, `createApiClient({ baseUrl, headers, fetchImpl? })`
  - `ApiProvider.tsx`: `<ApiProvider client>`, `useApi()`, `createAppQueryClient()`
  - `keys.ts`: `qk.items`, `qk.workBlocks` (prefix), `qk.workBlocksRange(startIso, endIso)`, `qk.workBlocksItem(itemId)`, `qk.workspace`
  - `blockCache.ts`: `upsertBlockInCaches(qc, block)`, `removeBlocksFromCaches(qc, pred)`, `snapshotBlocks(qc)`, `restoreBlocks(qc, snap)`, `collectBlocks(qc): Map<string, WorkBlock>`
  - `items.ts`: `useItems()` (query data: `Item[]`, all statuses, newest first), `useItemsById(): Map<string, Item>`, `useCreateItem()` (vars `{ tempId, input }`), `useUpdateItem()` (vars `{ id, patch }`), `useDeleteItem()` (vars `{ id }`), `tempId(prefix): string`, `isTempId(id)`
  - `workBlocks.ts`: `useWorkBlocks({ start, end }: { start: Date; end: Date })` (data `WorkBlock[]`), `useItemWorkBlocks(itemId)`, `useCreateWorkBlock()` (vars `{ tempId, input }`), `useUpdateWorkBlock()` (vars `{ id, patch }`), `useDeleteWorkBlock()` (vars `{ id }`)
  - `workspace.ts`: `useWorkspace()` (data `WorkspaceResponse`)
  - `toastStore.ts`: `useToastStore`, `showToast(message)`; failure copy is exactly `Couldn't save — change reverted`
  - `test/fakeApi.ts`: `createFakeApi(seed?)` → `FakeApi` (in-memory server; `.items`, `.blocks`, `.layout`, `.calls`, `.failNext(pred?)`, `.hold(): () => void`); `makeItem(over)`, `makeBlock(over)`
  - `test/render.tsx`: `renderWithProviders(ui, { api? })`, `createWrapper(api)` returning `{ wrapper, qc }`

- [ ] **Step 1: Write the failing client test**

`app/src/api/client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createApiClient', () => {
  it('sends JSON with auth headers to /api/v1', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(201, { id: '1' }));
    const api = createApiClient({ baseUrl: 'http://x', headers: () => ({ 'X-Dev-User': 'u' }), fetchImpl });
    await expect(api.request('POST', '/items', { title: 't' })).resolves.toEqual({ id: '1' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://x/api/v1/items');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', 'X-Dev-User': 'u' });
    expect(init.body).toBe('{"title":"t"}');
  });

  it('returns undefined for 204', async () => {
    const api = createApiClient({ baseUrl: '', headers: () => ({}), fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 204 })) });
    await expect(api.request('DELETE', '/items/1')).resolves.toBeUndefined();
  });

  it('maps error bodies to ApiError', async () => {
    const api = createApiClient({ baseUrl: '', headers: () => ({}), fetchImpl: vi.fn().mockResolvedValue(json(400, { error: { code: 'validation_failed', message: 'bad', field: 'title' } })) });
    await expect(api.request('POST', '/items', {})).rejects.toMatchObject({ status: 400, code: 'validation_failed', field: 'title' });
  });

  it('maps network failures to ApiError with status 0', async () => {
    const api = createApiClient({ baseUrl: '', headers: () => ({}), fetchImpl: vi.fn().mockRejectedValue(new TypeError('offline')) });
    const err = await api.request('GET', '/items').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
  });
});
```

- [ ] **Step 2: Implement `config.ts`, `client.ts`, `ApiProvider.tsx`, `keys.ts`, `toastStore.ts`**

`app/src/api/config.ts`:

```ts
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';
export const AUTH_MODE: 'dev' | 'supabase' = process.env.EXPO_PUBLIC_AUTH_MODE === 'supabase' ? 'supabase' : 'dev';

const DEV_USER_KEY = 'sprint.devUser';

/** Dev-mode user: ?devUser= (persisted), then localStorage, then EXPO_PUBLIC_DEV_USER. */
export function resolveDevUser(): string | null {
  if (typeof window !== 'undefined') {
    const fromUrl = new URLSearchParams(window.location.search).get('devUser');
    try {
      if (fromUrl) {
        window.localStorage.setItem(DEV_USER_KEY, fromUrl);
        return fromUrl;
      }
      const stored = window.localStorage.getItem(DEV_USER_KEY);
      if (stored) return stored;
    } catch {
      if (fromUrl) return fromUrl;
    }
  }
  return process.env.EXPO_PUBLIC_DEV_USER || null;
}

let accessTokenGetter: (() => string | null) | null = null;
export function setAccessTokenGetter(fn: (() => string | null) | null) {
  accessTokenGetter = fn;
}

export function authHeaders(): Record<string, string> {
  if (AUTH_MODE === 'dev') {
    const user = resolveDevUser();
    return user ? { 'X-Dev-User': user } : {};
  }
  const token = accessTokenGetter?.();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
```

`app/src/api/client.ts`:

```ts
import type { ApiErrorBody, ApiErrorCode } from './types';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode | 'network',
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

export interface ApiClient {
  request<T>(method: HttpMethod, path: string, body?: unknown, opts?: { keepalive?: boolean }): Promise<T>;
}

export function createApiClient(opts: {
  baseUrl: string;
  headers: () => Record<string, string>;
  fetchImpl?: typeof fetch;
}): ApiClient {
  return {
    async request<T>(method: HttpMethod, path: string, body?: unknown, o?: { keepalive?: boolean }): Promise<T> {
      const doFetch = opts.fetchImpl ?? fetch;
      let res: Response;
      try {
        res = await doFetch(`${opts.baseUrl}/api/v1${path}`, {
          method,
          headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...opts.headers() },
          body: body === undefined ? undefined : JSON.stringify(body),
          keepalive: o?.keepalive,
        });
      } catch {
        throw new ApiError(0, 'network', 'Network error');
      }
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      const data = text ? JSON.parse(text) : undefined;
      if (!res.ok) {
        const err = (data as ApiErrorBody | undefined)?.error;
        throw new ApiError(res.status, err?.code ?? 'internal', err?.message ?? `HTTP ${res.status}`, err?.field);
      }
      return data as T;
    },
  };
}
```

`app/src/api/ApiProvider.tsx`:

```tsx
import { QueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient } from './client';

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}

/** Mutations never invalidate the items list: pending optimistic creates would vanish on refetch. */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
      mutations: { retry: 0 },
    },
  });
}
```

`app/src/api/keys.ts`:

```ts
export const qk = {
  items: ['items'] as const,
  workBlocks: ['workBlocks'] as const,
  workBlocksRange: (startIso: string, endIso: string) => ['workBlocks', 'range', startIso, endIso] as const,
  workBlocksItem: (itemId: string) => ['workBlocks', 'item', itemId] as const,
  workspace: ['workspace'] as const,
};
```

`app/src/ui/toastStore.ts`:

```ts
import { create } from 'zustand';

export const REVERTED_MESSAGE = "Couldn't save — change reverted";

interface Toast {
  id: number;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message) => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-2), { id, message }] });
    setTimeout(() => get().dismiss(id), 4000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const showToast = (message: string) => useToastStore.getState().show(message);
```

Run: `npm test -- src/api/client.test.ts` → PASS.

- [ ] **Step 3: Write the fake API and render helpers**

`app/src/test/fakeApi.ts`:

```ts
import { ApiError, type ApiClient, type HttpMethod } from '../api/client';
import type { Item, Layout, WorkBlock } from '../api/types';
import { DEFAULT_LAYOUT } from '../domain/layout';

let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const now = () => new Date().toISOString();

export const makeItem = (over: Partial<Item> = {}): Item => ({
  id: uid(), title: 'Item', description: null, open_at: null, deadline_at: null, status: 'active',
  work_block_count: 0, created_at: now(), updated_at: now(), completed_at: null, ...over,
});

export const makeBlock = (over: Partial<WorkBlock> & { item_id: string }): WorkBlock => ({
  id: uid(), start_at: '2026-10-06T16:00:00.000Z', end_at: '2026-10-06T17:00:00.000Z',
  created_at: now(), updated_at: now(), ...over,
});

export interface FakeApi extends ApiClient {
  items: Item[];
  blocks: WorkBlock[];
  layout: Layout;
  calls: { method: HttpMethod; path: string; body?: unknown }[];
  /** The next request matching `pred` (default: any) fails with HTTP 500. */
  failNext(pred?: (method: HttpMethod, path: string) => boolean): void;
  /** Holds every response until the returned release function is called. */
  hold(): () => void;
}

export function createFakeApi(seed: { items?: Item[]; blocks?: WorkBlock[]; layout?: Layout } = {}): FakeApi {
  let failPred: ((m: HttpMethod, p: string) => boolean) | null = null;
  let gate: Promise<void> | null = null;

  const withCount = (i: Item): Item => ({ ...i, work_block_count: api.blocks.filter((b) => b.item_id === i.id).length });
  const notFound = () => new ApiError(404, 'not_found', 'not found');

  const api: FakeApi = {
    items: seed.items ?? [],
    blocks: seed.blocks ?? [],
    layout: seed.layout ?? structuredClone(DEFAULT_LAYOUT),
    calls: [],
    failNext(pred = () => true) {
      failPred = pred;
    },
    hold() {
      let release!: () => void;
      gate = new Promise((r) => (release = r));
      return () => {
        gate = null;
        release();
      };
    },
    async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
      api.calls.push({ method, path, body });
      if (gate) await gate;
      if (failPred?.(method, path)) {
        failPred = null;
        throw new ApiError(500, 'internal', 'boom');
      }
      const [route, query = ''] = path.split('?');
      const params = new URLSearchParams(query);
      const id = route.split('/')[2];
      const b = body as Record<string, unknown>;

      if (route === '/items' && method === 'GET') {
        const status = params.get('status') ?? 'active';
        return { items: api.items.filter((i) => status === 'all' || i.status === status).map(withCount) } as T;
      }
      if (route === '/items' && method === 'POST') {
        const it = makeItem({ ...(b as Partial<Item>), title: String(b.title).trim() });
        api.items.unshift(it);
        return withCount(it) as T;
      }
      if (route.startsWith('/items/')) {
        const idx = api.items.findIndex((i) => i.id === id);
        if (idx < 0) throw notFound();
        if (method === 'PATCH') {
          const next = { ...api.items[idx], ...(b as Partial<Item>), updated_at: now() };
          if (b.status === 'completed' && api.items[idx].status !== 'completed') next.completed_at = now();
          if (b.status === 'active') next.completed_at = null;
          api.items[idx] = next;
          return withCount(next) as T;
        }
        if (method === 'DELETE') {
          api.items.splice(idx, 1);
          api.blocks = api.blocks.filter((x) => x.item_id !== id);
          return undefined as T;
        }
        return withCount(api.items[idx]) as T;
      }
      if (route === '/work-blocks' && method === 'GET') {
        const start = params.get('start');
        const end = params.get('end');
        const itemId = params.get('item_id');
        return {
          work_blocks: api.blocks.filter((x) =>
            (!itemId || x.item_id === itemId) &&
            (!start || !end || (Date.parse(x.end_at) > Date.parse(start) && Date.parse(x.start_at) < Date.parse(end)))),
        } as T;
      }
      if (route === '/work-blocks' && method === 'POST') {
        if (!api.items.some((i) => i.id === b.item_id)) throw notFound();
        const blk = makeBlock(b as Partial<WorkBlock> & { item_id: string });
        api.blocks.push(blk);
        return blk as T;
      }
      if (route.startsWith('/work-blocks/')) {
        const idx = api.blocks.findIndex((x) => x.id === id);
        if (idx < 0) throw notFound();
        if (method === 'PATCH') {
          api.blocks[idx] = { ...api.blocks[idx], ...(b as Partial<WorkBlock>), updated_at: now() };
          return api.blocks[idx] as T;
        }
        if (method === 'DELETE') {
          api.blocks.splice(idx, 1);
          return undefined as T;
        }
        return api.blocks[idx] as T;
      }
      if (route === '/workspace') {
        if (method === 'PUT') api.layout = b.layout as Layout;
        return { layout: api.layout, updated_at: now() } as T;
      }
      throw new Error(`fakeApi: unhandled ${method} ${path}`);
    },
  };
  return api;
}
```

`app/src/test/render.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ApiProvider } from '../api/ApiProvider';
import { createFakeApi, type FakeApi } from './fakeApi';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
}

export function createWrapper(api: FakeApi = createFakeApi()) {
  const qc = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider client={api}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </ApiProvider>
  );
  return { wrapper, qc, api };
}

export function renderWithProviders(ui: ReactElement, opts: { api?: FakeApi } = {}) {
  const { wrapper, qc, api } = createWrapper(opts.api);
  return { ...render(ui, { wrapper }), qc, api };
}
```

- [ ] **Step 4: Write failing hook tests**

`app/src/api/items.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeApi, makeBlock, makeItem } from '../test/fakeApi';
import { createWrapper } from '../test/render';
import { REVERTED_MESSAGE, useToastStore } from '../ui/toastStore';
import { qk } from './keys';
import { tempId, useCreateItem, useDeleteItem, useItems, useUpdateItem } from './items';
import { useWorkBlocks } from './workBlocks';
import type { Item, WorkBlock } from './types';

beforeEach(() => useToastStore.setState({ toasts: [] }));

describe('items hooks', () => {
  it('rapid captures appear immediately, in order, and none are lost', async () => {
    const { wrapper, qc, api } = createWrapper();
    const { result } = renderHook(() => ({ items: useItems(), create: useCreateItem() }), { wrapper });
    await waitFor(() => expect(result.current.items.isSuccess).toBe(true));

    const release = api.hold();
    await act(async () => {
      for (const title of ['A', 'B', 'C']) result.current.create.mutate({ tempId: tempId('i'), input: { title } });
    });
    expect(qc.getQueryData<Item[]>(qk.items)!.map((i) => i.title)).toEqual(['C', 'B', 'A']);

    release();
    await waitFor(() => expect(api.items).toHaveLength(3));
    await waitFor(() => {
      const items = qc.getQueryData<Item[]>(qk.items)!;
      expect(items.map((i) => i.title)).toEqual(['C', 'B', 'A']);
      expect(items.every((i) => !i.id.startsWith('tmp-'))).toBe(true);
    });
  });

  it('a failed update reverts and shows a toast', async () => {
    const api = createFakeApi({ items: [makeItem({ id: 'i1', title: 'Physics HW' })] });
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ items: useItems(), update: useUpdateItem() }), { wrapper });
    await waitFor(() => expect(result.current.items.isSuccess).toBe(true));

    api.failNext((m) => m === 'PATCH');
    await act(async () => result.current.update.mutate({ id: 'i1', patch: { title: 'Physics Assignment' } }));
    expect(qc.getQueryData<Item[]>(qk.items)![0].title).toBe('Physics Assignment');
    await waitFor(() => expect(qc.getQueryData<Item[]>(qk.items)![0].title).toBe('Physics HW'));
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(REVERTED_MESSAGE);
  });

  it('completing an item sets status and completed_at optimistically', async () => {
    const api = createFakeApi({ items: [makeItem({ id: 'i1' })] });
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ items: useItems(), update: useUpdateItem() }), { wrapper });
    await waitFor(() => expect(result.current.items.isSuccess).toBe(true));
    const release = api.hold();
    await act(async () => result.current.update.mutate({ id: 'i1', patch: { status: 'completed' } }));
    const it = qc.getQueryData<Item[]>(qk.items)![0];
    expect(it.status).toBe('completed');
    expect(it.completed_at).not.toBeNull();
    release();
  });

  it('deleting an item removes its blocks from every calendar cache immediately', async () => {
    const item = makeItem({ id: 'i1' });
    const api = createFakeApi({ items: [item], blocks: [makeBlock({ id: 'b1', item_id: 'i1' })] });
    const { wrapper, qc } = createWrapper(api);
    const range = { start: new Date('2026-10-05T07:00:00Z'), end: new Date('2026-10-12T07:00:00Z') };
    const { result } = renderHook(() => ({ items: useItems(), blocks: useWorkBlocks(range), del: useDeleteItem() }), { wrapper });
    await waitFor(() => expect(result.current.blocks.data).toHaveLength(1));

    const release = api.hold();
    await act(async () => result.current.del.mutate({ id: 'i1' }));
    expect(qc.getQueryData<Item[]>(qk.items)).toEqual([]);
    const blockCaches = qc.getQueriesData<WorkBlock[]>({ queryKey: qk.workBlocks });
    expect(blockCaches.every(([, data]) => !data || data.length === 0)).toBe(true);
    release();
    await waitFor(() => expect(api.items).toHaveLength(0));
  });
});
```

`app/src/api/workBlocks.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi, makeBlock, makeItem } from '../test/fakeApi';
import { createWrapper } from '../test/render';
import { qk } from './keys';
import { tempId, useItems } from './items';
import { useCreateWorkBlock, useUpdateWorkBlock, useWorkBlocks } from './workBlocks';
import type { Item, WorkBlock } from './types';

const week1 = { start: new Date('2026-10-05T07:00:00Z'), end: new Date('2026-10-12T07:00:00Z') };
const week2 = { start: new Date('2026-10-12T07:00:00Z'), end: new Date('2026-10-19T07:00:00Z') };

describe('work block hooks', () => {
  it('creating a block shows it and bumps the item count before the server answers', async () => {
    const api = createFakeApi({ items: [makeItem({ id: 'i1' })] });
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ items: useItems(), blocks: useWorkBlocks(week1), create: useCreateWorkBlock() }), { wrapper });
    await waitFor(() => expect(result.current.blocks.isSuccess && result.current.items.isSuccess).toBe(true));

    const release = api.hold();
    await act(async () => result.current.create.mutate({
      tempId: tempId('b'),
      input: { item_id: 'i1', start_at: '2026-10-07T02:00:00.000Z', end_at: '2026-10-07T03:00:00.000Z' },
    }));
    expect(result.current.blocks.data).toHaveLength(1);
    expect(qc.getQueryData<Item[]>(qk.items)![0].work_block_count).toBe(1);
    release();
    await waitFor(() => expect(result.current.blocks.data![0].id.startsWith('tmp-')).toBe(false));
  });

  it('a failed create removes the block and restores the count', async () => {
    const api = createFakeApi({ items: [makeItem({ id: 'i1' })] });
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ items: useItems(), blocks: useWorkBlocks(week1), create: useCreateWorkBlock() }), { wrapper });
    await waitFor(() => expect(result.current.blocks.isSuccess && result.current.items.isSuccess).toBe(true));
    api.failNext();
    await act(async () => result.current.create.mutate({
      tempId: tempId('b'),
      input: { item_id: 'i1', start_at: '2026-10-07T02:00:00.000Z', end_at: '2026-10-07T03:00:00.000Z' },
    }));
    await waitFor(() => expect(result.current.blocks.data).toHaveLength(0));
    expect(qc.getQueryData<Item[]>(qk.items)![0].work_block_count).toBe(0);
  });

  it('moving a block across weeks moves it between cached ranges', async () => {
    const api = createFakeApi({
      items: [makeItem({ id: 'i1' })],
      blocks: [makeBlock({ id: 'b1', item_id: 'i1', start_at: '2026-10-07T02:00:00.000Z', end_at: '2026-10-07T03:00:00.000Z' })],
    });
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ w1: useWorkBlocks(week1), w2: useWorkBlocks(week2), update: useUpdateWorkBlock() }), { wrapper });
    await waitFor(() => expect(result.current.w1.data).toHaveLength(1));
    await waitFor(() => expect(result.current.w2.isSuccess).toBe(true));

    await act(async () => result.current.update.mutate({ id: 'b1', patch: { start_at: '2026-10-14T02:00:00.000Z', end_at: '2026-10-14T03:00:00.000Z' } }));
    expect(qc.getQueryData<WorkBlock[]>(qk.workBlocksRange(week1.start.toISOString(), week1.end.toISOString()))).toHaveLength(0);
    expect(qc.getQueryData<WorkBlock[]>(qk.workBlocksRange(week2.start.toISOString(), week2.end.toISOString()))).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `npm test -- src/api`
Expected: FAIL (`Cannot find module './items'`).

- [ ] **Step 6: Implement `blockCache.ts`**

```ts
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { qk } from './keys';
import type { WorkBlock } from './types';

type Snapshot = [QueryKey, WorkBlock[] | undefined][];

function belongs(key: QueryKey, block: WorkBlock): boolean {
  if (key[1] === 'item') return key[2] === block.item_id;
  if (key[1] === 'range') {
    return Date.parse(block.start_at) < Date.parse(key[3] as string) && Date.parse(block.end_at) > Date.parse(key[2] as string);
  }
  return false;
}

const byStart = (a: WorkBlock, b: WorkBlock) => Date.parse(a.start_at) - Date.parse(b.start_at);

/** Insert or move `block` in every cached work-block list it belongs to (by range or item). */
export function upsertBlockInCaches(qc: QueryClient, block: WorkBlock, replaceId: string = block.id) {
  for (const [key, data] of qc.getQueriesData<WorkBlock[]>({ queryKey: qk.workBlocks })) {
    if (!data) continue;
    const rest = data.filter((b) => b.id !== replaceId && b.id !== block.id);
    qc.setQueryData<WorkBlock[]>(key, belongs(key, block) ? [...rest, block].sort(byStart) : rest);
  }
}

export function removeBlocksFromCaches(qc: QueryClient, pred: (b: WorkBlock) => boolean) {
  for (const [key, data] of qc.getQueriesData<WorkBlock[]>({ queryKey: qk.workBlocks })) {
    if (data) qc.setQueryData<WorkBlock[]>(key, data.filter((b) => !pred(b)));
  }
}

export const snapshotBlocks = (qc: QueryClient): Snapshot => qc.getQueriesData<WorkBlock[]>({ queryKey: qk.workBlocks });

export function restoreBlocks(qc: QueryClient, snap: Snapshot) {
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

export function collectBlocks(qc: QueryClient): Map<string, WorkBlock> {
  const out = new Map<string, WorkBlock>();
  for (const [, data] of qc.getQueriesData<WorkBlock[]>({ queryKey: qk.workBlocks })) data?.forEach((b) => out.set(b.id, b));
  return out;
}
```

- [ ] **Step 7: Implement `items.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { REVERTED_MESSAGE, showToast } from '../ui/toastStore';
import { useApi } from './ApiProvider';
import { removeBlocksFromCaches, restoreBlocks, snapshotBlocks } from './blockCache';
import { qk } from './keys';
import type { CreateItemInput, Item, ItemsResponse, UpdateItemInput } from './types';

let tempSeq = 0;
export const tempId = (prefix: string) => `tmp-${prefix}-${Date.now().toString(36)}-${++tempSeq}`;
export const isTempId = (id: string) => id.startsWith('tmp-');

export function useItems() {
  const api = useApi();
  return useQuery({
    queryKey: qk.items,
    queryFn: async () => (await api.request<ItemsResponse>('GET', '/items?status=all')).items,
  });
}

export function useItemsById(): Map<string, Item> {
  const { data } = useItems();
  return useMemo(() => new Map((data ?? []).map((i) => [i.id, i])), [data]);
}

export function useCreateItem() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['items', 'create'],
    mutationFn: ({ input }: { tempId: string; input: CreateItemInput }) => api.request<Item>('POST', '/items', input),
    onMutate: async ({ tempId: id, input }) => {
      await qc.cancelQueries({ queryKey: qk.items });
      const ts = new Date().toISOString();
      const temp: Item = {
        id, title: input.title.trim(), description: input.description ?? null, open_at: input.open_at ?? null,
        deadline_at: input.deadline_at ?? null, status: 'active', work_block_count: 0,
        created_at: ts, updated_at: ts, completed_at: null,
      };
      qc.setQueryData<Item[]>(qk.items, (old = []) => [temp, ...old]);
    },
    onSuccess: (item, { tempId: id }) => {
      qc.setQueryData<Item[]>(qk.items, (old = []) =>
        old.some((i) => i.id === id) ? old.map((i) => (i.id === id ? item : i)) : [item, ...old]);
    },
    onError: (_e, { tempId: id, input }) => {
      qc.setQueryData<Item[]>(qk.items, (old = []) => old.filter((i) => i.id !== id));
      showToast(`Couldn't add "${input.title.trim()}"`);
    },
  });
}

export function applyItemPatch(item: Item, patch: UpdateItemInput): Item {
  const next: Item = { ...item, ...patch };
  if (patch.status === 'completed' && item.status !== 'completed') next.completed_at = new Date().toISOString();
  if (patch.status === 'active') next.completed_at = null;
  return next;
}

export function useUpdateItem() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['items', 'update'],
    mutationFn: ({ id, patch }: { id: string; patch: UpdateItemInput }) => api.request<Item>('PATCH', `/items/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.items });
      const prev = qc.getQueryData<Item[]>(qk.items);
      qc.setQueryData<Item[]>(qk.items, (old = []) => old.map((i) => (i.id === id ? applyItemPatch(i, patch) : i)));
      return { prev };
    },
    onSuccess: (item) => qc.setQueryData<Item[]>(qk.items, (old = []) => old.map((i) => (i.id === item.id ? item : i))),
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.items, ctx.prev);
      showToast(REVERTED_MESSAGE);
    },
  });
}

export function useDeleteItem() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['items', 'delete'],
    mutationFn: ({ id }: { id: string }) => api.request<void>('DELETE', `/items/${id}`),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: qk.items });
      const prev = qc.getQueryData<Item[]>(qk.items);
      const blocks = snapshotBlocks(qc);
      qc.setQueryData<Item[]>(qk.items, (old = []) => old.filter((i) => i.id !== id));
      removeBlocksFromCaches(qc, (b) => b.item_id === id);
      return { prev, blocks };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.items, ctx.prev);
      if (ctx?.blocks) restoreBlocks(qc, ctx.blocks);
      showToast(REVERTED_MESSAGE);
    },
  });
}
```

- [ ] **Step 8: Implement `workBlocks.ts` and `workspace.ts`**

`app/src/api/workBlocks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REVERTED_MESSAGE, showToast } from '../ui/toastStore';
import { useApi } from './ApiProvider';
import { collectBlocks, removeBlocksFromCaches, restoreBlocks, snapshotBlocks, upsertBlockInCaches } from './blockCache';
import { qk } from './keys';
import type { CreateWorkBlockInput, Item, UpdateWorkBlockInput, WorkBlock, WorkBlocksResponse } from './types';

export function useWorkBlocks({ start, end }: { start: Date; end: Date }) {
  const api = useApi();
  const s = start.toISOString();
  const e = end.toISOString();
  return useQuery({
    queryKey: qk.workBlocksRange(s, e),
    queryFn: async () =>
      (await api.request<WorkBlocksResponse>('GET', `/work-blocks?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}`)).work_blocks,
  });
}

export function useItemWorkBlocks(itemId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: qk.workBlocksItem(itemId ?? ''),
    enabled: !!itemId && !itemId.startsWith('tmp-'),
    queryFn: async () => (await api.request<WorkBlocksResponse>('GET', `/work-blocks?item_id=${itemId}`)).work_blocks,
  });
}

function bumpCount(qc: ReturnType<typeof useQueryClient>, itemId: string, delta: number) {
  qc.setQueryData<Item[]>(qk.items, (old) =>
    old?.map((i) => (i.id === itemId ? { ...i, work_block_count: Math.max(0, i.work_block_count + delta) } : i)));
}

export function useCreateWorkBlock() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input }: { tempId: string; input: CreateWorkBlockInput }) => api.request<WorkBlock>('POST', '/work-blocks', input),
    onMutate: async ({ tempId, input }) => {
      await qc.cancelQueries({ queryKey: qk.workBlocks });
      const snap = snapshotBlocks(qc);
      const prevItems = qc.getQueryData<Item[]>(qk.items);
      const ts = new Date().toISOString();
      upsertBlockInCaches(qc, { id: tempId, ...input, created_at: ts, updated_at: ts });
      bumpCount(qc, input.item_id, +1);
      return { snap, prevItems };
    },
    onSuccess: (block, { tempId }) => upsertBlockInCaches(qc, block, tempId),
    onError: (_e, _v, ctx) => {
      if (ctx) {
        restoreBlocks(qc, ctx.snap);
        if (ctx.prevItems) qc.setQueryData(qk.items, ctx.prevItems);
      }
      showToast(REVERTED_MESSAGE);
    },
  });
}

export function useUpdateWorkBlock() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateWorkBlockInput }) => api.request<WorkBlock>('PATCH', `/work-blocks/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.workBlocks });
      const snap = snapshotBlocks(qc);
      const cur = collectBlocks(qc).get(id);
      if (cur) upsertBlockInCaches(qc, { ...cur, ...patch });
      return { snap };
    },
    onSuccess: (block) => upsertBlockInCaches(qc, block),
    onError: (_e, _v, ctx) => {
      if (ctx) restoreBlocks(qc, ctx.snap);
      showToast(REVERTED_MESSAGE);
    },
  });
}

export function useDeleteWorkBlock() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => api.request<void>('DELETE', `/work-blocks/${id}`),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: qk.workBlocks });
      const snap = snapshotBlocks(qc);
      const prevItems = qc.getQueryData<Item[]>(qk.items);
      const cur = collectBlocks(qc).get(id);
      removeBlocksFromCaches(qc, (b) => b.id === id);
      if (cur) bumpCount(qc, cur.item_id, -1);
      return { snap, prevItems };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) {
        restoreBlocks(qc, ctx.snap);
        if (ctx.prevItems) qc.setQueryData(qk.items, ctx.prevItems);
      }
      showToast(REVERTED_MESSAGE);
    },
  });
}
```

`app/src/api/workspace.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { useApi } from './ApiProvider';
import { qk } from './keys';
import type { WorkspaceResponse } from './types';

export function useWorkspace() {
  const api = useApi();
  return useQuery({
    queryKey: qk.workspace,
    queryFn: () => api.request<WorkspaceResponse>('GET', '/workspace'),
    staleTime: Infinity,
  });
}
```

- [ ] **Step 9: Run tests and typecheck**

Run: `npm test -- src/api && npm run typecheck`
Expected: PASS; tsc exits 0.

- [ ] **Step 10: Commit**

```bash
git add app/src/api app/src/ui/toastStore.ts app/src/test
git commit -m "feat(app): add API client and optimistic query hooks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Drag-and-drop foundation

**Files:**
- Create: `app/src/dnd/types.ts`, `planDrop.ts`, `dragStore.ts`, `DndProvider.tsx`, `hooks.ts`, `usePreviewAction.ts`
- Modify: `app/src/test/render.tsx` (wrap in `DndProvider`)
- Test: `app/src/dnd/planDrop.test.ts`

**Interfaces:**
- Consumes: time helpers (Task 9), `DockEdge` (Task 10), hooks and `collectBlocks` (Task 11).
- Produces:
  - `types.ts`: `DragPayload`, `DropData`, `Point`, `Rect`, `DropAction`, `DroppableData = { drop: DropData; getRect: () => Rect; getClipRect: () => Rect | null }`, `ACCEPTS: Record<DropData['kind'], DragPayload['kind'][]>`
  - `planDrop(payload, drop, ctx: DropContext): DropAction` where `DropContext = { pointerStart: Point; pointerEnd: Point; dropRect: Rect; activeInitialRect: Rect | null; items: Map<string, Item>; blocks: Map<string, WorkBlock> }`
  - `dragStore.ts`: `useDragStore` with `{ payload, pointerStart, pointer, activeInitialRect, begin(...), move(p), end() }`
  - `DndProvider({ children, onDock? })`: `onDock(action: Extract<DropAction, { type: 'dock' }>)`
  - `hooks.ts`: `useTypedDraggable({ id, payload, disabled? })` → `{ setNodeRef, listeners, attributes, isDragging }`; `useTypedDroppable({ id, drop })` → `{ setNodeRef, isOver, getRect }`
  - `usePreviewAction(drop, isOver, getRect): DropAction | null`
  - Any element that clips its contents (panel body, scroll containers) sets the attribute `data-drop-clip`. Drop targets only count where the pointer is also inside their nearest `data-drop-clip` ancestor.

- [ ] **Step 1: Write the types**

`app/src/dnd/types.ts`:

```ts
import type { UpdateItemInput } from '../api/types';
import type { DockEdge } from '../domain/layout';

export type DragPayload =
  | { kind: 'item'; itemId: string }
  | { kind: 'timelineBar'; itemId: string }
  | { kind: 'workBlock'; blockId: string }
  | { kind: 'panel'; viewId: string };

export type DropData =
  | { kind: 'calendarDay'; date: string } // yyyy-MM-dd local
  | { kind: 'timelineDay'; date: string }
  | { kind: 'panelZone'; viewId: string; edge: DockEdge };

export const ACCEPTS: Record<DropData['kind'], DragPayload['kind'][]> = {
  calendarDay: ['item', 'timelineBar', 'workBlock'],
  timelineDay: ['item', 'timelineBar'],
  panelZone: ['panel'],
};

export interface Point { x: number; y: number }
export interface Rect { top: number; left: number; width: number; height: number }

export type DropAction =
  | { type: 'createBlock'; itemId: string; startAt: string; endAt: string }
  | { type: 'moveBlock'; blockId: string; startAt: string; endAt: string }
  | { type: 'updateItem'; itemId: string; patch: UpdateItemInput }
  | { type: 'dock'; viewId: string; targetViewId: string; edge: DockEdge }
  | { type: 'none' };

export interface DroppableData {
  drop: DropData;
  getRect: () => Rect;
  getClipRect: () => Rect | null;
}

export const toRect = (r: { top: number; left: number; width: number; height: number }): Rect =>
  ({ top: r.top, left: r.left, width: r.width, height: r.height });
```

- [ ] **Step 2: Write failing `planDrop` tests**

`app/src/dnd/planDrop.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Item, WorkBlock } from '../api/types';
import { HOUR_PX } from '../domain/time';
import { planDrop, type DropContext } from './planDrop';

const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const item = (over: Partial<Item> = {}): Item => ({
  id: 'i1', title: 'Physics', description: null, open_at: null, deadline_at: null, status: 'active',
  work_block_count: 0, created_at: '', updated_at: '', completed_at: null, ...over,
});
const block: WorkBlock = { id: 'b1', item_id: 'i1', start_at: local(6, 19), end_at: local(6, 21), created_at: '', updated_at: '' };

const columnTop = 100;
const ctx = (over: Partial<DropContext> = {}): DropContext => ({
  pointerStart: { x: 0, y: 0 },
  pointerEnd: { x: 0, y: columnTop + 19 * HOUR_PX + 2 }, // 19:00 + 2px
  dropRect: { top: columnTop, left: 0, width: 120, height: 24 * HOUR_PX },
  activeInitialRect: null,
  items: new Map([['i1', item({ open_at: local(5, 0), deadline_at: local(9, 23, 59) })]]),
  blocks: new Map([['b1', block]]),
  ...over,
});
const tue = { kind: 'calendarDay', date: '2026-10-06' } as const;
const wed = { kind: 'calendarDay', date: '2026-10-07' } as const;

describe('planDrop → Calendar', () => {
  it('Dropbox item creates a 60-minute block at the slot under the pointer', () => {
    expect(planDrop({ kind: 'item', itemId: 'i1' }, tue, ctx())).toEqual({
      type: 'createBlock', itemId: 'i1', startAt: local(6, 19), endAt: local(6, 20),
    });
  });

  it('snaps down to the 15-minute slot', () => {
    const c = ctx({ pointerEnd: { x: 0, y: columnTop + 19 * HOUR_PX + HOUR_PX * 0.49 } }); // ~19:29
    expect(planDrop({ kind: 'item', itemId: 'i1' }, tue, c)).toMatchObject({ startAt: local(6, 19, 15) });
  });

  it('a timeline bar also creates a block and never touches item dates', () => {
    const a = planDrop({ kind: 'timelineBar', itemId: 'i1' }, tue, ctx());
    expect(a).toMatchObject({ type: 'createBlock', itemId: 'i1' });
  });

  it('clamps a drop near midnight so the block stays inside the day', () => {
    const c = ctx({ pointerEnd: { x: 0, y: columnTop + 23.9 * HOUR_PX } });
    expect(planDrop({ kind: 'item', itemId: 'i1' }, tue, c)).toMatchObject({ startAt: local(6, 23), endAt: local(7, 0) });
  });

  it('moving a block keeps its duration and respects where it was grabbed', () => {
    // grabbed 6px (7.5 min) below the block's top, dropped 6px below Wed 19:00
    const c = ctx({
      pointerStart: { x: 0, y: 500 + 6 },
      activeInitialRect: { top: 500, left: 0, width: 100, height: 2 * HOUR_PX },
      pointerEnd: { x: 0, y: columnTop + 19 * HOUR_PX + 6 },
    });
    expect(planDrop({ kind: 'workBlock', blockId: 'b1' }, wed, c)).toEqual({
      type: 'moveBlock', blockId: 'b1', startAt: local(7, 19), endAt: local(7, 21),
    });
  });

  it('an unknown item or block is a no-op', () => {
    expect(planDrop({ kind: 'item', itemId: 'nope' }, tue, ctx())).toEqual({ type: 'none' });
    expect(planDrop({ kind: 'workBlock', blockId: 'nope' }, tue, ctx())).toEqual({ type: 'none' });
  });
});

describe('planDrop → Timeline', () => {
  const day = (date: string) => ({ kind: 'timelineDay', date }) as const;

  it('Dropbox item with no dates becomes a one-day range', () => {
    const c = ctx({ items: new Map([['i1', item()]]) });
    expect(planDrop({ kind: 'item', itemId: 'i1' }, day('2026-10-07'), c)).toEqual({
      type: 'updateItem', itemId: 'i1', patch: { open_at: local(7, 0), deadline_at: local(7, 23, 59) },
    });
  });

  it('dragging a bar shifts it by whole columns of pointer movement', () => {
    const c = ctx({ pointerStart: { x: 100, y: 0 }, pointerEnd: { x: 100 + 2 * 120 + 10, y: 0 } });
    expect(planDrop({ kind: 'timelineBar', itemId: 'i1' }, day('2026-10-08'), c)).toEqual({
      type: 'updateItem', itemId: 'i1', patch: { open_at: local(7, 0), deadline_at: local(11, 23, 59) },
    });
  });

  it('a bar dropped back where it started is a no-op', () => {
    const c = ctx({ pointerStart: { x: 100, y: 0 }, pointerEnd: { x: 130, y: 0 } });
    expect(planDrop({ kind: 'timelineBar', itemId: 'i1' }, day('2026-10-05'), c)).toEqual({ type: 'none' });
  });
});

describe('planDrop → panels', () => {
  it('docks a panel onto another panel', () => {
    expect(planDrop({ kind: 'panel', viewId: 'a' }, { kind: 'panelZone', viewId: 'b', edge: 'left' }, ctx()))
      .toEqual({ type: 'dock', viewId: 'a', targetViewId: 'b', edge: 'left' });
  });
  it('dropping a panel on itself is a no-op', () => {
    expect(planDrop({ kind: 'panel', viewId: 'a' }, { kind: 'panelZone', viewId: 'a', edge: 'left' }, ctx())).toEqual({ type: 'none' });
  });
  it('rejects payloads the target does not accept', () => {
    expect(planDrop({ kind: 'panel', viewId: 'a' }, tue, ctx())).toEqual({ type: 'none' });
    expect(planDrop({ kind: 'workBlock', blockId: 'b1' }, { kind: 'timelineDay', date: '2026-10-07' }, ctx())).toEqual({ type: 'none' });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/dnd`
Expected: FAIL (`Cannot find module './planDrop'`).

- [ ] **Step 4: Implement `planDrop.ts`**

```ts
import type { Item, WorkBlock } from '../api/types';
import {
  DEFAULT_BLOCK_MINUTES, HOUR_PX, MINUTES_PER_DAY, atMinutes, clamp, fromDateKey, roundTo15, snapDown15,
} from '../domain/time';
import { placeOnDay, shiftItemDays } from '../domain/timeline';
import { ACCEPTS, type DragPayload, type DropAction, type DropData, type Point, type Rect } from './types';

export interface DropContext {
  pointerStart: Point;
  pointerEnd: Point;
  dropRect: Rect;
  activeInitialRect: Rect | null;
  items: Map<string, Item>;
  blocks: Map<string, WorkBlock>;
}

const NONE: DropAction = { type: 'none' };
const pxToMinutes = (px: number) => (px / HOUR_PX) * 60;
const iso = (d: Date) => d.toISOString();
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

/** The one place that decides what a drop means (FUNCTIONAL_SPEC §12, FEATURE_DESIGN §18). */
export function planDrop(payload: DragPayload, drop: DropData, ctx: DropContext): DropAction {
  if (!ACCEPTS[drop.kind].includes(payload.kind)) return NONE;

  if (drop.kind === 'panelZone') {
    if (payload.kind !== 'panel' || payload.viewId === drop.viewId) return NONE;
    return { type: 'dock', viewId: payload.viewId, targetViewId: drop.viewId, edge: drop.edge };
  }

  const day = fromDateKey(drop.date);
  const pointerMinutes = pxToMinutes(ctx.pointerEnd.y - ctx.dropRect.top);

  if (drop.kind === 'calendarDay') {
    if (payload.kind === 'item' || payload.kind === 'timelineBar') {
      if (!ctx.items.has(payload.itemId)) return NONE;
      const minutes = clamp(snapDown15(pointerMinutes), 0, MINUTES_PER_DAY - DEFAULT_BLOCK_MINUTES);
      const start = atMinutes(day, minutes);
      return { type: 'createBlock', itemId: payload.itemId, startAt: iso(start), endAt: iso(addMinutes(start, DEFAULT_BLOCK_MINUTES)) };
    }
    if (payload.kind === 'workBlock') {
      const block = ctx.blocks.get(payload.blockId);
      if (!block) return NONE;
      const duration = Math.round((Date.parse(block.end_at) - Date.parse(block.start_at)) / 60_000);
      const grab = ctx.activeInitialRect ? pxToMinutes(ctx.pointerStart.y - ctx.activeInitialRect.top) : 0;
      const minutes = clamp(roundTo15(pointerMinutes - grab), 0, Math.max(0, MINUTES_PER_DAY - duration));
      const start = atMinutes(day, minutes);
      return { type: 'moveBlock', blockId: block.id, startAt: iso(start), endAt: iso(addMinutes(start, duration)) };
    }
    return NONE;
  }

  // timelineDay
  if (payload.kind === 'item' || payload.kind === 'timelineBar') {
    const item = ctx.items.get(payload.itemId);
    if (!item) return NONE;
    if (payload.kind === 'item') return { type: 'updateItem', itemId: item.id, patch: placeOnDay(item, day) };
    const days = Math.round((ctx.pointerEnd.x - ctx.pointerStart.x) / ctx.dropRect.width);
    const patch = shiftItemDays(item, days);
    return Object.keys(patch).length ? { type: 'updateItem', itemId: item.id, patch } : NONE;
  }
  return NONE;
}
```

Run: `npm test -- src/dnd` → PASS.

- [ ] **Step 5: Implement the drag store, hooks, and preview hook**

`app/src/dnd/dragStore.ts`:

```ts
import { create } from 'zustand';
import type { DragPayload, Point, Rect } from './types';

interface DragState {
  payload: DragPayload | null;
  pointerStart: Point;
  pointer: Point;
  activeInitialRect: Rect | null;
  begin: (s: { payload: DragPayload; pointerStart: Point; activeInitialRect: Rect | null }) => void;
  move: (p: Point) => void;
  end: () => void;
}

const ORIGIN = { x: 0, y: 0 };

export const useDragStore = create<DragState>((set) => ({
  payload: null,
  pointerStart: ORIGIN,
  pointer: ORIGIN,
  activeInitialRect: null,
  begin: ({ payload, pointerStart, activeInitialRect }) => set({ payload, pointerStart, pointer: pointerStart, activeInitialRect }),
  move: (pointer) => set({ pointer }),
  end: () => set({ payload: null, activeInitialRect: null }),
}));
```

`app/src/dnd/hooks.ts`:

```ts
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useCallback, useRef } from 'react';
import { useDragStore } from './dragStore';
import { ACCEPTS, toRect, type DragPayload, type DropData, type DroppableData, type Rect } from './types';

export function useTypedDraggable({ id, payload, disabled }: { id: string; payload: DragPayload; disabled?: boolean }) {
  const d = useDraggable({ id, data: { payload }, disabled });
  return { setNodeRef: d.setNodeRef, listeners: d.listeners, attributes: d.attributes, isDragging: d.isDragging };
}

export function useTypedDroppable({ id, drop }: { id: string; drop: DropData }) {
  const active = useDragStore((s) => s.payload);
  const nodeRef = useRef<HTMLElement | null>(null);
  // Never disabled before a drag starts, so dnd-kit measures every target at drag start.
  const disabled = !!active && !ACCEPTS[drop.kind].includes(active.kind);
  const getRect = useCallback((): Rect => toRect(nodeRef.current?.getBoundingClientRect() ?? { top: 0, left: 0, width: 0, height: 0 }), []);
  const getClipRect = useCallback((): Rect | null => {
    const clip = nodeRef.current?.parentElement?.closest('[data-drop-clip]');
    return clip ? toRect(clip.getBoundingClientRect()) : null;
  }, []);
  const data: DroppableData = { drop, getRect, getClipRect };
  const d = useDroppable({ id, disabled, data });
  const setNodeRef = useCallback((el: HTMLElement | null) => {
    nodeRef.current = el;
    d.setNodeRef(el);
  }, [d.setNodeRef]);
  return { setNodeRef, isOver: d.isOver && !disabled, getRect };
}
```

`app/src/dnd/usePreviewAction.ts`:

```ts
import { useQueryClient } from '@tanstack/react-query';
import { collectBlocks } from '../api/blockCache';
import { useItemsById } from '../api/items';
import { useDragStore } from './dragStore';
import { planDrop } from './planDrop';
import type { DropAction, DropData, Rect } from './types';

/** What releasing here would do right now; null when nothing is hovering this target. */
export function usePreviewAction(drop: DropData, isOver: boolean, getRect: () => Rect): DropAction | null {
  const qc = useQueryClient();
  const items = useItemsById();
  const payload = useDragStore((s) => s.payload);
  const pointer = useDragStore((s) => (isOver ? s.pointer : null));
  const pointerStart = useDragStore((s) => s.pointerStart);
  const activeInitialRect = useDragStore((s) => s.activeInitialRect);
  if (!isOver || !payload || !pointer) return null;
  return planDrop(payload, drop, {
    pointerStart, pointerEnd: pointer, dropRect: getRect(), activeInitialRect, items, blocks: collectBlocks(qc),
  });
}
```

- [ ] **Step 6: Implement `DndProvider.tsx`**

```tsx
import {
  DndContext, DragOverlay, MeasuringStrategy, PointerSensor, pointerWithin, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, type ReactNode } from 'react';
import { collectBlocks } from '../api/blockCache';
import { tempId, useItemsById, useUpdateItem } from '../api/items';
import { useCreateWorkBlock, useUpdateWorkBlock } from '../api/workBlocks';
import { tokens } from '../ui/tokens';
import { useDragStore } from './dragStore';
import { planDrop } from './planDrop';
import { toRect, type DragPayload, type DropAction, type DroppableData, type Point } from './types';

export type DockAction = Extract<DropAction, { type: 'dock' }>;

const inside = (p: Point, r: { top: number; left: number; width: number; height: number }) =>
  p.x >= r.left && p.x <= r.left + r.width && p.y >= r.top && p.y <= r.top + r.height;

/** pointerWithin, minus targets whose visible (clipped) area does not contain the pointer. */
const clippedPointerWithin: CollisionDetection = (args) => {
  const p = args.pointerCoordinates;
  if (!p) return [];
  return pointerWithin(args).filter((c) => {
    const data = args.droppableContainers.find((d) => d.id === c.id)?.data.current as DroppableData | undefined;
    const clip = data?.getClipRect();
    return !clip || inside(p, clip);
  });
};

export function DndProvider({ children, onDock }: { children: ReactNode; onDock?: (a: DockAction) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const qc = useQueryClient();
  const items = useItemsById();
  const createBlock = useCreateWorkBlock();
  const updateBlock = useUpdateWorkBlock();
  const updateItem = useUpdateItem();
  const store = useDragStore;
  const moveListener = useRef<((e: PointerEvent) => void) | null>(null);

  const stopTracking = () => {
    if (moveListener.current) window.removeEventListener('pointermove', moveListener.current);
    moveListener.current = null;
  };

  const onDragStart = useCallback((e: DragStartEvent) => {
    const payload = e.active.data.current?.payload as DragPayload | undefined;
    if (!payload) return;
    const ev = e.activatorEvent as PointerEvent;
    const initial = e.active.rect.current.initial;
    store.getState().begin({
      payload,
      pointerStart: { x: ev.clientX, y: ev.clientY },
      activeInitialRect: initial ? toRect(initial) : null,
    });
    stopTracking();
    moveListener.current = (pe: PointerEvent) => store.getState().move({ x: pe.clientX, y: pe.clientY });
    window.addEventListener('pointermove', moveListener.current);
  }, [store]);

  const execute = useCallback((a: DropAction) => {
    switch (a.type) {
      case 'createBlock':
        createBlock.mutate({ tempId: tempId('b'), input: { item_id: a.itemId, start_at: a.startAt, end_at: a.endAt } });
        break;
      case 'moveBlock':
        updateBlock.mutate({ id: a.blockId, patch: { start_at: a.startAt, end_at: a.endAt } });
        break;
      case 'updateItem':
        updateItem.mutate({ id: a.itemId, patch: a.patch });
        break;
      case 'dock':
        onDock?.(a);
        break;
    }
  }, [createBlock, updateBlock, updateItem, onDock]);

  const onDragEnd = useCallback((e: DragEndEvent) => {
    stopTracking();
    const s = store.getState();
    const payload = s.payload;
    s.end();
    const data = e.over?.data.current as DroppableData | undefined;
    if (!payload || !data) return;
    execute(planDrop(payload, data.drop, {
      pointerStart: s.pointerStart, pointerEnd: s.pointer, dropRect: data.getRect(),
      activeInitialRect: s.activeInitialRect, items, blocks: collectBlocks(qc),
    }));
  }, [store, execute, items, qc]);

  const onDragCancel = useCallback(() => {
    stopTracking();
    store.getState().end();
  }, [store]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={clippedPointerWithin}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        <DragChip />
      </DragOverlay>
    </DndContext>
  );
}

function DragChip() {
  const payload = useDragStore((s) => s.payload);
  const items = useItemsById();
  const qc = useQueryClient();
  if (!payload) return null;
  let label = 'View';
  if (payload.kind === 'item' || payload.kind === 'timelineBar') label = items.get(payload.itemId)?.title ?? '';
  if (payload.kind === 'workBlock') {
    const b = collectBlocks(qc).get(payload.blockId);
    label = (b && items.get(b.item_id)?.title) ?? '';
  }
  return (
    <div
      style={{
        display: 'inline-block', maxWidth: 260, padding: '6px 10px', borderRadius: tokens.radius.md,
        background: tokens.color.panel, boxShadow: tokens.shadow.drag, border: `1px solid ${tokens.color.border}`,
        fontSize: tokens.font.size.sm, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis', pointerEvents: 'none',
      }}
    >
      {label}
    </div>
  );
}
```

Update `app/src/test/render.tsx` so both helpers include the provider (views under test register draggables):

```tsx
// in createWrapper's wrapper, inside QueryClientProvider:
<QueryClientProvider client={qc}>
  <DndProvider>{children}</DndProvider>
</QueryClientProvider>
```

(add `import { DndProvider } from '../dnd/DndProvider';`).

- [ ] **Step 7: Run all tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS; tsc exits 0.

- [ ] **Step 8: Commit**

```bash
git add app/src/dnd app/src/test/render.tsx
git commit -m "feat(app): add drag-and-drop foundation with pure drop planning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: App shell, auth gate, workspace host, and UI primitives

**Files:**
- Create: `app/src/app/Shell.tsx`, `app/src/app/TopBar.tsx`, `app/src/auth/AuthGate.tsx`, `LoginScreen.tsx`, `supabase.ts`, `app/src/ui/Menu.tsx`, `Toast.tsx`, `itemDetailStore.ts`, `captureBus.ts`, `app/src/workspace/Workspace.web.tsx`, `Workspace.tsx`, `LayoutNodeView.tsx`, `Panel.tsx`, `ViewHost.tsx`, `viewTypes.ts`, `useWorkspaceLayout.ts`, `panelTitle.ts`
- Create stubs (replaced by Tasks 14–17): `app/src/views/dropbox/DropboxView.tsx`, `app/src/views/timeline/TimelineView.tsx`, `app/src/views/calendar/CalendarView.tsx`, `app/src/views/item/ItemDetailHost.tsx`
- Modify: `app/App.tsx`
- Test: `app/src/workspace/useWorkspaceLayout.test.tsx`, `app/src/workspace/Workspace.test.tsx`, `app/src/auth/AuthGate.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 9–12.
- Produces:
  - `viewTypes.ts`: `interface ViewProps<C> { viewId: string; config: C; setConfig: (config: C) => void }`
  - `useWorkspaceLayout.ts`: `useWorkspaceLayout(): LayoutApi` where `LayoutApi = { layout: Layout | null; isLoading: boolean; update: (fn: (l: Layout) => Layout) => void }`; `LayoutContext`; `useLayout(): LayoutApi`; `SAVE_DEBOUNCE_MS = 500`
  - `panelTitle(view: ViewInstance): string`
  - `Panel({ node }: { node: ViewNode })`: renders `panel-{id}` with `data-view-type`, a header, and a body marked `data-drop-clip`
  - `ui/Menu.tsx`: `Menu({ trigger, items, align? })` with `MenuItem = { key; label; onSelect; testID?; danger?; checked? }`
  - `ui/itemDetailStore.ts`: `useItemDetailStore` `{ itemId, anchor: Rect | null, open(itemId, anchor?), close() }`
  - `ui/captureBus.ts`: `registerCapture(focus: () => void): () => void`, `focusCapture(): void`
  - `ui/Toast.tsx`: `ToastHost`
  - `auth/AuthGate.tsx`: `AuthGate({ children, mode? })`; `auth/supabase.ts`: `getSupabase()`, `useSupabaseSession()`
  - View stubs export `DropboxView`, `TimelineView`, `CalendarView` (each `(props: ViewProps<...>) => JSX.Element`) and `ItemDetailHost` (`() => JSX.Element | null`).

- [ ] **Step 1: Write the view prop type, stubs, and small stores**

`app/src/workspace/viewTypes.ts`:

```ts
export interface ViewProps<C> {
  viewId: string;
  config: C;
  setConfig: (config: C) => void;
}
```

Stubs (each task in Phase 3 replaces its own file wholesale):

```tsx
// app/src/views/dropbox/DropboxView.tsx
import type { DropboxFilter } from '../../api/types';
import type { ViewProps } from '../../workspace/viewTypes';
export function DropboxView(_props: ViewProps<{ filter: DropboxFilter }>) {
  return <div>Dropbox</div>;
}
```

```tsx
// app/src/views/timeline/TimelineView.tsx
import type { ViewProps } from '../../workspace/viewTypes';
export function TimelineView(_props: ViewProps<Record<string, never>>) {
  return <div>Timeline</div>;
}
```

```tsx
// app/src/views/calendar/CalendarView.tsx
import type { CalendarMode } from '../../api/types';
import type { ViewProps } from '../../workspace/viewTypes';
export function CalendarView(_props: ViewProps<{ mode: CalendarMode }>) {
  return <div>Calendar</div>;
}
```

```tsx
// app/src/views/item/ItemDetailHost.tsx
export function ItemDetailHost() {
  return null;
}
```

`app/src/ui/itemDetailStore.ts`:

```ts
import { create } from 'zustand';
import type { Rect } from '../dnd/types';

interface ItemDetailState {
  itemId: string | null;
  anchor: Rect | null;
  open: (itemId: string, anchor?: Rect | null) => void;
  close: () => void;
}

export const useItemDetailStore = create<ItemDetailState>((set) => ({
  itemId: null,
  anchor: null,
  open: (itemId, anchor = null) => set({ itemId, anchor }),
  close: () => set({ itemId: null, anchor: null }),
}));
```

`app/src/ui/captureBus.ts`:

```ts
/** Lets "+ Item" and the N shortcut focus the most recently mounted Dropbox capture input. */
const stack: (() => void)[] = [];

export function registerCapture(focus: () => void): () => void {
  stack.push(focus);
  return () => {
    const i = stack.lastIndexOf(focus);
    if (i >= 0) stack.splice(i, 1);
  };
}

export function focusCapture(): void {
  stack.at(-1)?.();
}
```

- [ ] **Step 2: Write failing `useWorkspaceLayout` tests**

`app/src/workspace/useWorkspaceLayout.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Layout } from '../api/types';
import { DEFAULT_LAYOUT, setViewConfig } from '../domain/layout';
import { createFakeApi } from '../test/fakeApi';
import { createWrapper } from '../test/render';
import { SAVE_DEBOUNCE_MS, useWorkspaceLayout } from './useWorkspaceLayout';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

const puts = (api: ReturnType<typeof createFakeApi>) => api.calls.filter((c) => c.method === 'PUT');

describe('useWorkspaceLayout', () => {
  it('coalesces rapid layout edits into one debounced PUT', async () => {
    const api = createFakeApi();
    const { wrapper } = createWrapper(api);
    const { result } = renderHook(() => useWorkspaceLayout(), { wrapper });
    await waitFor(() => expect(result.current.layout).not.toBeNull());

    act(() => {
      result.current.update((l) => setViewConfig(l, 'v-dropbox', { filter: 'scheduled' }));
      result.current.update((l) => setViewConfig(l, 'v-dropbox', { filter: 'unscheduled' }));
      result.current.update((l) => setViewConfig(l, 'v-calendar', { mode: 'day' }));
    });
    expect(puts(api)).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS + 10);
    });
    await waitFor(() => expect(puts(api)).toHaveLength(1));
    const saved = (puts(api)[0].body as { layout: Layout }).layout;
    expect(JSON.stringify(saved)).toContain('"unscheduled"');
    expect(JSON.stringify(saved)).toContain('"day"');
  });

  it('falls back to the default layout when the stored one is invalid, and re-saves it', async () => {
    const api = createFakeApi({ layout: { version: 1, root: { kind: 'split', id: 's', direction: 'row', sizes: [1], children: [] } } as unknown as Layout });
    const { wrapper } = createWrapper(api);
    const { result } = renderHook(() => useWorkspaceLayout(), { wrapper });
    await waitFor(() => expect(result.current.layout).toEqual(DEFAULT_LAYOUT));
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS + 10);
    });
    await waitFor(() => expect(puts(api)).toHaveLength(1));
  });

  it('flushes a pending save on unmount', async () => {
    const api = createFakeApi();
    const { wrapper } = createWrapper(api);
    const { result, unmount } = renderHook(() => useWorkspaceLayout(), { wrapper });
    await waitFor(() => expect(result.current.layout).not.toBeNull());
    act(() => result.current.update((l) => setViewConfig(l, 'v-dropbox', { filter: 'completed' })));
    unmount();
    await waitFor(() => expect(puts(api)).toHaveLength(1));
  });
});
```

- [ ] **Step 3: Implement `useWorkspaceLayout.ts`**

```ts
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useApi } from '../api/ApiProvider';
import { qk } from '../api/keys';
import type { Layout, WorkspaceResponse } from '../api/types';
import { useWorkspace } from '../api/workspace';
import { DEFAULT_LAYOUT, normalize, validateLayout } from '../domain/layout';
import { showToast } from '../ui/toastStore';

export const SAVE_DEBOUNCE_MS = 500;

export interface LayoutApi {
  layout: Layout | null;
  isLoading: boolean;
  update: (fn: (l: Layout) => Layout) => void;
}

export const LayoutContext = createContext<LayoutApi | null>(null);

export function useLayout(): LayoutApi {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used inside <LayoutContext.Provider>');
  return ctx;
}

/** Owns the workspace layout: cache-first edits, debounced PUT, flush on unload. Call once (Shell). */
export function useWorkspaceLayout(): LayoutApi {
  const api = useApi();
  const qc = useQueryClient();
  const query = useWorkspace();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Layout | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const layout = pending.current;
    pending.current = null;
    if (layout) {
      api.request('PUT', '/workspace', { layout }, { keepalive: true }).catch(() => showToast("Couldn't save layout"));
    }
  }, [api]);

  const schedule = useCallback((layout: Layout) => {
    pending.current = layout;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [flush]);

  const data = query.data;
  const valid = !!data && validateLayout(data.layout);

  useEffect(() => {
    if (data && !validateLayout(data.layout)) {
      qc.setQueryData<WorkspaceResponse>(qk.workspace, { ...data, layout: DEFAULT_LAYOUT });
      schedule(DEFAULT_LAYOUT);
    }
  }, [data, qc, schedule]);

  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [flush]);

  const update = useCallback((fn: (l: Layout) => Layout) => {
    const cur = qc.getQueryData<WorkspaceResponse>(qk.workspace);
    if (!cur) return;
    const next = normalize(fn(cur.layout));
    qc.setQueryData<WorkspaceResponse>(qk.workspace, { ...cur, layout: next });
    schedule(next);
  }, [qc, schedule]);

  return useMemo(() => ({
    layout: data ? (valid ? data.layout : DEFAULT_LAYOUT) : null,
    isLoading: query.isLoading,
    update,
  }), [data, valid, query.isLoading, update]);
}
```

Run: `npm test -- src/workspace/useWorkspaceLayout.test.tsx` → PASS.

- [ ] **Step 4: Write failing Workspace and AuthGate tests**

`app/src/workspace/Workspace.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Shell } from '../app/Shell';
import { createFakeApi } from '../test/fakeApi';
import { renderWithProviders } from '../test/render';

describe('Workspace', () => {
  it('renders the default layout as three panels', async () => {
    renderWithProviders(<Shell />);
    await waitFor(() => expect(screen.getByTestId('panel-v-dropbox')).toBeInTheDocument());
    expect(screen.getByTestId('panel-v-dropbox')).toHaveAttribute('data-view-type', 'dropbox');
    expect(screen.getByTestId('panel-v-calendar')).toHaveAttribute('data-view-type', 'calendar');
    expect(screen.getByTestId('panel-v-timeline')).toHaveAttribute('data-view-type', 'timeline');
    expect(screen.getByTestId('panel-v-dropbox')).toHaveTextContent('Dropbox · All');
  });

  it('shows an empty state when no views are open', async () => {
    renderWithProviders(<Shell />, { api: createFakeApi({ layout: { version: 1, root: null } }) });
    await waitFor(() => expect(screen.getByText('No views open')).toBeInTheDocument());
  });
});
```

`app/src/auth/AuthGate.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  useSupabaseSession: () => ({ session: null, loading: false }),
  getSupabase: () => ({ auth: { signInWithOAuth: vi.fn() } }),
}));

import { AuthGate } from './AuthGate';

describe('AuthGate', () => {
  it('dev mode renders the app without login', () => {
    render(<AuthGate mode="dev"><div>app</div></AuthGate>);
    expect(screen.getByText('app')).toBeInTheDocument();
  });

  it('supabase mode without a session shows Google and Apple login', () => {
    render(<AuthGate mode="supabase"><div>app</div></AuthGate>);
    expect(screen.queryByText('app')).not.toBeInTheDocument();
    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
    expect(screen.getByText('Continue with Apple')).toBeInTheDocument();
  });
});
```

Run: `npm test -- src/workspace src/auth`
Expected: FAIL (missing `Shell`, `AuthGate`).

- [ ] **Step 5: Implement UI primitives (`Menu.tsx`, `Toast.tsx`)**

`app/src/ui/Menu.tsx`:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { tokens } from './tokens';

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  testID?: string;
  danger?: boolean;
  checked?: boolean;
}

export function Menu({ trigger, items, align = 'left' }: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', [align]: 0, zIndex: 50, minWidth: 160, padding: 4,
            background: tokens.color.panel, borderRadius: tokens.radius.md, boxShadow: tokens.shadow.popover,
          }}
        >
          {items.map((it) => (
            <button
              key={it.key}
              role="menuitem"
              data-testid={it.testID}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              style={{
                display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '6px 8px', border: 'none', borderRadius: tokens.radius.sm, background: 'transparent',
                textAlign: 'left', fontSize: tokens.font.size.sm,
                color: it.danger ? tokens.color.danger : tokens.color.text,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = tokens.color.hover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span>{it.label}</span>
              {it.checked && <span style={{ color: tokens.color.accent }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

`app/src/ui/Toast.tsx`:

```tsx
import { tokens } from './tokens';
import { useToastStore } from './toastStore';

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          data-testid="toast"
          role="status"
          style={{
            padding: '8px 12px', borderRadius: tokens.radius.md, background: tokens.color.text, color: '#fff',
            fontSize: tokens.font.size.sm, boxShadow: tokens.shadow.popover,
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Implement the workspace host**

`app/src/workspace/panelTitle.ts`:

```ts
import type { ViewInstance } from '../api/types';
import { DROPBOX_FILTER_LABELS } from '../domain/scheduling';

export function panelTitle(view: ViewInstance): string {
  switch (view.type) {
    case 'dropbox':
      return `Dropbox · ${DROPBOX_FILTER_LABELS[view.config.filter]}`;
    case 'calendar':
      return 'Calendar';
    case 'timeline':
      return 'Timeline';
  }
}
```

`app/src/workspace/ViewHost.tsx`:

```tsx
import type { ViewNode } from '../api/types';
import { setViewConfig } from '../domain/layout';
import { CalendarView } from '../views/calendar/CalendarView';
import { DropboxView } from '../views/dropbox/DropboxView';
import { TimelineView } from '../views/timeline/TimelineView';
import { useLayout } from './useWorkspaceLayout';

export function ViewHost({ node }: { node: ViewNode }) {
  const { update } = useLayout();
  const v = node.view;
  switch (v.type) {
    case 'dropbox':
      return <DropboxView viewId={node.id} config={v.config} setConfig={(c) => update((l) => setViewConfig(l, node.id, c))} />;
    case 'timeline':
      return <TimelineView viewId={node.id} config={v.config} setConfig={(c) => update((l) => setViewConfig(l, node.id, c))} />;
    case 'calendar':
      return <CalendarView viewId={node.id} config={v.config} setConfig={(c) => update((l) => setViewConfig(l, node.id, c))} />;
  }
}
```

`app/src/workspace/Panel.tsx` (Task 18 adds the menu and header drag; Task 19 adds dock zones):

```tsx
import type { ViewNode } from '../api/types';
import { tokens } from '../ui/tokens';
import { panelTitle } from './panelTitle';
import { ViewHost } from './ViewHost';

export function Panel({ node }: { node: ViewNode }) {
  return (
    <div
      data-testid={`panel-${node.id}`}
      data-view-type={node.view.type}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minWidth: 0, minHeight: 0,
        background: tokens.color.panel, border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.lg, overflow: 'hidden',
      }}
    >
      <div
        data-testid={`panel-header-${node.id}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 8px 0 12px', flexShrink: 0,
          borderBottom: `1px solid ${tokens.color.border}`, fontSize: tokens.font.size.sm, fontWeight: 600,
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{panelTitle(node.view)}</span>
      </div>
      <div data-drop-clip style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ViewHost node={node} />
      </div>
    </div>
  );
}
```

`app/src/workspace/LayoutNodeView.tsx` (Task 18 replaces the gap with draggable dividers):

```tsx
import { Fragment } from 'react';
import type { LayoutNode } from '../api/types';
import { Panel } from './Panel';

export const GUTTER_PX = 8;

export function LayoutNodeView({ node }: { node: LayoutNode }) {
  if (node.kind === 'view') return <Panel node={node} />;
  return (
    <div style={{ display: 'flex', flexDirection: node.direction, width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && <div style={{ flex: `0 0 ${GUTTER_PX}px` }} />}
          <div style={{ flex: `${node.sizes[i]} 1 0px`, display: 'flex', minWidth: 0, minHeight: 0 }}>
            <LayoutNodeView node={child} />
          </div>
        </Fragment>
      ))}
    </div>
  );
}
```

`app/src/workspace/Workspace.web.tsx`:

```tsx
import { addView } from '../domain/layout';
import { tokens } from '../ui/tokens';
import { LayoutNodeView } from './LayoutNodeView';
import { useLayout } from './useWorkspaceLayout';

export function Workspace() {
  const { layout, update } = useLayout();
  if (!layout) return null;
  if (!layout.root) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: tokens.color.muted }}>
        <div>No views open</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => update((l) => addView(l, { type: 'dropbox', config: { filter: 'all' } }))}>Dropbox</button>
          <button onClick={() => update((l) => addView(l, { type: 'calendar', config: { mode: 'week' } }))}>Calendar</button>
          <button onClick={() => update((l) => addView(l, { type: 'timeline', config: {} }))}>Timeline</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: 8 }}>
      <LayoutNodeView node={layout.root} />
    </div>
  );
}
```

`app/src/workspace/Workspace.tsx` (native fallback; web resolves `.web.tsx` first):

```tsx
import { Text, View } from 'react-native';

export function Workspace() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Open Personal Sprint in a desktop browser.</Text>
    </View>
  );
}
```

- [ ] **Step 7: Implement auth**

`app/src/auth/supabase.ts`:

```ts
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

let client: SupabaseClient | null = null;

/** Auth only. The app never reads Supabase tables (spec §6.7). */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required when EXPO_PUBLIC_AUTH_MODE=supabase');
    }
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  return client;
}

export function useSupabaseSession(): { session: Session | null; loading: boolean } {
  const [state, setState] = useState<{ session: Session | null; loading: boolean }>({ session: null, loading: true });
  useEffect(() => {
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = sb.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);
  return state;
}
```

`app/src/auth/LoginScreen.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import { tokens } from '../ui/tokens';
import { getSupabase } from './supabase';

const signIn = (provider: 'google' | 'apple') =>
  getSupabase().auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });

export function LoginScreen() {
  const button = { paddingVertical: 10, paddingHorizontal: 16, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.panel, minWidth: 240, alignItems: 'center' as const };
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: tokens.color.bg }}>
      <Text style={{ fontSize: tokens.font.size.lg, fontWeight: '600', marginBottom: 8 }}>Personal Sprint</Text>
      <Pressable style={button} onPress={() => signIn('google')}><Text>Continue with Google</Text></Pressable>
      <Pressable style={button} onPress={() => signIn('apple')}><Text>Continue with Apple</Text></Pressable>
    </View>
  );
}
```

`app/src/auth/AuthGate.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react';
import { AUTH_MODE, setAccessTokenGetter } from '../api/config';
import { LoginScreen } from './LoginScreen';
import { useSupabaseSession } from './supabase';

export function AuthGate({ children, mode = AUTH_MODE }: { children: ReactNode; mode?: 'dev' | 'supabase' }) {
  if (mode === 'dev') return <>{children}</>;
  return <SupabaseGate>{children}</SupabaseGate>;
}

function SupabaseGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSupabaseSession();
  useEffect(() => {
    setAccessTokenGetter(() => session?.access_token ?? null);
  }, [session]);
  if (loading) return null;
  if (!session) return <LoginScreen />;
  return <>{children}</>;
}
```

- [ ] **Step 8: Implement the shell and app entry**

`app/src/app/TopBar.tsx` (Task 18 adds the `+ View` menu where marked):

```tsx
import { Pressable, Text, View } from 'react-native';
import { AUTH_MODE } from '../api/config';
import { getSupabase } from '../auth/supabase';
import { focusCapture } from '../ui/captureBus';
import { tokens } from '../ui/tokens';

export function TopBar({ right }: { right?: React.ReactNode }) {
  return (
    <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8, borderBottomWidth: 1, borderBottomColor: tokens.color.border, backgroundColor: tokens.color.bg }}>
      <Text style={{ flex: 1, fontWeight: '600', fontSize: tokens.font.size.md }}>◫ Personal Sprint</Text>
      <Pressable testID="add-item" onPress={focusCapture} style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: tokens.radius.sm }}>
        <Text style={{ color: tokens.color.muted }}>+ Item</Text>
      </Pressable>
      {right}
      {AUTH_MODE === 'supabase' && (
        <Pressable onPress={() => getSupabase().auth.signOut()} style={{ paddingVertical: 4, paddingHorizontal: 8 }}>
          <Text style={{ color: tokens.color.muted }}>Sign out</Text>
        </Pressable>
      )}
    </View>
  );
}
```

`app/src/app/Shell.tsx`:

```tsx
import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { dockView } from '../domain/layout';
import { DndProvider, type DockAction } from '../dnd/DndProvider';
import { focusCapture } from '../ui/captureBus';
import { ToastHost } from '../ui/Toast';
import { ItemDetailHost } from '../views/item/ItemDetailHost';
import { LayoutContext, useWorkspaceLayout } from '../workspace/useWorkspaceLayout';
import { Workspace } from '../workspace/Workspace';
import { TopBar } from './TopBar';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export function Shell() {
  const layoutApi = useWorkspaceLayout();
  const { update } = layoutApi;
  const onDock = useCallback((a: DockAction) => update((l) => dockView(l, a.viewId, a.targetViewId, a.edge)), [update]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        focusCapture();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <LayoutContext.Provider value={layoutApi}>
      <DndProvider onDock={onDock}>
        <View style={{ flex: 1, height: '100%' }}>
          <TopBar />
          <Workspace />
        </View>
        <ItemDetailHost />
        <ToastHost />
      </DndProvider>
    </LayoutContext.Provider>
  );
}
```

Because the test render wrapper (Task 12) already wraps children in a `DndProvider`, `Shell` nests a second one in tests. That is harmless: the inner provider wins for everything under it.

`app/App.tsx`:

```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiProvider, createAppQueryClient } from './src/api/ApiProvider';
import { createApiClient } from './src/api/client';
import { API_URL, authHeaders } from './src/api/config';
import { Shell } from './src/app/Shell';
import { AuthGate } from './src/auth/AuthGate';
import { injectGlobalStyles } from './src/ui/globalStyles';

injectGlobalStyles();

export default function App() {
  const [queryClient] = useState(createAppQueryClient);
  const [api] = useState(() => createApiClient({ baseUrl: API_URL, headers: authHeaders }));
  return (
    <ApiProvider client={api}>
      <QueryClientProvider client={queryClient}>
        <AuthGate>
          <Shell />
        </AuthGate>
      </QueryClientProvider>
    </ApiProvider>
  );
}
```

- [ ] **Step 9: Run tests, typecheck, and look at it**

Run: `npm test && npm run typecheck`
Expected: all PASS.

Run (two terminals from repo root): `make api` and `make app`, then open http://localhost:8081.
Expected: top bar plus three bordered panels titled "Dropbox · All", "Calendar", "Timeline" in the default arrangement, each showing its stub text. No console errors.

- [ ] **Step 10: Commit**

```bash
git add app
git commit -m "feat(app): add shell, auth gate, workspace host, and UI primitives

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Phase 3: Views (Tasks 14–17 run in parallel)

Rules shared by all four view tasks:
- Each task replaces only its own stub(s) from Task 13 and adds files in its own `src/views/<name>/` directory. Do not edit `src/dnd`, `src/api`, `src/domain`, or `src/workspace`. If one of those seems wrong, stop and report it.
- **dnd-kit ids must be unique across the whole workspace.** The same Item can be visible in two Dropbox instances at once, so every draggable/droppable id is prefixed with the view id: `${viewId}:item:${itemId}`, `${viewId}:bar:${itemId}`, `${viewId}:block:${blockId}`, `${viewId}:tday:${dateKey}`, `${viewId}:cday:${dateKey}`. Test ids (`data-testid`) are **not** prefixed; Playwright scopes them by panel.
- Drops are executed by `DndProvider`. Views only declare draggables (`useTypedDraggable`) and drop targets (`useTypedDroppable`) and render previews (`usePreviewAction`). Never call a mutation from a drop target.
- Edge drags (Timeline edges, Calendar resize) do **not** use dnd-kit. They use `onPointerDown` on the handle with `e.stopPropagation()`, then `window` `pointermove`/`pointerup` listeners, and call the mutation once on pointer-up.
- Cross-view drag-and-drop is not unit-testable in jsdom. `planDrop` (Task 12) covers its logic and Playwright (Tasks 20–21) covers it end to end. Component tests here cover rendering, editing, and edge drags.
- Pin "now" in component tests with `vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(new Date(2026, 9, 7, 12, 0));` (Wednesday, Oct 7 2026; week Mon Oct 5 – Sun Oct 11) and restore with `vi.useRealTimers()` in `afterEach`.

### Task 14: Dropbox view

**Files:**
- Replace: `app/src/views/dropbox/DropboxView.tsx`
- Create: `app/src/views/dropbox/CaptureInput.tsx`, `ItemRow.tsx`, `FilterMenu.tsx`, `itemMeta.ts`
- Test: `app/src/views/dropbox/itemMeta.test.ts`, `app/src/views/dropbox/DropboxView.test.tsx`

**Interfaces:**
- Consumes: `useItems`, `useCreateItem`, `useUpdateItem`, `tempId`, `isTempId` (Task 11); `filterItems`, `DROPBOX_FILTER_LABELS` (Task 9); `useTypedDraggable`, `toRect` (Task 12); `Menu`, `registerCapture`, `useItemDetailStore`, `tokens` (Task 13); `ViewProps` (Task 13).
- Produces: `DropboxView(props: ViewProps<{ filter: DropboxFilter }>)`; `itemMeta(item: Item, now: Date): string`.

- [ ] **Step 1: Write failing `itemMeta` tests**

`app/src/views/dropbox/itemMeta.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Item } from '../../api/types';
import { itemMeta } from './itemMeta';

const now = new Date(2026, 9, 5, 9, 0); // Mon Oct 5
const local = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const item = (over: Partial<Item> = {}): Item => ({
  id: 'i', title: 't', description: null, open_at: null, deadline_at: null, status: 'active',
  work_block_count: 0, created_at: '', updated_at: '', completed_at: null, ...over,
});

describe('itemMeta', () => {
  it('is empty with nothing planned', () => expect(itemMeta(item(), now)).toBe(''));
  it('shows weekday for deadlines within the next 6 days', () => expect(itemMeta(item({ deadline_at: local(9, 23, 59) }), now)).toBe('Due Fri'));
  it('shows month and day for later deadlines', () => expect(itemMeta(item({ deadline_at: local(20, 23, 59) }), now)).toBe('Due Oct 20'));
  it('shows the planning range', () => expect(itemMeta(item({ open_at: local(6), deadline_at: local(9, 23, 59) }), now)).toBe('Tue → Fri'));
  it('appends block count', () => {
    expect(itemMeta(item({ open_at: local(6), deadline_at: local(9, 23, 59), work_block_count: 2 }), now)).toBe('Tue → Fri · 2 blocks');
    expect(itemMeta(item({ work_block_count: 1 }), now)).toBe('1 block');
  });
});
```

- [ ] **Step 2: Implement `itemMeta.ts`**

```ts
import { format } from 'date-fns';
import type { Item } from '../../api/types';
import { daysBetween } from '../../domain/time';

function day(iso: string, now: Date): string {
  const d = new Date(iso);
  const ahead = daysBetween(now, d);
  return ahead >= 0 && ahead <= 6 ? format(d, 'EEE') : format(d, 'MMM d');
}

/** Secondary line for a Dropbox row (FEATURE_DESIGN §7). */
export function itemMeta(item: Item, now: Date): string {
  const parts: string[] = [];
  if (item.open_at && item.deadline_at) parts.push(`${day(item.open_at, now)} → ${day(item.deadline_at, now)}`);
  else if (item.deadline_at) parts.push(`Due ${day(item.deadline_at, now)}`);
  const n = item.work_block_count;
  if (n > 0) parts.push(`${n} block${n === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
```

Run: `npm test -- src/views/dropbox/itemMeta.test.ts` → PASS.

- [ ] **Step 3: Write failing component tests**

`app/src/views/dropbox/DropboxView.test.tsx`:

```tsx
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DropboxFilter } from '../../api/types';
import { createFakeApi, makeItem } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { DropboxView } from './DropboxView';

const view = (filter: DropboxFilter = 'all', setConfig = vi.fn()) => (
  <DropboxView viewId="v1" config={{ filter }} setConfig={setConfig} />
);
const titles = () => screen.queryAllByTestId(/^item-row-/).map((r) => r.querySelector('[data-role="title"]')?.textContent);

beforeEach(() => useItemDetailStore.setState({ itemId: null, anchor: null }));
afterEach(() => vi.restoreAllMocks());

describe('DropboxView', () => {
  it('shows the empty state', async () => {
    renderWithProviders(view());
    expect(await screen.findByText('Nothing here yet.')).toBeInTheDocument();
    expect(screen.getByText('Add something whenever it comes up.')).toBeInTheDocument();
  });

  it('Enter creates an item, clears the input, and keeps focus', async () => {
    const user = userEvent.setup();
    const { api } = renderWithProviders(view());
    const input = await screen.findByTestId('dropbox-input');
    await user.click(input);
    await user.type(input, 'Physics homework{Enter}');
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    await waitFor(() => expect(titles()).toEqual(['Physics homework']));
    expect(api.items).toHaveLength(1);
  });

  it('ignores whitespace-only input', async () => {
    const user = userEvent.setup();
    const { api } = renderWithProviders(view());
    const input = await screen.findByTestId('dropbox-input');
    await user.type(input, '   {Enter}');
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('rapid brain-dump: every Enter lands, newest first, even before the server answers', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    renderWithProviders(view(), { api });
    const input = await screen.findByTestId('dropbox-input');
    await screen.findByText('Nothing here yet.'); // items query settled before holding responses
    const release = api.hold();
    await user.type(input, 'A{Enter}B{Enter}C{Enter}');
    expect(titles()).toEqual(['C', 'B', 'A']);
    await act(async () => release());
    await waitFor(() => expect(api.items).toHaveLength(3));
    expect(titles()).toEqual(['C', 'B', 'A']);
  });

  it('applies its own filter', async () => {
    const api = createFakeApi({ items: [makeItem({ title: 'planned', work_block_count: 0 }), makeItem({ title: 'loose' })] });
    api.blocks.push({ id: 'b', item_id: api.items[0].id, start_at: '2026-10-06T16:00:00Z', end_at: '2026-10-06T17:00:00Z', created_at: '', updated_at: '' });
    renderWithProviders(view('unscheduled'), { api });
    await waitFor(() => expect(titles()).toEqual(['loose']));
  });

  it('changing the filter calls setConfig', async () => {
    const user = userEvent.setup();
    const setConfig = vi.fn();
    renderWithProviders(view('all', setConfig));
    await user.click(await screen.findByTestId('dropbox-filter'));
    await user.click(screen.getByTestId('dropbox-filter-option-scheduled'));
    expect(setConfig).toHaveBeenCalledWith({ filter: 'scheduled' });
  });

  it('completing an item removes it from the active list', async () => {
    const user = userEvent.setup();
    const it = makeItem({ title: 'Call dentist' });
    const { api } = renderWithProviders(view(), { api: createFakeApi({ items: [it] }) });
    await user.click(await screen.findByTestId(`item-complete-${it.id}`));
    await waitFor(() => expect(screen.queryByTestId(`item-row-${it.id}`)).not.toBeInTheDocument());
    expect(api.calls.at(-1)).toMatchObject({ method: 'PATCH', body: { status: 'completed' } });
    expect(useItemDetailStore.getState().itemId).toBeNull();
  });

  it('clicking a row opens the item detail', async () => {
    const user = userEvent.setup();
    const it = makeItem({ title: 'Read paper' });
    renderWithProviders(view(), { api: createFakeApi({ items: [it] }) });
    await user.click(within(await screen.findByTestId(`item-row-${it.id}`)).getByText('Read paper'));
    expect(useItemDetailStore.getState().itemId).toBe(it.id);
  });
});
```

Run: `npm test -- src/views/dropbox` → FAIL (stub renders only "Dropbox").

- [ ] **Step 4: Implement the components**

`app/src/views/dropbox/CaptureInput.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { tempId, useCreateItem } from '../../api/items';
import { registerCapture } from '../../ui/captureBus';
import { tokens } from '../../ui/tokens';

export function CaptureInput() {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const create = useCreateItem();

  useEffect(() => registerCapture(() => ref.current?.focus()), []);

  return (
    <input
      ref={ref}
      data-testid="dropbox-input"
      placeholder="Add something..."
      maxLength={500}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') ref.current?.blur();
        if (e.key !== 'Enter') return;
        const title = value.trim();
        if (!title) return;
        create.mutate({ tempId: tempId('i'), input: { title } });
        setValue('');
      }}
      style={{
        width: '100%', padding: '8px 10px', border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.md,
        background: tokens.color.panel, outline: 'none', fontSize: tokens.font.size.md,
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = tokens.color.accent)}
      onBlur={(e) => (e.currentTarget.style.borderColor = tokens.color.border)}
    />
  );
}
```

`app/src/views/dropbox/FilterMenu.tsx`:

```tsx
import type { DropboxFilter } from '../../api/types';
import { DROPBOX_FILTER_LABELS } from '../../domain/scheduling';
import { Menu } from '../../ui/Menu';
import { tokens } from '../../ui/tokens';

const ORDER: DropboxFilter[] = ['all', 'unscheduled', 'scheduled', 'completed'];

export function FilterMenu({ value, onChange }: { value: DropboxFilter; onChange: (f: DropboxFilter) => void }) {
  return (
    <Menu
      trigger={({ toggle }) => (
        <button
          data-testid="dropbox-filter"
          data-filter={value}
          onClick={toggle}
          style={{ border: 'none', background: 'transparent', padding: '2px 6px', borderRadius: tokens.radius.sm, color: tokens.color.muted, fontSize: tokens.font.size.sm }}
        >
          {DROPBOX_FILTER_LABELS[value]} ▾
        </button>
      )}
      items={ORDER.map((f) => ({
        key: f,
        label: DROPBOX_FILTER_LABELS[f],
        checked: f === value,
        testID: `dropbox-filter-option-${f}`,
        onSelect: () => onChange(f),
      }))}
    />
  );
}
```

`app/src/views/dropbox/ItemRow.tsx`:

```tsx
import { useState } from 'react';
import { isTempId, useUpdateItem } from '../../api/items';
import type { Item } from '../../api/types';
import { useTypedDraggable } from '../../dnd/hooks';
import { toRect } from '../../dnd/types';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { tokens } from '../../ui/tokens';
import { itemMeta } from './itemMeta';

export function ItemRow({ item, viewId }: { item: Item; viewId: string }) {
  const temp = isTempId(item.id);
  const drag = useTypedDraggable({ id: `${viewId}:item:${item.id}`, payload: { kind: 'item', itemId: item.id }, disabled: temp });
  const update = useUpdateItem();
  const openDetail = useItemDetailStore((s) => s.open);
  const [hover, setHover] = useState(false);
  const done = item.status === 'completed';
  const meta = itemMeta(item, new Date());

  return (
    <div
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      data-testid={`item-row-${item.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => !temp && openDetail(item.id, toRect(e.currentTarget.getBoundingClientRect()))}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 8px', borderRadius: tokens.radius.md,
        background: hover ? tokens.color.hover : 'transparent', opacity: drag.isDragging ? 0.4 : temp ? 0.7 : 1,
        cursor: temp ? 'default' : 'grab', userSelect: 'none', transition: `background ${tokens.motion.fast}`,
      }}
    >
      <button
        data-testid={`item-complete-${item.id}`}
        aria-label={done ? 'Mark active' : 'Mark complete'}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (!temp) update.mutate({ id: item.id, patch: { status: done ? 'active' : 'completed' } });
        }}
        style={{
          flexShrink: 0, width: 16, height: 16, marginTop: 2, borderRadius: 8, padding: 0,
          border: `1.5px solid ${done ? tokens.color.accent : tokens.color.borderStrong}`,
          background: done ? tokens.color.accent : 'transparent',
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          data-role="title"
          style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: done ? tokens.color.muted : tokens.color.text, textDecoration: done ? 'line-through' : 'none',
          }}
        >
          {item.title}
        </div>
        {meta && <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.muted, marginTop: 1 }}>{meta}</div>}
      </div>
    </div>
  );
}
```

`app/src/views/dropbox/DropboxView.tsx`:

```tsx
import { useMemo } from 'react';
import { useItems } from '../../api/items';
import type { DropboxFilter } from '../../api/types';
import { filterItems } from '../../domain/scheduling';
import { tokens } from '../../ui/tokens';
import type { ViewProps } from '../../workspace/viewTypes';
import { CaptureInput } from './CaptureInput';
import { FilterMenu } from './FilterMenu';
import { ItemRow } from './ItemRow';

export function DropboxView({ viewId, config, setConfig }: ViewProps<{ filter: DropboxFilter }>) {
  const { data: items = [], isLoading } = useItems();
  const visible = useMemo(() => filterItems(items, config.filter), [items, config.filter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 8px 0' }}>
        <FilterMenu value={config.filter} onChange={(filter) => setConfig({ filter })} />
      </div>
      <div style={{ padding: '6px 12px 8px' }}>
        <CaptureInput />
      </div>
      <div data-drop-clip style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 4px 12px' }}>
        {visible.map((item) => <ItemRow key={item.id} item={item} viewId={viewId} />)}
        {!isLoading && visible.length === 0 && (
          <div data-testid="dropbox-empty" style={{ padding: '24px 12px', color: tokens.color.muted, fontSize: tokens.font.size.sm }}>
            <div>Nothing here yet.</div>
            <div style={{ marginTop: 4, color: tokens.color.faint }}>Add something whenever it comes up.</div>
          </div>
        )}
      </div>
    </div>
  );
}
```

Note: the test "completing an item…" asserts the detail did **not** open, which proves the completion click doesn't bubble to the row.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- src/views/dropbox && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/views/dropbox
git commit -m "feat(app): add Dropbox view with rapid capture and filters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Item detail popover

**Files:**
- Replace: `app/src/views/item/ItemDetailHost.tsx`
- Create: `app/src/views/item/ItemDetail.tsx`
- Test: `app/src/views/item/ItemDetail.test.tsx`

**Interfaces:**
- Consumes: `useItemsById`, `useUpdateItem`, `useDeleteItem` (Task 11); `useItemWorkBlocks`, `useDeleteWorkBlock` (Task 11); `useItemDetailStore` (Task 13); time helpers (Task 9).
- Produces: `ItemDetailHost()` (mounted once by `Shell`); `ItemDetail({ item, onClose })`.

- [ ] **Step 1: Write failing tests**

`app/src/views/item/ItemDetail.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeBlock, makeItem } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { ItemDetailHost } from './ItemDetailHost';

const local = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const lastPatch = (api: ReturnType<typeof createFakeApi>) => [...api.calls].reverse().find((c) => c.method === 'PATCH');

function setup(over = {}) {
  const item = makeItem({ id: 'i1', title: 'Physics Assignment', description: 'Problems 1-8', ...over });
  const api = createFakeApi({ items: [item], blocks: [makeBlock({ id: 'b1', item_id: 'i1', start_at: local(6, 19), end_at: local(6, 20) })] });
  useItemDetailStore.getState().open('i1');
  return { ...renderWithProviders(<ItemDetailHost />, { api }), item };
}

beforeEach(() => useItemDetailStore.setState({ itemId: null, anchor: null }));
afterEach(() => vi.restoreAllMocks());

describe('ItemDetail', () => {
  it('renders nothing when closed', () => {
    renderWithProviders(<ItemDetailHost />);
    expect(screen.queryByTestId('item-detail')).not.toBeInTheDocument();
  });

  it('commits a title edit on Enter and trims it', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    const title = await screen.findByTestId('item-title');
    await user.clear(title);
    await user.type(title, '  Physics HW  {Enter}');
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ title: 'Physics HW' }));
  });

  it('reverts a blank title without saving', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    const title = await screen.findByTestId('item-title');
    await user.clear(title);
    await user.tab();
    expect(title).toHaveValue('Physics Assignment');
    expect(lastPatch(api)).toBeUndefined();
  });

  it('saves open date at local midnight and deadline at 23:59 by default', async () => {
    const { api } = setup();
    fireEvent.change(await screen.findByTestId('item-open-date'), { target: { value: '2026-10-05' } });
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ open_at: local(5) }));
    fireEvent.change(screen.getByTestId('item-deadline-date'), { target: { value: '2026-10-09' } });
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ deadline_at: local(9, 23, 59) }));
  });

  it('refuses an open date after the deadline and explains why', async () => {
    const { api } = setup({ deadline_at: local(9, 23, 59) });
    fireEvent.change(await screen.findByTestId('item-open-date'), { target: { value: '2026-10-12' } });
    expect(await screen.findByTestId('item-date-error')).toHaveTextContent('Open date must be on or before the deadline');
    expect(lastPatch(api)).toBeUndefined();
  });

  it('clearing the deadline sends null', async () => {
    const { api } = setup({ deadline_at: local(9, 23, 59) });
    fireEvent.change(await screen.findByTestId('item-deadline-date'), { target: { value: '' } });
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ deadline_at: null }));
  });

  it('lists scheduled blocks and can remove one', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    expect(await screen.findByTestId('item-block-b1')).toHaveTextContent('7:00 – 8:00 PM');
    await user.click(screen.getByTestId('item-block-delete-b1'));
    await waitFor(() => expect(api.blocks).toHaveLength(0));
  });

  it('Done completes the item and closes', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await user.click(await screen.findByTestId('item-done'));
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ status: 'completed' }));
    expect(useItemDetailStore.getState().itemId).toBeNull();
  });

  it('Delete asks for confirmation first', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { api } = setup();
    await user.click(await screen.findByTestId('item-delete'));
    expect(api.items).toHaveLength(1);
    await user.click(screen.getByTestId('item-delete'));
    await waitFor(() => expect(api.items).toHaveLength(0));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(useItemDetailStore.getState().itemId).toBeNull();
  });

  it('Escape closes', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByTestId('item-detail');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('item-detail')).not.toBeInTheDocument();
  });
});
```

Run: `npm test -- src/views/item` → FAIL.

- [ ] **Step 2: Implement `ItemDetailHost.tsx`**

```tsx
import { useEffect } from 'react';
import { useItemsById } from '../../api/items';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { ItemDetail } from './ItemDetail';

export function ItemDetailHost() {
  const { itemId, anchor, close } = useItemDetailStore();
  const item = useItemsById().get(itemId ?? '');

  useEffect(() => {
    if (!itemId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [itemId, close]);

  if (!itemId || !item) return null;

  const width = 320;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  let left = (vw - width) / 2;
  let top = 80;
  if (anchor) {
    left = anchor.left + anchor.width + 8 + width <= vw ? anchor.left + anchor.width + 8 : Math.max(8, anchor.left - width - 8);
    top = Math.min(Math.max(8, anchor.top), vh - 420);
  }

  return (
    <>
      <div onMouseDown={close} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div style={{ position: 'fixed', left, top, width, zIndex: 41 }}>
        <ItemDetail key={item.id} item={item} onClose={close} />
      </div>
    </>
  );
}
```

- [ ] **Step 3: Implement `ItemDetail.tsx`**

```tsx
import { format } from 'date-fns';
import { useState } from 'react';
import { useDeleteItem, useUpdateItem } from '../../api/items';
import type { Item, UpdateItemInput } from '../../api/types';
import { useDeleteWorkBlock, useItemWorkBlocks } from '../../api/workBlocks';
import { atMinutes, fromDateKey, startOfDayLocal, toDateKey } from '../../domain/time';
import { tokens } from '../../ui/tokens';

const label = { fontSize: tokens.font.size.xs, color: tokens.color.muted, textTransform: 'uppercase' as const, letterSpacing: 0.4, marginTop: 14, marginBottom: 4 };
const field = { width: '100%', padding: '6px 8px', border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.sm, background: tokens.color.panel, outline: 'none' };
const toTimeValue = (iso: string) => format(new Date(iso), 'HH:mm');
const parseTime = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
};

export function ItemDetail({ item, onClose }: { item: Item; onClose: () => void }) {
  const update = useUpdateItem();
  const del = useDeleteItem();
  const blocks = useItemWorkBlocks(item.id);
  const deleteBlock = useDeleteWorkBlock();
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const [dateError, setDateError] = useState<string | null>(null);
  const [deadlineTime, setDeadlineTime] = useState(item.deadline_at ? toTimeValue(item.deadline_at) : '23:59');

  const save = (patch: UpdateItemInput) => update.mutate({ id: item.id, patch });

  const commitTitle = () => {
    const t = title.trim();
    if (!t) return setTitle(item.title);
    if (t !== item.title) save({ title: t });
    setTitle(t);
  };

  const commitDescription = () => {
    const d = description.trim() ? description : null;
    if (d !== item.description) save({ description: d });
  };

  const checkOrder = (open: string | null, deadline: string | null) => {
    if (open && deadline && Date.parse(open) > Date.parse(deadline)) {
      setDateError('Open date must be on or before the deadline');
      return false;
    }
    setDateError(null);
    return true;
  };

  const onOpenDate = (v: string) => {
    const open = v ? startOfDayLocal(fromDateKey(v)).toISOString() : null;
    if (checkOrder(open, item.deadline_at)) save({ open_at: open });
  };

  const onDeadline = (dateKey: string, time: string) => {
    const deadline = dateKey ? atMinutes(fromDateKey(dateKey), parseTime(time || '23:59')).toISOString() : null;
    if (checkOrder(item.open_at, deadline)) save({ deadline_at: deadline });
  };

  return (
    <div
      data-testid="item-detail"
      onMouseDown={(e) => e.stopPropagation()}
      style={{ background: tokens.color.panel, borderRadius: tokens.radius.lg, boxShadow: tokens.shadow.popover, padding: 16 }}
    >
      <input
        data-testid="item-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        maxLength={500}
        style={{ ...field, border: 'none', padding: 0, fontSize: tokens.font.size.lg, fontWeight: 600 }}
      />
      <textarea
        data-testid="item-description"
        value={description}
        placeholder="Add a description"
        onChange={(e) => setDescription(e.target.value)}
        onBlur={commitDescription}
        rows={2}
        style={{ ...field, border: 'none', padding: 0, marginTop: 6, resize: 'vertical', color: tokens.color.muted }}
      />

      <div style={label}>Open</div>
      <input data-testid="item-open-date" type="date" value={item.open_at ? toDateKey(new Date(item.open_at)) : ''} onChange={(e) => onOpenDate(e.target.value)} style={field} />

      <div style={label}>Deadline</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          data-testid="item-deadline-date"
          type="date"
          value={item.deadline_at ? toDateKey(new Date(item.deadline_at)) : ''}
          onChange={(e) => onDeadline(e.target.value, deadlineTime)}
          style={{ ...field, flex: 1 }}
        />
        <input
          data-testid="item-deadline-time"
          type="time"
          step={900}
          value={deadlineTime}
          onChange={(e) => {
            setDeadlineTime(e.target.value);
            if (item.deadline_at) onDeadline(toDateKey(new Date(item.deadline_at)), e.target.value);
          }}
          style={{ ...field, width: 110 }}
        />
      </div>
      {dateError && <div data-testid="item-date-error" style={{ color: tokens.color.danger, fontSize: tokens.font.size.sm, marginTop: 6 }}>{dateError}</div>}

      <div style={label}>Scheduled</div>
      {(blocks.data ?? []).length === 0 && <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.faint }}>Not scheduled</div>}
      {(blocks.data ?? []).map((b) => (
        <div key={b.id} data-testid={`item-block-${b.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: tokens.font.size.sm, padding: '2px 0' }}>
          <span>{format(new Date(b.start_at), 'EEE')} · {format(new Date(b.start_at), 'h:mm')} – {format(new Date(b.end_at), 'h:mm a')}</span>
          <button data-testid={`item-block-delete-${b.id}`} aria-label="Remove block" onClick={() => deleteBlock.mutate({ id: b.id })} style={{ border: 'none', background: 'transparent', color: tokens.color.muted }}>×</button>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
        <button
          data-testid="item-delete"
          onClick={() => {
            if (!window.confirm(`Delete "${item.title}"? Its scheduled blocks will be removed too.`)) return;
            del.mutate({ id: item.id });
            onClose();
          }}
          style={{ border: 'none', background: 'transparent', color: tokens.color.danger, padding: '6px 10px' }}
        >
          Delete
        </button>
        <button
          data-testid="item-done"
          onClick={() => {
            save({ status: item.status === 'completed' ? 'active' : 'completed' });
            onClose();
          }}
          style={{ border: 'none', borderRadius: tokens.radius.md, background: tokens.color.accent, color: '#fff', padding: '6px 14px', fontWeight: 500 }}
        >
          {item.status === 'completed' ? 'Reopen' : 'Done'}
        </button>
      </div>
    </div>
  );
}
```

The block time text renders as `Tue · 7:00 – 8:00 PM`, which the test matches with `toHaveTextContent('7:00 – 8:00 PM')`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- src/views/item && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/views/item
git commit -m "feat(app): add item detail popover

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Timeline view

**Files:**
- Replace: `app/src/views/timeline/TimelineView.tsx`
- Create: `app/src/views/timeline/TimelineBar.tsx`, `app/src/views/timeline/geometry.ts`
- Test: `app/src/views/timeline/geometry.test.ts`, `app/src/views/timeline/TimelineView.test.tsx`

**Interfaces:**
- Consumes: `useItems`, `useUpdateItem` (Task 11); `timelineShape`, `setOpenDay`, `setDeadlineDay` (Task 9); time helpers; `useTypedDraggable`, `useTypedDroppable` (Task 12); `useItemDetailStore`.
- Produces: `TimelineView(props: ViewProps<Record<string, never>>)`; `barGeometry(item, weekStart): BarGeometry | null`; `timelineRows(items, weekStart)`.

- [ ] **Step 1: Write failing geometry tests**

`app/src/views/timeline/geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Item } from '../../api/types';
import { fromDateKey } from '../../domain/time';
import { barGeometry, timelineRows } from './geometry';

const local = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const item = (id: string, over: Partial<Item> = {}): Item => ({
  id, title: id, description: null, open_at: null, deadline_at: null, status: 'active',
  work_block_count: 0, created_at: '', updated_at: '', completed_at: null, ...over,
});
const week = fromDateKey('2026-10-05');

describe('barGeometry', () => {
  it('maps a Mon→Fri range to columns 0..4', () => {
    expect(barGeometry(item('a', { open_at: local(5), deadline_at: local(9, 23, 59) }), week))
      .toEqual({ kind: 'range', startCol: 0, endCol: 4, clippedLeft: false, clippedRight: false });
  });
  it('clips ranges that extend beyond the week', () => {
    expect(barGeometry(item('a', { open_at: local(1), deadline_at: local(14, 23, 59) }), week))
      .toEqual({ kind: 'range', startCol: 0, endCol: 6, clippedLeft: true, clippedRight: true });
  });
  it('returns null for ranges outside the week', () => {
    expect(barGeometry(item('a', { open_at: local(12), deadline_at: local(13) }), week)).toBeNull();
  });
  it('places deadline markers', () => {
    expect(barGeometry(item('a', { deadline_at: local(7, 23, 59) }), week)).toEqual({ kind: 'marker', col: 2 });
  });
  it('hides open-only and undated items', () => {
    expect(barGeometry(item('a', { open_at: local(6) }), week)).toBeNull();
    expect(barGeometry(item('a'), week)).toBeNull();
  });
});

describe('timelineRows', () => {
  it('lists active dated items in this week, earliest first', () => {
    const rows = timelineRows([
      item('later', { open_at: local(8), deadline_at: local(9) }),
      item('done', { open_at: local(5), deadline_at: local(6), status: 'completed' }),
      item('first', { deadline_at: local(6) }),
      item('undated'),
    ], week);
    expect(rows.map((r) => r.item.id)).toEqual(['first', 'later']);
  });
});
```

- [ ] **Step 2: Implement `geometry.ts`**

```ts
import type { Item } from '../../api/types';
import { daysBetween, startOfDayLocal } from '../../domain/time';
import { timelineShape } from '../../domain/timeline';

export type BarGeometry =
  | { kind: 'range'; startCol: number; endCol: number; clippedLeft: boolean; clippedRight: boolean }
  | { kind: 'marker'; col: number };

const col = (iso: string, weekStart: Date) => daysBetween(weekStart, startOfDayLocal(new Date(iso)));

export function barGeometry(item: Item, weekStart: Date): BarGeometry | null {
  const shape = timelineShape(item);
  if (shape === 'range') {
    const open = col(item.open_at!, weekStart);
    const due = col(item.deadline_at!, weekStart);
    if (due < 0 || open > 6) return null;
    return { kind: 'range', startCol: Math.max(0, open), endCol: Math.min(6, due), clippedLeft: open < 0, clippedRight: due > 6 };
  }
  if (shape === 'deadline-marker') {
    const c = col(item.deadline_at!, weekStart);
    return c >= 0 && c <= 6 ? { kind: 'marker', col: c } : null;
  }
  return null;
}

export function timelineRows(items: Item[], weekStart: Date): { item: Item; geo: BarGeometry }[] {
  const sortKey = (i: Item) => Date.parse(i.open_at ?? i.deadline_at ?? '');
  return items
    .filter((i) => i.status === 'active')
    .map((item) => ({ item, geo: barGeometry(item, weekStart) }))
    .filter((r): r is { item: Item; geo: BarGeometry } => r.geo !== null)
    .sort((a, b) => sortKey(a.item) - sortKey(b.item) || a.item.title.localeCompare(b.item.title));
}
```

Run: `npm test -- src/views/timeline/geometry.test.ts` → PASS.

- [ ] **Step 3: Write failing component tests**

`app/src/views/timeline/TimelineView.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeItem } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { TimelineView } from './TimelineView';

const local = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const view = <TimelineView viewId="t1" config={{}} setConfig={vi.fn()} />;
const DAYS_WIDTH = 700; // 100px per day

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 9, 7, 12, 0));
  const real = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.role === 'timeline-days') return { left: 0, top: 0, width: DAYS_WIDTH, height: 300, right: DAYS_WIDTH, bottom: 300, x: 0, y: 0, toJSON() {} } as DOMRect;
    return real.call(this);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const ranged = () => makeItem({ id: 'i1', title: 'Physics', open_at: local(5), deadline_at: local(9, 23, 59) });
const lastPatch = (api: ReturnType<typeof createFakeApi>) => [...api.calls].reverse().find((c) => c.method === 'PATCH');

describe('TimelineView', () => {
  it('renders a bar for Mon → Fri and day columns as drop targets', async () => {
    renderWithProviders(view, { api: createFakeApi({ items: [ranged()] }) });
    const bar = await screen.findByTestId('timeline-bar-i1');
    expect(bar).toHaveAttribute('data-open-date', '2026-10-05');
    expect(bar).toHaveAttribute('data-deadline-date', '2026-10-09');
    expect(screen.getByTestId('timeline-day-2026-10-05')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-day-2026-10-11')).toBeInTheDocument();
  });

  it('renders a deadline-only item as a marker', async () => {
    renderWithProviders(view, { api: createFakeApi({ items: [makeItem({ id: 'm', deadline_at: local(8, 23, 59) })] }) });
    expect(await screen.findByTestId('timeline-marker-m')).toHaveAttribute('data-deadline-date', '2026-10-08');
  });

  it('shows the empty state and navigates weeks', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(view, { api: createFakeApi({ items: [ranged()] }) });
    await screen.findByTestId('timeline-bar-i1');
    await user.click(screen.getByTestId('timeline-next'));
    expect(screen.queryByTestId('timeline-bar-i1')).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-empty')).toHaveTextContent('No dated Items in this period.');
    await user.click(screen.getByTestId('timeline-today'));
    expect(screen.getByTestId('timeline-bar-i1')).toBeInTheDocument();
  });

  it('dragging the right edge to Sunday moves only the deadline', async () => {
    const { api } = renderWithProviders(view, { api: createFakeApi({ items: [ranged()] }) });
    const handle = await screen.findByTestId('timeline-bar-right-i1');
    fireEvent.pointerDown(handle, { clientX: 450, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 650, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 650, pointerId: 1 });
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ deadline_at: local(11, 23, 59) }));
  });

  it('dragging the left edge past the deadline clamps to a one-day range', async () => {
    const { api } = renderWithProviders(view, { api: createFakeApi({ items: [ranged()] }) });
    const handle = await screen.findByTestId('timeline-bar-left-i1');
    fireEvent.pointerDown(handle, { clientX: 50, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 690, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 690, pointerId: 1 });
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ open_at: local(9) }));
  });

  it('an edge released on its own day sends nothing', async () => {
    const { api } = renderWithProviders(view, { api: createFakeApi({ items: [ranged()] }) });
    const handle = await screen.findByTestId('timeline-bar-right-i1');
    fireEvent.pointerDown(handle, { clientX: 450, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 460, pointerId: 1 });
    await new Promise((r) => setTimeout(r, 20));
    expect(lastPatch(api)).toBeUndefined();
  });
});
```

Run: `npm test -- src/views/timeline` → FAIL.

- [ ] **Step 4: Implement `TimelineBar.tsx`**

```tsx
import { useState, type RefObject } from 'react';
import { useUpdateItem } from '../../api/items';
import type { Item, UpdateItemInput } from '../../api/types';
import { useTypedDraggable } from '../../dnd/hooks';
import { toRect } from '../../dnd/types';
import { clamp, fromDateKey, toDateKey } from '../../domain/time';
import { setDeadlineDay, setOpenDay } from '../../domain/timeline';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { tokens } from '../../ui/tokens';
import type { BarGeometry } from './geometry';

type Edge = 'left' | 'right';

export function TimelineBar({ item, geo, days, viewId, daysRef }: {
  item: Item;
  geo: BarGeometry;
  days: Date[];
  viewId: string;
  daysRef: RefObject<HTMLDivElement | null>;
}) {
  const drag = useTypedDraggable({ id: `${viewId}:bar:${item.id}`, payload: { kind: 'timelineBar', itemId: item.id } });
  const update = useUpdateItem();
  const openDetail = useItemDetailStore((s) => s.open);
  const [preview, setPreview] = useState<{ edge: Edge; col: number } | null>(null);

  const colAt = (clientX: number) => {
    const r = daysRef.current!.getBoundingClientRect();
    return clamp(Math.floor(((clientX - r.left) / r.width) * 7), 0, 6);
  };

  const startEdgeDrag = (edge: Edge) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const onMove = (ev: PointerEvent) => setPreview({ edge, col: colAt(ev.clientX) });
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setPreview(null);
      const day = days[colAt(ev.clientX)];
      const patch: UpdateItemInput = edge === 'left' ? setOpenDay(item, day) : setDeadlineDay(item, day);
      const field = edge === 'left' ? 'open_at' : 'deadline_at';
      if (patch[field] !== item[field]) update.mutate({ id: item.id, patch });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const pct = (c: number) => `${(c / 7) * 100}%`;
  const deadlineKey = item.deadline_at ? toDateKey(new Date(item.deadline_at)) : '';

  if (geo.kind === 'marker') {
    return (
      <div
        ref={drag.setNodeRef}
        {...drag.listeners}
        {...drag.attributes}
        data-testid={`timeline-marker-${item.id}`}
        data-deadline-date={deadlineKey}
        title={`${item.title} · due ${deadlineKey}`}
        onClick={(e) => openDetail(item.id, toRect(e.currentTarget.getBoundingClientRect()))}
        style={{
          position: 'absolute', top: 8, left: `calc(${pct(geo.col)} + ${100 / 14}% - 6px)`, width: 12, height: 12,
          borderRadius: 6, background: tokens.color.accent, cursor: 'grab', opacity: drag.isDragging ? 0.4 : 1,
        }}
      />
    );
  }

  let { startCol, endCol } = geo;
  if (preview?.edge === 'left') startCol = Math.min(preview.col, endCol);
  if (preview?.edge === 'right') endCol = Math.max(preview.col, startCol);
  const openKey = toDateKey(new Date(item.open_at!));
  const fmt = (k: string) => fromDateKey(k).toLocaleDateString(undefined, { weekday: 'short' });

  return (
    <div
      data-testid={`timeline-bar-${item.id}`}
      data-open-date={openKey}
      data-deadline-date={deadlineKey}
      title={`${item.title} · ${fmt(openKey)} → ${fmt(deadlineKey)}`}
      style={{
        position: 'absolute', top: 5, height: 22, left: `calc(${pct(startCol)} + 2px)`, width: `calc(${pct(endCol - startCol + 1)} - 4px)`,
        display: 'flex', alignItems: 'stretch', background: tokens.color.accentSoft, borderRadius: tokens.radius.sm,
        borderRight: geo.clippedRight ? 'none' : `2px solid ${tokens.color.accent}`, opacity: drag.isDragging ? 0.4 : 1,
        transition: preview ? 'none' : `left ${tokens.motion.base}, width ${tokens.motion.base}`,
      }}
    >
      {!geo.clippedLeft && (
        <div data-testid={`timeline-bar-left-${item.id}`} onPointerDown={startEdgeDrag('left')} style={{ width: 6, cursor: 'ew-resize', flexShrink: 0 }} />
      )}
      <div
        ref={drag.setNodeRef}
        {...drag.listeners}
        {...drag.attributes}
        onClick={(e) => openDetail(item.id, toRect(e.currentTarget.getBoundingClientRect()))}
        style={{
          flex: 1, minWidth: 0, padding: '0 6px', fontSize: tokens.font.size.xs, lineHeight: '22px', cursor: 'grab',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tokens.color.text,
        }}
      >
        {item.title}
      </div>
      {!geo.clippedRight && (
        <div data-testid={`timeline-bar-right-${item.id}`} onPointerDown={startEdgeDrag('right')} style={{ width: 6, cursor: 'ew-resize', flexShrink: 0 }} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implement `TimelineView.tsx`**

```tsx
import { format } from 'date-fns';
import { useMemo, useRef, useState } from 'react';
import { useItems } from '../../api/items';
import { useTypedDroppable } from '../../dnd/hooks';
import { shiftDays, toDateKey, weekDays, weekStart } from '../../domain/time';
import { tokens } from '../../ui/tokens';
import type { ViewProps } from '../../workspace/viewTypes';
import { timelineRows } from './geometry';
import { TimelineBar } from './TimelineBar';

const LABEL_WIDTH = 160;
const ROW_HEIGHT = 32;

function DayColumn({ viewId, date, index }: { viewId: string; date: Date; index: number }) {
  const key = toDateKey(date);
  const { setNodeRef, isOver } = useTypedDroppable({ id: `${viewId}:tday:${key}`, drop: { kind: 'timelineDay', date: key } });
  const isToday = key === toDateKey(new Date());
  return (
    <div
      ref={setNodeRef}
      data-testid={`timeline-day-${key}`}
      style={{
        position: 'absolute', top: 0, bottom: 0, left: `${(index / 7) * 100}%`, width: `${100 / 7}%`,
        borderLeft: index ? `1px solid ${tokens.color.border}` : 'none',
        background: isOver ? tokens.color.accentFaint : isToday ? 'rgba(15,15,15,0.015)' : 'transparent',
        boxShadow: isOver ? `inset 2px 0 0 ${tokens.color.accent}` : 'none',
      }}
    />
  );
}

export function TimelineView({ viewId }: ViewProps<Record<string, never>>) {
  const [start, setStart] = useState(() => weekStart(new Date()));
  const days = useMemo(() => weekDays(start), [start]);
  const { data: items = [] } = useItems();
  const rows = useMemo(() => timelineRows(items, start), [items, start]);
  const daysRef = useRef<HTMLDivElement>(null);

  const navButton = { border: 'none', background: 'transparent', padding: '2px 6px', borderRadius: tokens.radius.sm, color: tokens.color.muted };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: tokens.font.size.sm }}>
        <span style={{ flex: 1, fontWeight: 500 }}>{format(days[0], 'MMM d')} – {format(days[6], 'MMM d, yyyy')}</span>
        <button data-testid="timeline-prev" style={navButton} onClick={() => setStart((s) => shiftDays(s, -7))}>‹</button>
        <button data-testid="timeline-today" style={navButton} onClick={() => setStart(weekStart(new Date()))}>Today</button>
        <button data-testid="timeline-next" style={navButton} onClick={() => setStart((s) => shiftDays(s, 7))}>›</button>
      </div>
      <div style={{ display: 'flex', borderBottom: `1px solid ${tokens.color.border}`, fontSize: tokens.font.size.xs, color: tokens.color.muted }}>
        <div style={{ width: LABEL_WIDTH, flexShrink: 0 }} />
        {days.map((d) => (
          <div key={d.toISOString()} style={{ flex: 1, padding: '4px 6px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {format(d, 'EEE d')}
          </div>
        ))}
      </div>
      <div data-drop-clip style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex' }}>
        <div style={{ width: LABEL_WIDTH, flexShrink: 0 }}>
          {rows.map(({ item }) => (
            <div key={item.id} style={{ height: ROW_HEIGHT, padding: '0 12px', lineHeight: `${ROW_HEIGHT}px`, fontSize: tokens.font.size.sm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.title}
            </div>
          ))}
        </div>
        <div ref={daysRef} data-role="timeline-days" style={{ position: 'relative', flex: 1, minHeight: Math.max(rows.length * ROW_HEIGHT, 120) }}>
          {days.map((d, i) => <DayColumn key={d.toISOString()} viewId={viewId} date={d} index={i} />)}
          {rows.map(({ item, geo }, i) => (
            <div key={item.id} style={{ position: 'absolute', left: 0, right: 0, top: i * ROW_HEIGHT, height: ROW_HEIGHT }}>
              <TimelineBar item={item} geo={geo} days={days} viewId={viewId} daysRef={daysRef} />
            </div>
          ))}
          {rows.length === 0 && (
            <div data-testid="timeline-empty" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.color.muted, fontSize: tokens.font.size.sm, pointerEvents: 'none' }}>
              No dated Items in this period.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

Note: the row wrappers sit above the day columns in the DOM, but dnd-kit hit-tests by rectangle, so drops on day columns still work under bars.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- src/views/timeline && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/views/timeline
git commit -m "feat(app): add Timeline view with range bars and edge editing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Calendar view

**Files:**
- Replace: `app/src/views/calendar/CalendarView.tsx`
- Create: `app/src/views/calendar/DayColumn.tsx`, `BlockView.tsx`, `lanes.ts`
- Test: `app/src/views/calendar/lanes.test.ts`, `app/src/views/calendar/CalendarView.test.tsx`

**Interfaces:**
- Consumes: `useWorkBlocks`, `useUpdateWorkBlock` (Task 11); `useItemsById`, `isTempId` (Task 11); time helpers (Task 9); `useTypedDraggable`, `useTypedDroppable`, `usePreviewAction` (Task 12); `useItemDetailStore`.
- Produces: `CalendarView(props: ViewProps<{ mode: CalendarMode }>)`; `assignLanes(blocks: LaneInput[]): Map<string, { lane: number; lanes: number }>`.

- [ ] **Step 1: Write failing lane tests**

`app/src/views/calendar/lanes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assignLanes } from './lanes';

describe('assignLanes', () => {
  it('gives non-overlapping blocks the full width', () => {
    const m = assignLanes([{ id: 'a', start: 60, end: 120 }, { id: 'b', start: 120, end: 180 }]);
    expect(m.get('a')).toEqual({ lane: 0, lanes: 1 });
    expect(m.get('b')).toEqual({ lane: 0, lanes: 1 });
  });
  it('puts overlapping blocks side by side', () => {
    const m = assignLanes([{ id: 'a', start: 60, end: 180 }, { id: 'b', start: 90, end: 120 }, { id: 'c', start: 130, end: 200 }]);
    expect(m.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(m.get('b')).toEqual({ lane: 1, lanes: 2 });
    expect(m.get('c')).toEqual({ lane: 1, lanes: 2 });
  });
});
```

- [ ] **Step 2: Implement `lanes.ts`**

```ts
export interface LaneInput {
  id: string;
  start: number; // minutes since midnight
  end: number;
}

/** Side-by-side layout for overlapping blocks within one day. */
export function assignLanes(blocks: LaneInput[]): Map<string, { lane: number; lanes: number }> {
  const out = new Map<string, { lane: number; lanes: number }>();
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const closeCluster = () => {
    for (const c of cluster) out.set(c.id, { lane: c.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };

  for (const b of sorted) {
    if (b.start >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((end) => end <= b.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(b.end);
    } else {
      laneEnds[lane] = b.end;
    }
    cluster.push({ id: b.id, lane });
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  closeCluster();
  return out;
}
```

Run: `npm test -- src/views/calendar/lanes.test.ts` → PASS.

- [ ] **Step 3: Write failing component tests**

`app/src/views/calendar/CalendarView.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeBlock, makeItem } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { HOUR_PX } from '../../domain/time';
import { CalendarView } from './CalendarView';

const local = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const lastPatch = (api: ReturnType<typeof createFakeApi>) => [...api.calls].reverse().find((c) => c.method === 'PATCH');

function seed() {
  return createFakeApi({
    items: [makeItem({ id: 'i1', title: 'Physics' })],
    blocks: [makeBlock({ id: 'b1', item_id: 'i1', start_at: local(6, 19), end_at: local(6, 20) })],
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 9, 7, 12, 0));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CalendarView', () => {
  it('renders the week with blocks in the right day column', async () => {
    renderWithProviders(<CalendarView viewId="c1" config={{ mode: 'week' }} setConfig={vi.fn()} />, { api: seed() });
    const tue = await screen.findByTestId('calendar-day-2026-10-06');
    const block = await within(tue).findByTestId('calendar-block-b1');
    expect(block).toHaveAttribute('data-start', '2026-10-06T19:00');
    expect(block).toHaveAttribute('data-end', '2026-10-06T20:00');
    expect(block).toHaveTextContent('Physics');
    expect(screen.getByTestId('calendar-slot-2026-10-06-1900')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-day-2026-10-11')).toBeInTheDocument();
  });

  it('day mode shows only today and the toggle calls setConfig', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const setConfig = vi.fn();
    renderWithProviders(<CalendarView viewId="c1" config={{ mode: 'day' }} setConfig={setConfig} />, { api: seed() });
    expect(await screen.findByTestId('calendar-day-2026-10-07')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-day-2026-10-06')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('calendar-mode-week'));
    expect(setConfig).toHaveBeenCalledWith({ mode: 'week' });
  });

  it('navigating to next week fetches that range', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { api } = renderWithProviders(<CalendarView viewId="c1" config={{ mode: 'week' }} setConfig={vi.fn()} />, { api: seed() });
    await screen.findByTestId('calendar-block-b1');
    await user.click(screen.getByTestId('calendar-next'));
    const nextMon = encodeURIComponent(new Date(2026, 9, 12).toISOString());
    await waitFor(() => expect(api.calls.some((c) => c.path.includes(`start=${nextMon}`))).toBe(true));
    expect(screen.queryByTestId('calendar-block-b1')).not.toBeInTheDocument();
  });

  it('dragging the bottom edge resizes in 15-minute steps', async () => {
    const { api } = renderWithProviders(<CalendarView viewId="c1" config={{ mode: 'week' }} setConfig={vi.fn()} />, { api: seed() });
    const block = await screen.findByTestId('calendar-block-b1');
    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({ top: 1000, left: 0, width: 100, height: HOUR_PX, right: 100, bottom: 1000 + HOUR_PX, x: 0, y: 1000, toJSON() {} } as DOMRect);
    const handle = screen.getByTestId('calendar-block-resize-b1');
    fireEvent.pointerDown(handle, { clientY: 1000 + HOUR_PX, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 1000 + 2 * HOUR_PX + 5, pointerId: 1 });
    fireEvent.pointerUp(window, { clientY: 1000 + 2 * HOUR_PX + 5, pointerId: 1 });
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ end_at: local(6, 21) }));
  });

  it('never resizes below 15 minutes', async () => {
    const { api } = renderWithProviders(<CalendarView viewId="c1" config={{ mode: 'week' }} setConfig={vi.fn()} />, { api: seed() });
    const block = await screen.findByTestId('calendar-block-b1');
    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({ top: 1000, left: 0, width: 100, height: HOUR_PX, right: 100, bottom: 1000 + HOUR_PX, x: 0, y: 1000, toJSON() {} } as DOMRect);
    const handle = screen.getByTestId('calendar-block-resize-b1');
    fireEvent.pointerDown(handle, { clientY: 1000 + HOUR_PX, pointerId: 1 });
    fireEvent.pointerUp(window, { clientY: 900, pointerId: 1 });
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ end_at: local(6, 19, 15) }));
  });

  it('shows the empty state when nothing is scheduled', async () => {
    renderWithProviders(<CalendarView viewId="c1" config={{ mode: 'week' }} setConfig={vi.fn()} />);
    expect(await screen.findByTestId('calendar-empty')).toHaveTextContent('Nothing scheduled.');
  });
});
```

Run: `npm test -- src/views/calendar` → FAIL.

- [ ] **Step 4: Implement `BlockView.tsx`**

```tsx
import { format } from 'date-fns';
import { useState } from 'react';
import { isTempId } from '../../api/items';
import type { Item, WorkBlock } from '../../api/types';
import { useUpdateWorkBlock } from '../../api/workBlocks';
import { useTypedDraggable } from '../../dnd/hooks';
import { toRect } from '../../dnd/types';
import { HOUR_PX, MIN_BLOCK_MINUTES, MINUTES_PER_DAY, atMinutes, clamp, minutesSinceMidnight, roundTo15, toLocalStamp } from '../../domain/time';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { tokens } from '../../ui/tokens';

export function BlockView({ block, item, viewId, lane, lanes }: {
  block: WorkBlock;
  item: Item | undefined;
  viewId: string;
  lane: number;
  lanes: number;
}) {
  const temp = isTempId(block.id);
  const drag = useTypedDraggable({ id: `${viewId}:block:${block.id}`, payload: { kind: 'workBlock', blockId: block.id }, disabled: temp });
  const update = useUpdateWorkBlock();
  const openDetail = useItemDetailStore((s) => s.open);
  const [previewEnd, setPreviewEnd] = useState<number | null>(null);

  const start = new Date(block.start_at);
  const end = new Date(block.end_at);
  const startMin = minutesSinceMidnight(start);
  const sameDay = start.toDateString() === end.toDateString();
  const endMin = previewEnd ?? (sameDay ? minutesSinceMidnight(end) : MINUTES_PER_DAY);
  const height = ((endMin - startMin) / 60) * HOUR_PX;

  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const top = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().top;
    const endAt = (clientY: number) =>
      clamp(roundTo15(startMin + ((clientY - top) / HOUR_PX) * 60), startMin + MIN_BLOCK_MINUTES, MINUTES_PER_DAY);
    const onMove = (ev: PointerEvent) => setPreviewEnd(endAt(ev.clientY));
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setPreviewEnd(null);
      const next = atMinutes(start, endAt(ev.clientY)).toISOString();
      if (Date.parse(next) !== Date.parse(block.end_at)) update.mutate({ id: block.id, patch: { end_at: next } });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const done = item?.status === 'completed';
  return (
    <div
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      data-testid={`calendar-block-${block.id}`}
      data-start={toLocalStamp(start)}
      data-end={toLocalStamp(previewEnd === null ? end : atMinutes(start, previewEnd))}
      onClick={(e) => !temp && openDetail(block.item_id, toRect(e.currentTarget.getBoundingClientRect()))}
      style={{
        position: 'absolute', top: (startMin / 60) * HOUR_PX + 1, height: Math.max(height - 2, 10),
        left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`,
        background: tokens.color.accentSoft, borderLeft: `3px solid ${tokens.color.accent}`, borderRadius: tokens.radius.sm,
        padding: '2px 6px', overflow: 'hidden', cursor: temp ? 'default' : 'grab', userSelect: 'none',
        opacity: drag.isDragging ? 0.35 : done ? 0.5 : 1, fontSize: tokens.font.size.xs, zIndex: 2,
      }}
    >
      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item?.title ?? ''}</div>
      {height >= 36 && (
        <div style={{ color: tokens.color.muted }}>
          {format(start, 'h:mm')}–{format(atMinutes(start, endMin), 'h:mm a')}
        </div>
      )}
      <div
        data-testid={`calendar-block-resize-${block.id}`}
        onPointerDown={onResizeDown}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, cursor: 'ns-resize' }}
      />
    </div>
  );
}
```

The resize math reads the block's own rectangle (`parentElement` of the handle is the block). The test mocks that rectangle.

- [ ] **Step 5: Implement `DayColumn.tsx`**

```tsx
import type { Item, WorkBlock } from '../../api/types';
import { useTypedDroppable } from '../../dnd/hooks';
import { usePreviewAction } from '../../dnd/usePreviewAction';
import { HOUR_PX, MINUTES_PER_DAY, minutesSinceMidnight, toDateKey } from '../../domain/time';
import { tokens } from '../../ui/tokens';
import { BlockView } from './BlockView';
import { assignLanes } from './lanes';

const SLOT_PX = HOUR_PX / 4;
const slotLabel = (i: number) => `${String(Math.floor(i / 4)).padStart(2, '0')}${String((i % 4) * 15).padStart(2, '0')}`;

export function DayColumn({ viewId, date, blocks, items }: {
  viewId: string;
  date: Date;
  blocks: WorkBlock[];
  items: Map<string, Item>;
}) {
  const key = toDateKey(date);
  const drop = { kind: 'calendarDay', date: key } as const;
  const { setNodeRef, isOver, getRect } = useTypedDroppable({ id: `${viewId}:cday:${key}`, drop });
  const preview = usePreviewAction(drop, isOver, getRect);
  const lanes = assignLanes(blocks.map((b) => ({
    id: b.id,
    start: minutesSinceMidnight(new Date(b.start_at)),
    end: Math.max(minutesSinceMidnight(new Date(b.start_at)) + 15, minutesSinceMidnight(new Date(b.end_at)) || MINUTES_PER_DAY),
  })));

  let ghost: { top: number; height: number } | null = null;
  if (preview && (preview.type === 'createBlock' || preview.type === 'moveBlock')) {
    const s = new Date(preview.startAt);
    const e = new Date(preview.endAt);
    if (toDateKey(s) === key) {
      ghost = { top: (minutesSinceMidnight(s) / 60) * HOUR_PX, height: ((e.getTime() - s.getTime()) / 3_600_000) * HOUR_PX };
    }
  }

  return (
    <div
      ref={setNodeRef}
      data-testid={`calendar-day-${key}`}
      style={{ position: 'relative', flex: 1, minWidth: 0, height: 24 * HOUR_PX, borderLeft: `1px solid ${tokens.color.border}`, background: isOver ? tokens.color.accentFaint : 'transparent' }}
    >
      {Array.from({ length: 96 }, (_, i) => (
        <div
          key={i}
          data-testid={`calendar-slot-${key}-${slotLabel(i)}`}
          style={{ position: 'absolute', left: 0, right: 0, top: i * SLOT_PX, height: SLOT_PX, borderTop: i % 4 === 0 && i ? `1px solid ${tokens.color.border}` : 'none' }}
        />
      ))}
      {ghost && (
        <div
          data-testid="calendar-ghost"
          style={{ position: 'absolute', left: 2, right: 2, top: ghost.top, height: ghost.height, border: `1.5px dashed ${tokens.color.accent}`, borderRadius: tokens.radius.sm, background: tokens.color.accentFaint, pointerEvents: 'none', zIndex: 3 }}
        />
      )}
      {blocks.map((b) => {
        const l = lanes.get(b.id) ?? { lane: 0, lanes: 1 };
        return <BlockView key={b.id} block={b} item={items.get(b.item_id)} viewId={viewId} lane={l.lane} lanes={l.lanes} />;
      })}
    </div>
  );
}
```

- [ ] **Step 6: Implement `CalendarView.tsx`**

```tsx
import { format } from 'date-fns';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useItemsById } from '../../api/items';
import type { CalendarMode } from '../../api/types';
import { useWorkBlocks } from '../../api/workBlocks';
import { HOUR_PX, shiftDays, startOfDayLocal, toDateKey, weekDays, weekStart } from '../../domain/time';
import { tokens } from '../../ui/tokens';
import type { ViewProps } from '../../workspace/viewTypes';
import { DayColumn } from './DayColumn';

const GUTTER = 52;

export function CalendarView({ viewId, config, setConfig }: ViewProps<{ mode: CalendarMode }>) {
  const [anchor, setAnchor] = useState(() => startOfDayLocal(new Date()));
  const days = useMemo(() => (config.mode === 'week' ? weekDays(weekStart(anchor)) : [anchor]), [anchor, config.mode]);
  const range = useMemo(() => ({ start: days[0], end: shiftDays(days[days.length - 1], 1) }), [days]);
  const { data: blocks = [] } = useWorkBlocks(range);
  const items = useItemsById();
  const scrollRef = useRef<HTMLDivElement>(null);
  const step = config.mode === 'week' ? 7 : 1;

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 8 * HOUR_PX;
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, typeof blocks>();
    for (const b of blocks) {
      const k = toDateKey(new Date(b.start_at));
      m.set(k, [...(m.get(k) ?? []), b]);
    }
    return m;
  }, [blocks]);

  const todayKey = toDateKey(new Date());
  const navButton = { border: 'none', background: 'transparent', padding: '2px 6px', borderRadius: tokens.radius.sm, color: tokens.color.muted };
  const modeButton = (m: CalendarMode) => ({
    ...navButton, color: config.mode === m ? tokens.color.text : tokens.color.muted, fontWeight: config.mode === m ? 600 : 400,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: tokens.font.size.sm }}>
        <span style={{ flex: 1, fontWeight: 500 }}>
          {config.mode === 'week' ? `${format(days[0], 'MMM d')} – ${format(days[6], 'MMM d, yyyy')}` : format(anchor, 'EEEE, MMM d')}
        </span>
        <button data-testid="calendar-mode-day" style={modeButton('day')} onClick={() => setConfig({ mode: 'day' })}>Day</button>
        <button data-testid="calendar-mode-week" style={modeButton('week')} onClick={() => setConfig({ mode: 'week' })}>Week</button>
        <span style={{ width: 8 }} />
        <button data-testid="calendar-prev" style={navButton} onClick={() => setAnchor((a) => shiftDays(a, -step))}>‹</button>
        <button data-testid="calendar-today" style={navButton} onClick={() => setAnchor(startOfDayLocal(new Date()))}>Today</button>
        <button data-testid="calendar-next" style={navButton} onClick={() => setAnchor((a) => shiftDays(a, step))}>›</button>
      </div>
      <div style={{ display: 'flex', paddingLeft: GUTTER, borderBottom: `1px solid ${tokens.color.border}`, fontSize: tokens.font.size.xs }}>
        {days.map((d) => {
          const isToday = toDateKey(d) === todayKey;
          return (
            <div key={d.toISOString()} style={{ flex: 1, padding: '4px 6px', color: isToday ? tokens.color.accent : tokens.color.muted, fontWeight: isToday ? 600 : 400, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {format(d, 'EEE d')}
            </div>
          );
        })}
      </div>
      <div ref={scrollRef} data-drop-clip style={{ position: 'relative', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ display: 'flex' }}>
          <div style={{ width: GUTTER, flexShrink: 0, position: 'relative', height: 24 * HOUR_PX }}>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <div key={h} style={{ position: 'absolute', top: h * HOUR_PX - 7, right: 8, fontSize: tokens.font.size.xs, color: tokens.color.faint }}>
                {format(new Date(2000, 0, 1, h), 'h a')}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <DayColumn key={d.toISOString()} viewId={viewId} date={d} blocks={byDay.get(toDateKey(d)) ?? []} items={items} />
          ))}
        </div>
        {blocks.length === 0 && (
          <div data-testid="calendar-empty" style={{ position: 'sticky', top: 12, marginTop: -24 * HOUR_PX, textAlign: 'center', color: tokens.color.muted, fontSize: tokens.font.size.sm, pointerEvents: 'none' }}>
            Nothing scheduled. Drag an Item here to plan time.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npm test -- src/views/calendar && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/src/views/calendar
git commit -m "feat(app): add Calendar view with work blocks, resize, and drop previews

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Phase 4: Workspace management

### Task 18: Panel menu, dividers, and adding views

**Files:**
- Create: `app/src/workspace/PanelMenu.tsx`, `app/src/workspace/Divider.tsx`, `app/src/workspace/resize.ts`, `app/src/app/AddViewMenu.tsx`
- Modify: `app/src/workspace/Panel.tsx` (add `PanelMenu` to the header), `app/src/workspace/LayoutNodeView.tsx` (dividers replace gutters), `app/src/app/Shell.tsx` (pass `<AddViewMenu />` to `TopBar`'s `right` slot)
- Test: `app/src/workspace/resize.test.ts`, `app/src/workspace/WorkspaceChrome.test.tsx`

**Interfaces:**
- Consumes: `useLayout`, `GUTTER_PX`, layout ops (`duplicateView`, `removeView`, `addView`, `setSizes`), `Menu`.
- Produces: `resizePair(sizes, index, deltaFrac, minFrac): number[]`; `MIN_PANEL_PX = 160`; `PanelMenu({ viewId })`; `Divider({ split, index, containerRef })` with `data-testid="divider-{splitId}-{index}"`; `AddViewMenu()`. Split containers carry `data-split-id`.

- [ ] **Step 1: Write failing tests**

`app/src/workspace/resize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resizePair } from './resize';

describe('resizePair', () => {
  it('moves space between the two neighbours of a divider', () => {
    const next = resizePair([0.3, 0.7], 1, 0.1, 0.1);
    expect(next[0]).toBeCloseTo(0.4);
    expect(next[1]).toBeCloseTo(0.6);
  });
  it('leaves other children alone', () => {
    const next = resizePair([0.2, 0.3, 0.5], 2, -0.1, 0.05);
    expect(next[0]).toBeCloseTo(0.2);
    expect(next[1]).toBeCloseTo(0.2);
    expect(next[2]).toBeCloseTo(0.6);
  });
  it('never shrinks a panel below the minimum', () => {
    expect(resizePair([0.3, 0.7], 1, -0.5, 0.16)[0]).toBeCloseTo(0.16);
    expect(resizePair([0.3, 0.7], 1, 0.9, 0.16)[1]).toBeCloseTo(0.16);
  });
});
```

`app/src/workspace/WorkspaceChrome.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Shell } from '../app/Shell';
import { qk } from '../api/keys';
import type { SplitNode, WorkspaceResponse } from '../api/types';
import { renderWithProviders } from '../test/render';

const dropboxPanels = () => document.querySelectorAll('[data-view-type="dropbox"]');

afterEach(() => vi.restoreAllMocks());

describe('workspace chrome', () => {
  it('duplicates a view with independent configuration', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Shell />);
    await user.click(await screen.findByTestId('panel-menu-v-dropbox'));
    await user.click(screen.getByTestId('panel-menu-duplicate'));
    await waitFor(() => expect(dropboxPanels()).toHaveLength(2));

    const second = dropboxPanels()[1] as HTMLElement;
    await user.click(within(second).getByTestId('dropbox-filter'));
    await user.click(within(second).getByTestId('dropbox-filter-option-scheduled'));
    await waitFor(() => expect(within(second).getByTestId('dropbox-filter')).toHaveAttribute('data-filter', 'scheduled'));
    expect(within(dropboxPanels()[0] as HTMLElement).getByTestId('dropbox-filter')).toHaveAttribute('data-filter', 'all');
  });

  it('closes a view and shows the empty state after the last one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Shell />);
    for (const id of ['v-calendar', 'v-timeline', 'v-dropbox']) {
      await user.click(await screen.findByTestId(`panel-menu-${id}`));
      await user.click(screen.getByTestId('panel-menu-close'));
      await waitFor(() => expect(screen.queryByTestId(`panel-${id}`)).not.toBeInTheDocument());
    }
    expect(screen.getByText('No views open')).toBeInTheDocument();
  });

  it('adds a view from the top bar', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Shell />);
    await screen.findByTestId('panel-v-timeline');
    await user.click(screen.getByTestId('add-view'));
    await user.click(screen.getByTestId('add-view-timeline'));
    await waitFor(() => expect(document.querySelectorAll('[data-view-type="timeline"]')).toHaveLength(2));
  });

  it('dragging a divider resizes its split', async () => {
    const { qc } = renderWithProviders(<Shell />);
    const divider = await screen.findByTestId('divider-s-top-1');
    const container = document.querySelector('[data-split-id="s-top"]') as HTMLElement;
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1008, height: 500, right: 1008, bottom: 500, x: 0, y: 0, toJSON() {} } as DOMRect);
    fireEvent.pointerDown(divider, { clientX: 320, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 420, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 420, pointerId: 1 });
    const layout = qc.getQueryData<WorkspaceResponse>(qk.workspace)!.layout;
    const top = (layout.root as SplitNode).children[0] as SplitNode;
    expect(top.sizes[0]).toBeCloseTo(0.42, 2);
  });
});
```

The divider test uses 1000px of usable width (1008 minus one 8px gutter), so a 100px drag moves 0.10 of the space: 0.32 becomes 0.42.

Run: `npm test -- src/workspace` → FAIL.

- [ ] **Step 2: Implement `resize.ts`, `Divider.tsx`, `PanelMenu.tsx`, `AddViewMenu.tsx`**

`app/src/workspace/resize.ts`:

```ts
import { clamp } from '../domain/time';

export const MIN_PANEL_PX = 160;

/** Move `deltaFrac` of the split from child index-1 to child index (the divider between them). */
export function resizePair(sizes: number[], index: number, deltaFrac: number, minFrac: number): number[] {
  const a = sizes[index - 1];
  const b = sizes[index];
  const total = a + b;
  const lo = Math.min(minFrac, total / 2);
  const nextA = clamp(a + deltaFrac, lo, total - lo);
  const next = [...sizes];
  next[index - 1] = nextA;
  next[index] = total - nextA;
  return next;
}
```

`app/src/workspace/Divider.tsx`:

```tsx
import { useState, type RefObject } from 'react';
import type { SplitNode } from '../api/types';
import { setSizes } from '../domain/layout';
import { tokens } from '../ui/tokens';
import { GUTTER_PX } from './LayoutNodeView';
import { MIN_PANEL_PX, resizePair } from './resize';
import { useLayout } from './useWorkspaceLayout';

export function Divider({ split, index, containerRef }: { split: SplitNode; index: number; containerRef: RefObject<HTMLDivElement | null> }) {
  const { update } = useLayout();
  const [state, setState] = useState<'idle' | 'hover' | 'active'>('idle');
  const horizontal = split.direction === 'row';

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current!.getBoundingClientRect();
    const usable = (horizontal ? rect.width : rect.height) - GUTTER_PX * (split.children.length - 1);
    const start = horizontal ? e.clientX : e.clientY;
    const startSizes = split.sizes;
    setState('active');
    const onMove = (ev: PointerEvent) => {
      const delta = ((horizontal ? ev.clientX : ev.clientY) - start) / usable;
      update((l) => setSizes(l, split.id, resizePair(startSizes, index, delta, MIN_PANEL_PX / usable)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setState('idle');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      data-testid={`divider-${split.id}-${index}`}
      onPointerDown={onPointerDown}
      onMouseEnter={() => state === 'idle' && setState('hover')}
      onMouseLeave={() => state === 'hover' && setState('idle')}
      style={{ flex: `0 0 ${GUTTER_PX}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: horizontal ? 'col-resize' : 'row-resize' }}
    >
      <div
        style={{
          width: horizontal ? 2 : '100%', height: horizontal ? '100%' : 2, borderRadius: 1,
          background: state === 'idle' ? 'transparent' : state === 'hover' ? tokens.color.borderStrong : tokens.color.accent,
          transition: `background ${tokens.motion.fast}`,
        }}
      />
    </div>
  );
}
```

`app/src/workspace/PanelMenu.tsx`:

```tsx
import { duplicateView, removeView } from '../domain/layout';
import { Menu } from '../ui/Menu';
import { tokens } from '../ui/tokens';
import { useLayout } from './useWorkspaceLayout';

export function PanelMenu({ viewId }: { viewId: string }) {
  const { update } = useLayout();
  return (
    // Stop pointerdown so opening the menu never starts a panel drag (Task 19).
    <span onPointerDown={(e) => e.stopPropagation()}>
      <Menu
        align="right"
        trigger={({ toggle }) => (
          <button
            data-testid={`panel-menu-${viewId}`}
            aria-label="View options"
            onClick={toggle}
            style={{ border: 'none', background: 'transparent', borderRadius: tokens.radius.sm, padding: '0 6px', color: tokens.color.muted, fontSize: 16, lineHeight: '20px' }}
          >
            ⋯
          </button>
        )}
        items={[
          { key: 'duplicate', label: 'Duplicate view', testID: 'panel-menu-duplicate', onSelect: () => update((l) => duplicateView(l, viewId)) },
          { key: 'close', label: 'Close view', testID: 'panel-menu-close', danger: true, onSelect: () => update((l) => removeView(l, viewId)) },
        ]}
      />
    </span>
  );
}
```

`app/src/app/AddViewMenu.tsx`:

```tsx
import { addView } from '../domain/layout';
import { Menu } from '../ui/Menu';
import { tokens } from '../ui/tokens';
import { useLayout } from '../workspace/useWorkspaceLayout';

export function AddViewMenu() {
  const { update } = useLayout();
  return (
    <Menu
      align="right"
      trigger={({ toggle }) => (
        <button data-testid="add-view" onClick={toggle} style={{ border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: tokens.radius.sm, color: tokens.color.muted }}>
          + View
        </button>
      )}
      items={[
        { key: 'dropbox', label: 'Dropbox', testID: 'add-view-dropbox', onSelect: () => update((l) => addView(l, { type: 'dropbox', config: { filter: 'all' } })) },
        { key: 'calendar', label: 'Calendar', testID: 'add-view-calendar', onSelect: () => update((l) => addView(l, { type: 'calendar', config: { mode: 'week' } })) },
        { key: 'timeline', label: 'Timeline', testID: 'add-view-timeline', onSelect: () => update((l) => addView(l, { type: 'timeline', config: {} })) },
      ]}
    />
  );
}
```

- [ ] **Step 3: Wire them in**

In `Panel.tsx`, add `<PanelMenu viewId={node.id} />` as the last child of the header `div` (after the title `span`).

Replace `LayoutNodeView.tsx` with:

```tsx
import { Fragment, useRef } from 'react';
import type { LayoutNode, SplitNode } from '../api/types';
import { Divider } from './Divider';
import { Panel } from './Panel';

export const GUTTER_PX = 8;

export function LayoutNodeView({ node }: { node: LayoutNode }) {
  if (node.kind === 'view') return <Panel node={node} />;
  return <SplitView node={node} />;
}

function SplitView({ node }: { node: SplitNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} data-split-id={node.id} style={{ display: 'flex', flexDirection: node.direction, width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && <Divider split={node} index={i} containerRef={ref} />}
          <div style={{ flex: `${node.sizes[i]} 1 0px`, display: 'flex', minWidth: 0, minHeight: 0 }}>
            <LayoutNodeView node={child} />
          </div>
        </Fragment>
      ))}
    </div>
  );
}
```

`Divider.tsx` imports `GUTTER_PX` from `LayoutNodeView.tsx` and `LayoutNodeView.tsx` imports `Divider`. That cycle only involves a constant read at call time, so it is safe in ESM. If the bundler complains anyway, move `GUTTER_PX` into `resize.ts` and import it from there in both files.

In `Shell.tsx`, render `<TopBar right={<AddViewMenu />} />` (import from `./AddViewMenu`).

- [ ] **Step 4: Run tests, typecheck, and try it**

Run: `npm test && npm run typecheck`
Expected: all PASS.

Manual check with `make api` + `make app`: duplicate the Dropbox, set different filters, drag the dividers, reload. Expected: the arrangement and filters come back after reload.

- [ ] **Step 5: Commit**

```bash
git add app/src
git commit -m "feat(app): add panel menu, resizable dividers, and add-view menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Docking panels by dragging their header

**Files:**
- Create: `app/src/workspace/DockZones.tsx`
- Modify: `app/src/workspace/Panel.tsx` (header becomes a `panel` draggable; render `<DockZones viewId>`)
- Test: `app/src/workspace/DockZones.test.tsx`

**Interfaces:**
- Consumes: `useTypedDraggable`, `useTypedDroppable`, `useDragStore` (Task 12); `DockEdge` (Task 10). `Shell` already passes `onDock` → `dockView` to `DndProvider` (Task 13).
- Produces: `DockZones({ viewId })` rendering `dock-zone-{viewId}-{edge}` drop targets only while another panel is being dragged.

- [ ] **Step 1: Write the failing test**

`app/src/workspace/DockZones.test.tsx`:

```tsx
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Shell } from '../app/Shell';
import { useDragStore } from '../dnd/dragStore';
import { renderWithProviders } from '../test/render';

afterEach(() => useDragStore.getState().end());

describe('DockZones', () => {
  it('are hidden when nothing is being dragged', async () => {
    renderWithProviders(<Shell />);
    await screen.findByTestId('panel-v-dropbox');
    expect(screen.queryByTestId('dock-zone-v-dropbox-left')).not.toBeInTheDocument();
  });

  it('appear on every other panel while a panel is dragged', async () => {
    renderWithProviders(<Shell />);
    await screen.findByTestId('panel-v-dropbox');
    act(() => useDragStore.getState().begin({ payload: { kind: 'panel', viewId: 'v-calendar' }, pointerStart: { x: 0, y: 0 }, activeInitialRect: null }));
    await waitFor(() => expect(screen.getByTestId('dock-zone-v-dropbox-left')).toBeInTheDocument());
    for (const edge of ['left', 'right', 'top', 'bottom', 'center']) {
      expect(screen.getByTestId(`dock-zone-v-timeline-${edge}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('dock-zone-v-calendar-left')).not.toBeInTheDocument();
  });

  it('do not appear while dragging an item', async () => {
    renderWithProviders(<Shell />);
    await screen.findByTestId('panel-v-dropbox');
    act(() => useDragStore.getState().begin({ payload: { kind: 'item', itemId: 'x' }, pointerStart: { x: 0, y: 0 }, activeInitialRect: null }));
    expect(screen.queryByTestId('dock-zone-v-dropbox-left')).not.toBeInTheDocument();
  });
});
```

Run: `npm test -- src/workspace/DockZones.test.tsx` → FAIL.

- [ ] **Step 2: Implement `DockZones.tsx`**

```tsx
import type { CSSProperties } from 'react';
import { useDragStore } from '../dnd/dragStore';
import { useTypedDroppable } from '../dnd/hooks';
import type { DockEdge } from '../domain/layout';
import { tokens } from '../ui/tokens';

const EDGES: DockEdge[] = ['left', 'right', 'top', 'bottom', 'center'];

const ZONE: Record<DockEdge, CSSProperties> = {
  left: { left: 0, top: 0, bottom: 0, width: '25%' },
  right: { right: 0, top: 0, bottom: 0, width: '25%' },
  top: { top: 0, left: '25%', right: '25%', height: '30%' },
  bottom: { bottom: 0, left: '25%', right: '25%', height: '30%' },
  center: { top: '30%', bottom: '30%', left: '25%', right: '25%' },
};

const PREVIEW: Record<DockEdge, CSSProperties> = {
  left: { left: 4, top: 4, bottom: 4, width: 'calc(50% - 8px)' },
  right: { right: 4, top: 4, bottom: 4, width: 'calc(50% - 8px)' },
  top: { top: 4, left: 4, right: 4, height: 'calc(50% - 8px)' },
  bottom: { bottom: 4, left: 4, right: 4, height: 'calc(50% - 8px)' },
  center: { inset: 4 },
};

function Zone({ viewId, edge }: { viewId: string; edge: DockEdge }) {
  const { setNodeRef, isOver } = useTypedDroppable({ id: `dock:${viewId}:${edge}`, drop: { kind: 'panelZone', viewId, edge } });
  return (
    <>
      <div ref={setNodeRef} data-testid={`dock-zone-${viewId}-${edge}`} style={{ position: 'absolute', ...ZONE[edge] }} />
      {isOver && (
        <div
          style={{
            position: 'absolute', ...PREVIEW[edge], pointerEvents: 'none', borderRadius: tokens.radius.md,
            background: tokens.color.accentSoft, border: `2px solid ${tokens.color.accent}`,
            transition: `all ${tokens.motion.base}`,
          }}
        />
      )}
    </>
  );
}

export function DockZones({ viewId }: { viewId: string }) {
  const payload = useDragStore((s) => s.payload);
  if (!payload || payload.kind !== 'panel' || payload.viewId === viewId) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
      {EDGES.map((edge) => <Zone key={edge} viewId={viewId} edge={edge} />)}
    </div>
  );
}
```

- [ ] **Step 3: Make the header draggable and mount the zones**

In `Panel.tsx`:

```tsx
// add imports
import { useTypedDraggable } from '../dnd/hooks';
import { DockZones } from './DockZones';

// inside Panel, before return:
const drag = useTypedDraggable({ id: `panel:${node.id}`, payload: { kind: 'panel', viewId: node.id } });

// on the header div: spread the drag handle and show a grab cursor
<div
  ref={drag.setNodeRef}
  {...drag.listeners}
  {...drag.attributes}
  data-testid={`panel-header-${node.id}`}
  style={{ /* existing header styles */ cursor: 'grab' }}
>

// on the panel root div: fade while dragging
opacity: drag.isDragging ? 0.5 : 1,

// last child of the panel root div:
<DockZones viewId={node.id} />
```

Leave `DragChip` (Task 12) as is: it shows "View" for panel drags, and the dock preview is the main feedback.

- [ ] **Step 4: Run tests and typecheck, and try it**

Run: `npm test && npm run typecheck`
Expected: all PASS.

Manual check: drag the Timeline header onto the right zone of the Calendar. Expected: a shaded half-panel preview, then Timeline docks to the right of Calendar. Reload keeps it.

- [ ] **Step 5: Commit**

```bash
git add app/src/workspace
git commit -m "feat(app): dock panels by dragging their header

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 5: Acceptance

### Task 20: Playwright harness and FUNCTIONAL_SPEC §20 acceptance test

**Files:**
- Create: `e2e/package.json`, `e2e/playwright.config.ts`, `e2e/serve-app.mjs`, `e2e/helpers.ts`, `e2e/acceptance.spec.ts`, `e2e/tsconfig.json`
- Modify: `Makefile` (add `e2e` target)

**Interfaces:**
- Consumes: the whole stack and every test hook in Global Constraints.
- Produces: `make e2e`; helpers `openApp(page)`, `weekDates()`, `drag(page, source, target, opts?)`, `dragPanel(page, header, zone)`, `itemIdOf(row)`, `blockIdOf(block)`.

- [ ] **Step 1: Set up the package**

```bash
mkdir -p e2e && cd e2e
npm init -y
npm install -D @playwright/test typescript @types/node
npx playwright install chromium
```

Set `e2e/package.json` scripts to:

```json
"scripts": { "test": "TZ=America/Los_Angeles playwright test" }
```

`e2e/tsconfig.json`:

```json
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "strict": true, "types": ["node"] } }
```

- [ ] **Step 2: Write the config and static server**

`e2e/serve-app.mjs`:

```js
// Serves the exported web build (app/dist) with SPA fallback on :8091.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = new URL('../app/dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(8091, () => console.log('app on http://localhost:8091'));
```

`e2e/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

const db = process.env.E2E_DATABASE_URL ?? 'postgres://sprint:sprint@localhost:5433/sprint_e2e?sslmode=disable';

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:8091',
    viewport: { width: 1440, height: 900 },
    timezoneId: 'America/Los_Angeles',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `cd ../api && DATABASE_URL='${db}' AUTH_MODE=dev APP_ENV=test PORT=8090 CORS_ORIGINS=http://localhost:8091 go run ./cmd/server`,
      url: 'http://localhost:8090/healthz',
      timeout: 180_000,
      reuseExistingServer: false,
    },
    { command: 'node serve-app.mjs', url: 'http://localhost:8091', timeout: 30_000, reuseExistingServer: false },
  ],
});
```

Add to the root `Makefile` (and add `e2e` to `.PHONY`):

```make
e2e: migrate-e2e
	cd app && EXPO_PUBLIC_API_URL=http://localhost:8090 EXPO_PUBLIC_AUTH_MODE=dev npx expo export --platform web
	cd e2e && npm test
```

- [ ] **Step 3: Write the helpers**

`e2e/helpers.ts`:

```ts
import { expect, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/** Opens the app as a brand-new dev user so every test starts from the default workspace. */
export async function openApp(page: Page): Promise<string> {
  const user = randomUUID();
  await page.goto(`/?devUser=${user}`);
  await expect(page.getByTestId('panel-v-dropbox')).toBeVisible();
  return user;
}

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Local date keys for the current Monday-start week (runner TZ = browser TZ). */
export function weekDates(now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const keys = Array.from({ length: 7 }, (_, i) => key(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
  const [mon, tue, wed, thu, fri, sat, sun] = keys;
  return { mon, tue, wed, thu, fri, sat, sun, keys };
}

type Offset = { x?: number; y?: number };

/** Pointer-driven drag that dnd-kit's PointerSensor recognizes (needs >4px movement first). */
export async function drag(page: Page, source: Locator, target: Locator, opts: { sourceOffset?: Offset; targetOffset?: Offset } = {}) {
  await target.scrollIntoViewIfNeeded();
  await source.scrollIntoViewIfNeeded();
  const s = (await source.boundingBox())!;
  const t = (await target.boundingBox())!;
  const sx = s.x + (opts.sourceOffset?.x ?? s.width / 2);
  const sy = s.y + (opts.sourceOffset?.y ?? s.height / 2);
  const tx = t.x + (opts.targetOffset?.x ?? t.width / 2);
  const ty = t.y + (opts.targetOffset?.y ?? t.height / 2);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 8, sy + 8, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 15 });
  await page.mouse.move(tx, ty);
  await page.mouse.up();
}

/** Panel drags: dock zones only exist after the drag starts, so measure them mid-drag. */
export async function dragPanel(page: Page, header: Locator, zone: () => Locator) {
  const h = (await header.boundingBox())!;
  await page.mouse.move(h.x + 40, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 60, h.y + h.height / 2 + 10, { steps: 4 });
  await expect(zone()).toBeVisible();
  const z = (await zone().boundingBox())!;
  await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2, { steps: 15 });
  await page.mouse.up();
}

const realId = (prefix: string) => new RegExp(`^${prefix}-(?!tmp-)`);

export async function itemIdOf(row: Locator): Promise<string> {
  await expect(row).toHaveAttribute('data-testid', realId('item-row'));
  return (await row.getAttribute('data-testid'))!.replace('item-row-', '');
}

export async function blockIdOf(block: Locator): Promise<string> {
  await expect(block).toHaveAttribute('data-testid', realId('calendar-block'));
  return (await block.getAttribute('data-testid'))!.replace('calendar-block-', '');
}

export const isPut = (path: string) => (r: { url(): string; request(): { method(): string } }) =>
  r.url().endsWith(path) && r.request().method() === 'PUT';
```

- [ ] **Step 4: Write the acceptance test (FUNCTIONAL_SPEC §20, steps numbered inline)**

`e2e/acceptance.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { blockIdOf, drag, itemIdOf, openApp, weekDates } from './helpers';

test('FUNCTIONAL_SPEC §20: full MVP lifecycle', async ({ page }) => {
  const { mon, tue, wed, fri } = weekDates();
  await openApp(page);
  const dropbox = page.getByTestId('panel-v-dropbox');
  const calendar = page.getByTestId('panel-v-calendar');
  const timeline = page.getByTestId('panel-v-timeline');

  // 1. User creates "Finish assignment".
  await dropbox.getByTestId('dropbox-input').fill('Finish assignment');
  await dropbox.getByTestId('dropbox-input').press('Enter');

  // 2. It appears in Dropbox.
  const row = dropbox.getByTestId(/^item-row-/).filter({ hasText: 'Finish assignment' });
  await expect(row).toBeVisible();
  const id = await itemIdOf(row);

  // 3–4. Monday as OpenAt, Friday as DeadlineAt.
  await row.getByText('Finish assignment').click();
  const detail = page.getByTestId('item-detail');
  await detail.getByTestId('item-open-date').fill(mon);
  await expect(timeline.getByTestId(`timeline-bar-${id}`)).toHaveCount(0); // open-only stays hidden
  await detail.getByTestId('item-deadline-date').fill(fri);
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();

  // 5. Timeline displays Monday → Friday.
  const bar = timeline.getByTestId(`timeline-bar-${id}`);
  await expect(bar).toHaveAttribute('data-open-date', mon);
  await expect(bar).toHaveAttribute('data-deadline-date', fri);

  // 6. Calendar is open alongside Timeline (default workspace).
  await expect(calendar).toBeVisible();

  // 7–8. Drag onto Tuesday 7 PM → one-hour WorkBlock.
  await drag(page, row, calendar.getByTestId(`calendar-slot-${tue}-1900`), { targetOffset: { y: 2 } });
  const block = calendar.getByTestId(`calendar-day-${tue}`).getByTestId(/^calendar-block-/);
  await expect(block).toHaveAttribute('data-start', `${tue}T19:00`);
  await expect(block).toHaveAttribute('data-end', `${tue}T20:00`);
  const blockId = await blockIdOf(block);

  // 9. Resize to two hours.
  const handle = calendar.getByTestId(`calendar-block-resize-${blockId}`);
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 48, { steps: 8 });
  await page.mouse.up();
  await expect(calendar.getByTestId(`calendar-block-${blockId}`)).toHaveAttribute('data-end', `${tue}T21:00`);

  // 10. Duplicate Dropbox.
  await page.getByTestId('panel-menu-v-dropbox').click();
  await page.getByTestId('panel-menu-duplicate').click();
  const dropboxes = page.locator('[data-view-type="dropbox"]');
  await expect(dropboxes).toHaveCount(2);
  const a = dropboxes.nth(0);
  const b = dropboxes.nth(1);

  // 11–12. A = Unscheduled, B = Scheduled (and wait until that layout is saved).
  const layoutSaved = page.waitForResponse((r) => {
    const body = r.request().postData() ?? '';
    return r.url().endsWith('/api/v1/workspace') && r.request().method() === 'PUT' && body.includes('"unscheduled"') && body.includes('"scheduled"');
  });
  await a.getByTestId('dropbox-filter').click();
  await page.getByTestId('dropbox-filter-option-unscheduled').click();
  await b.getByTestId('dropbox-filter').click();
  await page.getByTestId('dropbox-filter-option-scheduled').click();

  // 13. Assignment appears under Scheduled only.
  await expect(b.getByTestId(`item-row-${id}`)).toBeVisible();
  await expect(a.getByTestId(`item-row-${id}`)).toHaveCount(0);
  await layoutSaved;

  // 14. Drag the block to Wednesday (grab and drop 6px below the top edge).
  const blockSaved = page.waitForResponse((r) => r.url().includes(`/work-blocks/${blockId}`) && r.request().method() === 'PATCH');
  await drag(page, calendar.getByTestId(`calendar-block-${blockId}`), calendar.getByTestId(`calendar-slot-${wed}-1900`), {
    sourceOffset: { y: 6 },
    targetOffset: { y: 6 },
  });
  const moved = calendar.getByTestId(`calendar-day-${wed}`).getByTestId(`calendar-block-${blockId}`);
  await expect(moved).toHaveAttribute('data-start', `${wed}T19:00`);
  await expect(moved).toHaveAttribute('data-end', `${wed}T21:00`);
  await blockSaved;

  // 15. Timeline remains Monday → Friday.
  await expect(bar).toHaveAttribute('data-open-date', mon);
  await expect(bar).toHaveAttribute('data-deadline-date', fri);

  // 16–18. Close and reopen: layout and state restored.
  await page.reload();
  const reopened = page.locator('[data-view-type="dropbox"]');
  await expect(reopened).toHaveCount(2);
  await expect(reopened.nth(0).getByTestId('dropbox-filter')).toHaveAttribute('data-filter', 'unscheduled');
  await expect(reopened.nth(1).getByTestId('dropbox-filter')).toHaveAttribute('data-filter', 'scheduled');
  await expect(reopened.nth(1).getByTestId(`item-row-${id}`)).toBeVisible();
  await expect(page.getByTestId(`calendar-block-${blockId}`)).toHaveAttribute('data-start', `${wed}T19:00`);
  await expect(page.getByTestId(`timeline-bar-${id}`)).toHaveAttribute('data-deadline-date', fri);

  // 19. Complete the Item.
  await reopened.nth(1).getByTestId(`item-complete-${id}`).click();

  // 20. Active Dropbox and Timeline views stop displaying it.
  await expect(page.getByTestId(`item-row-${id}`)).toHaveCount(0);
  await expect(page.getByTestId(`timeline-bar-${id}`)).toHaveCount(0);
});
```

- [ ] **Step 5: Run it**

Run: `make e2e`
Expected: `1 passed`.

On failure, open the trace (`npx playwright show-trace e2e/test-results/**/trace.zip`). Fix the cause in the owning task's code; do not weaken an assertion to get it passing. If a drag lands one slot off, check `planDrop`'s grab offset and the `drag` helper offsets before touching anything else. Each real bug becomes its own fix commit (`fix(app): ...`) with a unit test that pins it where possible.

- [ ] **Step 6: Commit**

```bash
git add e2e Makefile
git commit -m "test(e2e): add Playwright harness and FUNCTIONAL_SPEC §20 acceptance test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: UX flow test, workspace persistence test, README, and final verification

**Files:**
- Create: `e2e/ux.spec.ts`, `e2e/workspace.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: helpers from Task 20.
- Produces: green `make test` and `make e2e`; README with setup and Supabase handoff.

- [ ] **Step 1: Write the FEATURE_DESIGN §28 flow**

`e2e/ux.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { blockIdOf, drag, itemIdOf, openApp, weekDates } from './helpers';

test('FEATURE_DESIGN §28: discoverable planning flow', async ({ page }) => {
  const { mon, tue, wed, thu, fri } = weekDates();
  await openApp(page);
  const dropbox = page.getByTestId('panel-v-dropbox');
  const timeline = page.getByTestId('panel-v-timeline');
  const calendar = page.getByTestId('panel-v-calendar');

  // 1. Type "Physics assignment" into Dropbox.
  await dropbox.getByTestId('dropbox-input').fill('Physics assignment');
  await dropbox.getByTestId('dropbox-input').press('Enter');
  const row = dropbox.getByTestId(/^item-row-/).filter({ hasText: 'Physics assignment' });
  const id = await itemIdOf(row);

  // 2. Drag it into Timeline (Monday) → one-day range.
  await drag(page, row, timeline.getByTestId(`timeline-day-${mon}`));
  const bar = timeline.getByTestId(`timeline-bar-${id}`);
  await expect(bar).toHaveAttribute('data-open-date', mon);
  await expect(bar).toHaveAttribute('data-deadline-date', mon);

  // 3. Stretch it Monday → Friday.
  await drag(page, timeline.getByTestId(`timeline-bar-right-${id}`), timeline.getByTestId(`timeline-day-${fri}`));
  await expect(bar).toHaveAttribute('data-deadline-date', fri);
  await expect(bar).toHaveAttribute('data-open-date', mon);

  // 4. Drag it from Timeline into Tuesday on Calendar.
  await drag(page, bar.getByText('Physics assignment'), calendar.getByTestId(`calendar-slot-${tue}-1900`), { targetOffset: { y: 2 } });
  await expect(calendar.getByTestId(`calendar-day-${tue}`).getByTestId(/^calendar-block-/)).toHaveAttribute('data-start', `${tue}T19:00`);

  // 5. Drag it again into Thursday.
  await drag(page, bar.getByText('Physics assignment'), calendar.getByTestId(`calendar-slot-${thu}-1600`), { targetOffset: { y: 2 } });
  const thursday = calendar.getByTestId(`calendar-day-${thu}`).getByTestId(/^calendar-block-/);
  await expect(thursday).toHaveAttribute('data-start', `${thu}T16:00`);
  const thursdayId = await blockIdOf(thursday);
  await expect(bar).toHaveAttribute('data-deadline-date', fri); // scheduling never changes the planning range

  // 6. Move Thursday's block to Wednesday.
  await drag(page, calendar.getByTestId(`calendar-block-${thursdayId}`), calendar.getByTestId(`calendar-slot-${wed}-1600`), {
    sourceOffset: { y: 6 },
    targetOffset: { y: 6 },
  });
  await expect(calendar.getByTestId(`calendar-day-${wed}`).getByTestId(`calendar-block-${thursdayId}`)).toHaveAttribute('data-start', `${wed}T16:00`);
  await expect(calendar.getByTestId(`calendar-day-${thu}`).getByTestId(/^calendar-block-/)).toHaveCount(0);

  // 7. Mark Item complete.
  await row.getByText('Physics assignment').click();
  await page.getByTestId('item-done').click();
  await expect(page.getByTestId(`item-row-${id}`)).toHaveCount(0);
  await expect(page.getByTestId(`timeline-bar-${id}`)).toHaveCount(0);
});
```

- [ ] **Step 2: Write the workspace persistence test**

`e2e/workspace.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { dragPanel, openApp } from './helpers';

const box = async (page: import('@playwright/test').Page, id: string) => (await page.getByTestId(`panel-${id}`).boundingBox())!;

test('views can be moved, resized, closed, and added, and the arrangement survives reload', async ({ page }) => {
  await openApp(page);

  // Move: dock Timeline to the right of Calendar.
  await dragPanel(page, page.getByTestId('panel-header-v-timeline'), () => page.getByTestId('dock-zone-v-calendar-right'));
  await expect.poll(async () => (await box(page, 'v-timeline')).x).toBeGreaterThan((await box(page, 'v-calendar')).x);
  const sameRow = Math.abs((await box(page, 'v-timeline')).y - (await box(page, 'v-calendar')).y) < 4;
  expect(sameRow).toBe(true);

  // Resize: drag the first divider 120px to the right.
  const divider = page.locator('[data-testid^="divider-"]').first();
  const before = (await box(page, 'v-dropbox')).width;
  const d = (await divider.boundingBox())!;
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(d.x + d.width / 2 + 120, d.y + d.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await box(page, 'v-dropbox')).width).toBeGreaterThan(before + 80);

  // Close Dropbox, add a new one.
  await page.getByTestId('panel-menu-v-dropbox').click();
  await page.getByTestId('panel-menu-close').click();
  await expect(page.locator('[data-view-type="dropbox"]')).toHaveCount(0);
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/v1/workspace') && r.request().method() === 'PUT' && (r.request().postData() ?? '').includes('"dropbox"'));
  await page.getByTestId('add-view').click();
  await page.getByTestId('add-view-dropbox').click();
  await expect(page.locator('[data-view-type="dropbox"]')).toHaveCount(1);
  await saved;

  // Reload restores the arrangement.
  await page.reload();
  await expect(page.locator('[data-view-type="dropbox"]')).toHaveCount(1);
  await expect.poll(async () => (await box(page, 'v-timeline')).x).toBeGreaterThan((await box(page, 'v-calendar')).x);
});
```

- [ ] **Step 3: Run the full suite**

Run: `make test && make e2e`
Expected: Go and Vitest suites PASS; Playwright `3 passed`.

Fix failures as described in Task 20 Step 5.

- [ ] **Step 4: Write `README.md`**

Replace the file with:

````markdown
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
````

- [ ] **Step 5: Commit**

```bash
git add e2e README.md
git commit -m "test(e2e): add UX flow and workspace persistence tests; document setup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Final verification (orchestrator)**

Run from a clean checkout of the branch: `make db-down && make test && make e2e`
Expected: everything passes from scratch. Then request the whole-branch review (superpowers:requesting-code-review) against the spec's Definition of Done. Fix every Critical or Important finding, rerun both commands, and only then report completion with the actual command output.
