# Personal Sprint Planner
## MVP Functional Specification

**Version:** 0.1

---

# 1. Domain Model

The application has three primary persistent domain concepts:

1. **Item**
2. **WorkBlock**
3. **WorkspaceLayout**

Views are UI representations, not separate copies of domain data.

---

# 2. Item

An Item is the base logical unit throughout the application.

Example Go representation:

```go
type Item struct {
    ID          uuid.UUID  `json:"id"`
    UserID      uuid.UUID  `json:"user_id"`

    Title       string     `json:"title"`
    Description *string    `json:"description,omitempty"`

    OpenAt      *time.Time `json:"open_at,omitempty"`
    DeadlineAt  *time.Time `json:"deadline_at,omitempty"`

    Status      ItemStatus `json:"status"`

    CreatedAt   time.Time  `json:"created_at"`
    UpdatedAt   time.Time  `json:"updated_at"`
    CompletedAt *time.Time `json:"completed_at,omitempty"`
}
```

Status:

```go
type ItemStatus string

const (
    ItemStatusActive    ItemStatus = "active"
    ItemStatusCompleted ItemStatus = "completed"
)
```

Important design decision:

**Scheduled vs unscheduled is not Item status.**

It is derived from whether the Item currently has at least one WorkBlock.

---

# 3. Item JSON Schema

Conceptually:

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "Physics Assignment 4",
  "description": "Problems 1-8",
  "open_at": "2026-10-05T00:00:00Z",
  "deadline_at": "2026-10-08T23:59:00Z",
  "status": "active",
  "created_at": "2026-10-02T23:00:00Z",
  "updated_at": "2026-10-02T23:15:00Z",
  "completed_at": null
}
```

Minimum valid Item:

```json
{
  "title": "Look into hackathon idea"
}
```

All planning fields are optional.

---

# 4. WorkBlock

A WorkBlock represents planned time allocated to an Item.

```go
type WorkBlock struct {
    ID        uuid.UUID `json:"id"`
    UserID    uuid.UUID `json:"user_id"`
    ItemID    uuid.UUID `json:"item_id"`

    StartAt   time.Time `json:"start_at"`
    EndAt     time.Time `json:"end_at"`

    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}
```

Example:

```json
{
  "id": "...",
  "item_id": "...",
  "start_at": "2026-10-06T19:00:00-07:00",
  "end_at": "2026-10-06T20:00:00-07:00"
}
```

Relationship:

```text
Item
 │
 ├── WorkBlock
 ├── WorkBlock
 └── WorkBlock
```

An Item can have zero or many WorkBlocks.

---

# 5. Planning Semantics

These concepts must remain independent.

```text
OPEN DATE
"When can/should this become active?"

DEADLINE
"When must this be finished?"

WORK BLOCK
"When am I planning to work on it?"
```

Example:

```text
Physics Assignment

OpenAt:
Monday 00:00

Deadline:
Friday 23:59

WorkBlocks:
Tuesday 19:00–20:00
Thursday 16:00–18:00
```

Changing a WorkBlock must not implicitly modify the deadline.

Changing a deadline must not automatically move WorkBlocks.

---

# 6. Dropbox Semantics

Dropbox is not a separate storage system.

It is a query/view over Items.

Default query:

```text
user_id = current_user
status = active
```

Possible filters:

```text
All
Scheduled
Unscheduled
Completed
```

Scheduled definition:

```text
COUNT(work_blocks) > 0
```

Unscheduled definition:

```text
COUNT(work_blocks) == 0
```

Items remain in Dropbox after they are scheduled.

---

# 7. Timeline Semantics

Timeline represents planning ranges.

### Item with OpenAt and DeadlineAt

Render:

```text
OpenAt ━━━━━━━━━ DeadlineAt
```

### Deadline only

Render deadline marker:

```text
──────────────●
              due
```

### OpenAt only

Optional MVP behavior:

Render from OpenAt to the end of visible period.

Preferred simpler behavior:

Do not display it as a full range until a deadline exists.

### Neither

Do not display Item in Timeline unless manually surfaced through a filter/sidebar.

---

# 8. Calendar Semantics

Calendar renders WorkBlocks.

A WorkBlock is always associated with exactly one Item.

Example:

```text
Tuesday

18:00
19:00 ┌─────────────────────────┐
      │ Physics Assignment     │
20:00 └─────────────────────────┘
21:00
```

Calendar should support:

- day view
- week view

Month view is optional for MVP.

Week view should be the default planning experience.

---

# 9. Workspace Model

A workspace contains instances of views.

Possible model:

```go
type ViewInstance struct {
    ID       uuid.UUID      `json:"id"`
    Type     ViewType       `json:"type"`
    Config   map[string]any `json:"config"`
}
```

View types:

```text
dropbox
calendar
timeline
```

Example:

```json
{
  "id": "view-1",
  "type": "dropbox",
  "config": {
    "filter": "unscheduled"
  }
}
```

Another instance:

```json
{
  "id": "view-2",
  "type": "dropbox",
  "config": {
    "filter": "scheduled"
  }
}
```

These are two UI instances operating over the same Item database.

---

# 10. Workspace Layout

The layout needs to preserve:

- open views
- duplicates
- position
- dimensions
- view configuration

Conceptual representation:

```json
{
  "workspace_id": "...",
  "layout": {
    "direction": "horizontal",
    "children": [
      {
        "view_id": "dropbox-1",
        "size": 0.3
      },
      {
        "direction": "vertical",
        "size": 0.7,
        "children": [
          {
            "view_id": "calendar-1",
            "size": 0.6
          },
          {
            "view_id": "timeline-1",
            "size": 0.4
          }
        ]
      }
    ]
  }
}
```

A tree/split-pane structure is preferable to arbitrary pixel coordinates because it naturally supports responsive resizing.

---

# 11. Core User Operations

## Create Item

Input:

```text
"Physics Assignment"
```

Required:

```text
title
```

Result:

- Item created.
- Item appears immediately in all relevant Dropbox views.
- Item is persisted.
- No dates required.

## Edit Item

Editable:

- title
- description
- open date
- deadline
- status

Updates propagate to all view instances.

## Complete Item

Action sets:

```text
status = completed
completed_at = now()
```

Default active views stop showing it unless configured otherwise.

WorkBlock history may remain stored.

## Delete Item

Deletion removes:

- Item
- associated WorkBlocks

A confirmation should be required.

---

# 12. Drag-and-Drop Functional Rules

## Dropbox → Calendar

User drops Item on a calendar time.

System creates:

```text
WorkBlock {
    item_id
    start_at = drop_position
    end_at = default_duration
}
```

Default duration:

**60 minutes**

The user may resize afterward.

## Timeline → Calendar

Same behavior:

```text
create WorkBlock
```

No deadline or OpenAt mutation occurs.

## Calendar → Calendar

Move:

```text
start_at
end_at
```

Duration remains unchanged.

## Calendar block resize

Update:

```text
end_at
```

Minimum WorkBlock duration:

Recommended:

```text
15 minutes
```

Calendar snap interval:

Recommended:

```text
15 minutes
```

## Dropbox → Timeline

Dropping on a date should attach planning metadata.

Recommended behavior:

If Item has no dates:

```text
open_at = dropped date
deadline_at = dropped date
```

The resulting one-day range can then be stretched.

Alternative direct interaction:

Drop creates the starting point and immediately allows the user to drag a range.

## Timeline edge drag

Left edge:

```text
update OpenAt
```

Right edge:

```text
update DeadlineAt
```

Constraint:

```text
OpenAt <= DeadlineAt
```

---

# 13. Same-Item Synchronization

Because multiple views can display the same Item simultaneously:

```text
Dropbox #1
Dropbox #2
Timeline
Calendar
```

a mutation in one view must update all others.

Example:

```text
User changes title:
"Physics HW"
        ↓
"Physics Assignment"
```

All currently visible instances should update without page refresh.

For MVP this does not require a distributed realtime architecture.

A shared frontend state/query cache is sufficient.

Server remains source of truth.

---

# 14. API Surface

Suggested API namespace:

```text
/api/v1
```

## Items

```text
POST   /items
GET    /items
GET    /items/:id
PATCH  /items/:id
DELETE /items/:id
```

Filtering:

```text
GET /items?status=active
GET /items?scheduling=scheduled
GET /items?scheduling=unscheduled
```

## WorkBlocks

```text
POST   /work-blocks
GET    /work-blocks
GET    /work-blocks/:id
PATCH  /work-blocks/:id
DELETE /work-blocks/:id
```

Useful query:

```text
GET /work-blocks?start=...&end=...
```

## Workspace

```text
GET /workspace
PUT /workspace
```

MVP may maintain a single default workspace per user.

---

# 15. Database Schema

Suggested tables:

```text
users/profile metadata
items
work_blocks
workspaces
```

Conceptually:

```sql
items
------------------------
id UUID PK
user_id UUID
title TEXT
description TEXT NULL
open_at TIMESTAMPTZ NULL
deadline_at TIMESTAMPTZ NULL
status TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
completed_at TIMESTAMPTZ NULL
```

```sql
work_blocks
------------------------
id UUID PK
user_id UUID
item_id UUID FK
start_at TIMESTAMPTZ
end_at TIMESTAMPTZ
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

```sql
workspaces
------------------------
id UUID PK
user_id UUID
layout JSONB
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Important indexes:

```text
items(user_id)
items(user_id, status)
items(user_id, deadline_at)
work_blocks(user_id, start_at)
work_blocks(item_id)
```

---

# 16. Authentication Flow

Frontend:

```text
Login
  ↓
Supabase OAuth
  ↓
JWT/session
  ↓
React Native client
  ↓
Go API
```

Go backend validates the authenticated identity before any domain action.

Every Item, WorkBlock, and Workspace belongs to one user.

Users may never access another user's records.

---

# 17. Source-of-Truth Rules

Postgres:

**Persistent source of truth**

Frontend state:

**Temporary UI/cache representation**

Supabase:

**Infrastructure provider**

The application should avoid tying domain behavior to Supabase-specific database APIs.

Preferred architecture:

```text
Frontend
   │
   ▼
Go API
   │
   ▼
Postgres
```

rather than:

```text
Frontend ─────► Supabase tables directly
```

Supabase Auth may remain directly integrated where appropriate.

---

# 18. Error Behavior

Mutations should use optimistic UI where reasonable.

Example:

```text
drag WorkBlock
      ↓
UI moves immediately
      ↓
PATCH request
      ↓
success → retain
failure → revert + subtle error
```

Users should never lose an Item silently.

---

# 19. Basic Validation

Item:

```text
title length > 0
title reasonable max length
OpenAt <= DeadlineAt
```

WorkBlock:

```text
StartAt < EndAt
Item exists
Item belongs to user
```

Workspace:

```text
Every referenced view has valid type
No invalid recursive structure
```

---

# 20. MVP Acceptance Test

Given an authenticated user:

1. User creates `"Finish assignment"`.
2. It appears in Dropbox.
3. User sets Monday as OpenAt.
4. User sets Friday as DeadlineAt.
5. Timeline displays Monday → Friday.
6. User opens Calendar alongside Timeline.
7. User drags Item onto Tuesday at 7 PM.
8. Calendar creates a one-hour WorkBlock.
9. User resizes it to two hours.
10. User duplicates Dropbox.
11. Dropbox A filters Unscheduled.
12. Dropbox B filters Scheduled.
13. Assignment appears under Scheduled.
14. User drags the Calendar block to Wednesday.
15. Timeline remains Monday → Friday.
16. User closes the application.
17. User reopens it.
18. Workspace layout and Item state are restored.
19. User completes the Item.
20. Active Dropbox and Timeline views stop displaying it.

If this complete workflow feels smooth, the MVP's core architecture is working.
