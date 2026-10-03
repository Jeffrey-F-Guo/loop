# Personal Sprint Planner
## MVP Product Requirements Document

**Version:** 0.1  
**Status:** Draft  
**Primary platform:** Desktop/Web  
**Frontend:** React Native / React Native Web  
**Backend:** Go  
**Database:** PostgreSQL, initially hosted through Supabase  
**Authentication:** Supabase Auth with Google and Apple

---

# 1. Product Summary

Personal Sprint Planner is a lightweight life-organization application centered around a simple workflow:

**Capture now. Organize later.**

Users rapidly capture tasks, ideas, reminders, assignments, obligations, or other logical units as **Items** in a Dropbox. Later, they organize those Items by adding deadlines, defining when the Item becomes active, and scheduling specific work blocks on a Calendar.

The application exposes the same underlying Items through multiple synchronized views:

- **Dropbox** — what exists and what still needs organization.
- **Timeline** — when Items become active and when they are due.
- **Calendar** — when the user intends to work on them.

The desktop workspace allows any view to be opened multiple times, moved, resized, and arranged alongside other views.

The interaction model resembles organizing work into a software sprint, but applied to personal life.

---

# 2. Problem

Traditional task applications tend to collapse several distinct concepts into a single due date.

For example:

> CS Assignment 4 is available Monday, due Friday, and I intend to work on it Tuesday and Thursday.

Those are three different concepts:

1. The Item exists.
2. The Item is active between Monday and Friday.
3. Work is scheduled for Tuesday and Thursday.

A traditional todo list usually represents only #1 and #2.

A traditional calendar represents only #3.

Project management software can represent all three but is generally too heavy for personal use.

The product should provide these capabilities through a minimal interface with almost no friction.

---

# 3. Core Product Model

The fundamental unit in the application is an **Item**.

An Item represents one logical task, idea, reminder, obligation, or note.

Examples:

- Finish CS assignment
- Apply to Databricks
- Buy groceries
- Research trip ideas
- Look into new project idea
- Call dentist
- Read paper

An Item remains the same logical object regardless of where it appears.

For example:

```text
                  Item #481
              "CS Assignment 4"

                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼

       Dropbox    Timeline    Calendar
          │          │          │
       listed     Mon → Fri   Tue 7–8
                              Thu 4–6
```

The views do not create separate copies of the Item.

They provide different representations of the same Item.

---

# 4. Product Principles

## 4.1 Capture now, organize later

Creating an Item should require almost no configuration.

The minimum creation flow is:

```text
Type something
      ↓
Press Enter
      ↓
Item exists
```

Dates, deadlines, descriptions, and scheduled work can be added later.

## 4.2 One Item, multiple views

Dropbox, Timeline, and Calendar must operate over the same underlying data.

Changing an Item in one view immediately affects its representation elsewhere.

## 4.3 Separate deadlines from scheduled work

A deadline answers:

> When must this be done?

A scheduled work block answers:

> When am I planning to work on it?

These must never be conflated.

## 4.4 Direct manipulation over configuration

Users should organize primarily through:

- drag
- drop
- resize
- click
- type

rather than through configuration forms.

## 4.5 Progressive structure

Items begin almost completely unstructured.

Structure is added only when useful.

```text
Idea
 ↓
Item
 ↓
Add deadline
 ↓
Add planning window
 ↓
Schedule work
```

The product should never require unnecessary fields before capturing something.

## 4.6 Workspace flexibility

Views are not fixed pages.

Each view is a workspace tab/panel that may be:

- opened
- closed
- duplicated
- moved
- resized

The same view type can exist multiple times.

For example:

```text
┌──────── Dropbox: Unscheduled ───────┐
│                                     │
└─────────────────────────────────────┘

┌──── Dropbox: Scheduled ────┐ ┌──── Calendar ────┐
│                            │ │                  │
└────────────────────────────┘ └──────────────────┘
```

---

# 5. Primary User Workflow

## 5.1 Capture

During the day, the user thinks of something:

> Finish physics homework.

They immediately create:

```text
Physics homework
```

Nothing else is required.

It enters Dropbox.

## 5.2 Review

Later, the user opens the application on a computer.

Dropbox contains:

```text
Physics homework
Apply to company
Buy groceries
Research hackathon idea
Call dentist
```

The user organizes these Items.

## 5.3 Add planning information

Physics homework becomes:

```text
Physics homework

Open:
Monday

Deadline:
Wednesday 11:59 PM
```

Timeline now displays:

```text
             MON      TUE      WED
Physics      █████████████████████
```

## 5.4 Schedule work

The user drags Physics Homework from Timeline or Dropbox onto Tuesday at 7 PM.

Calendar:

```text
Tuesday

6:00
7:00  ┌───────────────────┐
      │ Physics homework │
8:00  └───────────────────┘
```

The deadline remains Wednesday.

The scheduled block represents only planned work.

---

# 6. MVP Views

The MVP contains three core view types.

## 6.1 Dropbox

Purpose:

> What currently exists?

Dropbox is the persistent inbox/archive of active Items.

It supports:

- rapid Item creation
- Item listing
- scheduled/unscheduled filtering
- completion
- Item editing
- drag source for other views

Dropbox is not cleared automatically when something is scheduled.

An Item can remain visible while work is in progress.

## 6.2 Timeline

Purpose:

> What is currently active, and what is approaching?

The Timeline displays Items horizontally across dates.

```text
                     MON  TUE  WED  THU  FRI

Physics assignment  █████████████
Application              ███████████████
Groceries                     █
```

For Items with both dates:

```text
open_at → deadline
```

defines the visual range.

Items with only a deadline may appear as deadline markers.

## 6.3 Calendar

Purpose:

> When will I actually work on things?

The Calendar displays scheduled work blocks.

An Item may have:

- zero work blocks
- one work block
- many work blocks

Example:

```text
Assignment 4

Open: Monday
Due: Friday

Work blocks:
Tuesday 7–8 PM
Thursday 4–6 PM
```

---

# 7. Multi-View Workspace

The application shell contains a workspace capable of displaying arbitrary view instances.

Example:

```text
┌────────────────────────────────────────────────────┐
│ Personal Sprint                                   │
├──────────────────────┬─────────────────────────────┤
│                      │                             │
│ Dropbox              │ Calendar                    │
│                      │                             │
│ Physics Assignment   │ Tue                         │
│ Apply to X           │ 7:00 Physics Assignment    │
│ Groceries            │                             │
│                      │                             │
├──────────────────────┴─────────────────────────────┤
│ Timeline                                           │
│ Physics ██████████████                            │
│ Apply        █████████████                        │
└────────────────────────────────────────────────────┘
```

Users can:

- open a view
- close a view
- duplicate a view
- move a view
- resize a view
- configure view-specific filters

View instances operate independently.

For example:

```text
Dropbox A:
filter = Unscheduled

Dropbox B:
filter = Scheduled
```

Both show the same underlying Item collection through different filters.

---

# 8. MVP Feature List

| Area | Feature | MVP |
|---|---|---:|
| Authentication | Google login | Yes |
| Authentication | Apple login | Yes |
| Items | Rapid Item creation | Yes |
| Items | Edit Item | Yes |
| Items | Complete Item | Yes |
| Items | Delete Item | Yes |
| Items | Optional description | Yes |
| Items | Deadline | Yes |
| Items | Open/start date | Yes |
| Dropbox | All Items | Yes |
| Dropbox | Scheduled filter | Yes |
| Dropbox | Unscheduled filter | Yes |
| Dropbox | Completed filter | Optional |
| Timeline | Open → deadline visualization | Yes |
| Timeline | Change dates | Yes |
| Calendar | Day/week calendar | Yes |
| Calendar | Create scheduled work block | Yes |
| Calendar | Multiple blocks per Item | Yes |
| Calendar | Move work block | Yes |
| Calendar | Resize work block | Yes |
| Workspace | Multiple views | Yes |
| Workspace | Duplicate views | Yes |
| Workspace | Move views | Yes |
| Workspace | Resize views | Yes |
| Workspace | Persist layout | Yes |
| Drag/drop | Dropbox → Calendar | Yes |
| Drag/drop | Dropbox → Timeline | Yes |
| Drag/drop | Timeline → Calendar | Yes |
| Drag/drop | Calendar → Calendar | Yes |
| External calendar | Google Calendar sync | No |
| Recurring Items | Recurrence | No |
| AI | Natural-language planning | No |
| AI | Automatic scheduling | No |
| Analytics | Plan vs actual | No |
| Mobile | Full mobile workspace | No |

---

# 9. Explicitly Out of Scope

The following are excluded from MVP:

- AI scheduling
- model routing
- agents
- automatic duration prediction
- schedule optimization
- external calendars
- Google Calendar synchronization
- recurring Items
- reminders/notifications
- dependencies between Items
- plan-vs-actual tracking
- productivity analytics
- collaboration
- teams
- shared calendars
- complex projects
- subtasks
- tags unless needed during implementation
- mobile multi-panel workspace

These may be introduced after validating the core workflow.

---

# 10. Success Criteria

The MVP succeeds if a user can comfortably perform the entire lifecycle:

```text
Capture
   ↓
Dropbox
   ↓
Add deadline
   ↓
See planning window
   ↓
Schedule work
   ↓
Move work if needed
   ↓
Complete Item
```

without needing an external todo application.

Qualitative success criteria:

- Creating an Item feels nearly instantaneous.
- Moving Items between views feels natural.
- Deadline and work scheduling are clearly distinguishable.
- The user can understand the current week at a glance.
- The interface remains useful with 50–100 active Items.
- Opening several views does not make the interface visually overwhelming.
- Users rarely need to open a configuration dialog to organize their day.

---

# 11. Technical Constraints

## Frontend

React Native will be used as the frontend framework.

Desktop/web is the first-class MVP target.

React Native Web or an equivalent React Native web target may be used for desktop browser delivery.

## Backend

Go backend responsible for:

- API
- authorization enforcement
- validation
- Item business logic
- scheduled work blocks
- workspace persistence

The frontend should not directly encode business rules that belong to the domain.

## Database

PostgreSQL is the persistence layer.

Initial deployment uses Supabase Postgres.

Supabase should be treated as hosted PostgreSQL rather than as an application architecture dependency.

This preserves the ability to migrate later to:

- self-hosted PostgreSQL
- AWS RDS
- Neon
- another managed PostgreSQL provider

without redesigning the domain model.

## Authentication

Supabase Auth.

Initial providers:

- Google
- Apple

The Go backend validates user identity and ensures all domain data belongs to the authenticated user.

---

# 12. Product Direction Beyond MVP

The architecture should permit—but not implement yet—future capabilities including:

```text
MVP
 │
 ├── external calendar integration
 ├── mobile capture
 ├── recurring Items
 ├── plan vs actual
 │
 └── intelligent planning
       │
       ├── deterministic scheduler
       ├── natural-language interface
       ├── agents
       ├── model routing
       └── optimization
```

The MVP should validate the underlying interaction model before intelligence is layered onto it.
