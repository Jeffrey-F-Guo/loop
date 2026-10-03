# Personal Sprint Planner
## Feature Design Document

**Design direction:** Notion × Ramp  
**Goal:** Minimal, fast, spatially flexible personal planning.

---

# 1. Design Philosophy

The interface should feel like a workspace, not traditional project-management software.

Avoid:

- large colorful navigation
- excessive cards
- heavy borders
- gradients
- dashboard widgets
- unnecessary metrics
- configuration-heavy forms
- visual gamification

Prefer:

- whitespace
- restrained color
- typography hierarchy
- subtle dividers
- contextual controls
- hover states
- keyboard interaction
- direct manipulation
- progressive disclosure

The visual design should disappear behind the user's content.

---

# 2. Application Shell

Suggested desktop structure:

```text
┌──────────────────────────────────────────────────────────────┐
│  ◫ Personal Sprint                           Search    +     │
├──────┬───────────────────────────────────────────────────────┤
│      │                                                       │
│ Nav  │                   Workspace                           │
│      │                                                       │
│      │                                                       │
│      │                                                       │
└──────┴───────────────────────────────────────────────────────┘
```

Sidebar should be narrow.

Primary actions:

```text
+ View
+ Item
```

Potential navigation:

```text
Workspace

Views
  + Dropbox
  + Calendar
  + Timeline

Settings
```

The workspace itself should receive the overwhelming majority of screen space.

---

# 3. View Panels

Every view is represented as a movable/resizable panel.

Example:

```text
┌─ Dropbox · Unscheduled ─────────────────── ⋯ ┐
│                                               │
│ + Capture something                           │
│                                               │
│ ○ Finish physics assignment                   │
│ ○ Research hackathon idea                     │
│ ○ Call dentist                                │
│                                               │
└───────────────────────────────────────────────┘
```

Header controls should remain subtle.

Possible header:

```text
Dropbox     Unscheduled ▼                 ⋯
```

Overflow menu:

```text
Duplicate view
Change filter
Close view
```

---

# 4. Workspace Layout

Panels snap into a split layout.

Example:

```text
┌──────────────────────────┬───────────────────────────┐
│                          │                           │
│ Dropbox                  │ Calendar                  │
│                          │                           │
│                          │                           │
├──────────────────────────┼───────────────────────────┤
│ Timeline                                             │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Divider dragging resizes panels.

Views may be moved by dragging their header.

Dragging should show a placement indicator:

```text
┌───────────┬────────────────────┐
│           │████████████████████│
│ Current   │ DROP HERE          │
│           │████████████████████│
└───────────┴────────────────────┘
```

---

# 5. Duplicate Views

Duplicating a view creates a new view instance with independent configuration.

Example:

```text
┌──────── UNSCHEDULED ────────┐
│ Assignment                  │
│ Dentist                     │
│ Groceries                   │
└─────────────────────────────┘

┌──────── SCHEDULED ──────────┐
│ Internship application      │
│ Physics study               │
└─────────────────────────────┘
```

They are not separate Item collections.

Changing the Item itself updates both.

Changing the filter changes only that view instance.

---

# 6. Dropbox

## Purpose

Dropbox is the lowest-friction part of the application.

The primary interaction should resemble typing into a lightweight note application.

```text
Dropbox

┌─────────────────────────────────────────┐
│ Add something...                        │
└─────────────────────────────────────────┘

○ Finish physics assignment
○ Apply to company
○ Buy groceries
○ Research project idea
```

Pressing Enter creates the Item and immediately clears the input.

No modal.

No required dates.

No required category.

No required priority.

---

# 7. Dropbox Item Row

Default:

```text
○  Finish physics assignment                   ⋯
```

Possible secondary information:

```text
○  Finish physics assignment
   Due Fri
```

or:

```text
○  Finish physics assignment
   Tue → Fri · 2 blocks
```

Avoid displaying excessive metadata.

Hover may expose:

```text
deadline
edit
more
```

---

# 8. Dropbox Filters

Simple dropdown:

```text
All
Unscheduled
Scheduled
Completed
```

The distinction between scheduled and unscheduled is important enough to be first-class.

Search may be added if implementation cost is low.

---

# 9. Item Detail

Clicking an Item opens a lightweight side panel/popover rather than navigating away.

Example:

```text
┌──────────────────────────────────┐
│ Physics Assignment               │
│                                  │
│ Problems 1–8                     │
│                                  │
│ Open                             │
│ Mon, Oct 5                       │
│                                  │
│ Deadline                         │
│ Fri, Oct 9 · 11:59 PM            │
│                                  │
│ Scheduled                        │
│ Tue · 7:00–8:00 PM               │
│ Thu · 4:00–6:00 PM               │
│                                  │
│                 Delete     Done  │
└──────────────────────────────────┘
```

Most routine planning should still be possible without opening this panel.

---

# 10. Timeline

Default granularity:

**Week**

Potential later options:

- two weeks
- month
- quarter

MVP only requires a useful week-oriented planning horizon.

Example:

```text
                MON      TUE      WED      THU      FRI

Physics         ███████████████████████████████
Application              ██████████████████████
Groceries                                  ●
```

---

# 11. Timeline Bars

Timeline bars represent:

```text
OpenAt → Deadline
```

They do NOT represent estimated effort.

Suggested visual treatment:

- subtle filled background
- Item title inside or beside bar
- rounded corners only slightly
- deadline edge visually distinguishable
- restrained color palette

Hover:

```text
Physics Assignment
Mon → Fri
```

---

# 12. Timeline Editing

Dragging the entire range moves both dates together.

Dragging left edge:

```text
changes OpenAt
```

Dragging right edge:

```text
changes DeadlineAt
```

Before:

```text
MON      TUE      WED      THU      FRI

         ███████████████████
```

Resize:

```text
MON      TUE      WED      THU      FRI

████████████████████████████
```

---

# 13. Calendar

Default desktop view:

**Week**

Example:

```text
          MON          TUE          WED          THU

9:00     Class        Class        Class

10:00

11:00                 ┌──────────┐
                      │ Physics  │
12:00                 └──────────┘

1:00

2:00

3:00                                           ┌─────────┐
                                               │ Apply   │
4:00                                           └─────────┘
```

---

# 14. Work Blocks

WorkBlocks should visually reference their parent Item.

Block content:

```text
Physics Assignment
7:00–8:00
```

If narrow:

```text
Physics
```

Clicking opens Item details.

---

# 15. Calendar Dragging

Dragging a block:

```text
move scheduled work
```

Dragging its lower boundary:

```text
change duration
```

Snap:

```text
15-minute increments
```

Recommended minimum:

```text
15 minutes
```

Default block duration when an Item is dropped onto Calendar:

```text
1 hour
```

---

# 16. Cross-View Dragging

This is one of the product's defining interactions.

## Dropbox → Calendar

```text
Dropbox                         Calendar

Physics Assignment  ───────►   Tue 7 PM

                               ┌─────────────┐
                               │ Physics     │
                               └─────────────┘
```

Creates WorkBlock.

## Timeline → Calendar

```text
Timeline                        Calendar

Physics ███████████ ───────►   Thu 4 PM
```

Creates additional WorkBlock.

Planning range remains unchanged.

## Dropbox → Timeline

```text
Dropbox                        Timeline

Apply to X ───────────────►    Wed
```

Creates/updates planning dates.

A one-day Item may initially appear:

```text
Wed
 ●
```

User can stretch it into:

```text
Wed ━━━━━ Fri
```

---

# 17. Drag Feedback

Every drag interaction needs obvious feedback.

Dragging Item:

```text
┌───────────────────────┐
│ Physics Assignment    │
└───────────────────────┘
```

Calendar target:

```text
7:00  ┌ - - - - - - - - ┐
      │ drop here        │
8:00  └ - - - - - - - - ┘
```

Timeline target:

```text
MON     TUE     WED     THU

                ║
              DROP
```

The user should always understand what dropping will do before releasing.

---

# 18. Important Interaction Rule

Dragging across views modifies only the semantics represented by the destination.

For example:

```text
Timeline → Calendar
```

means:

> Schedule work.

It does **not** mean:

> Change deadline.

Likewise:

```text
Calendar → Calendar
```

means:

> Reschedule work.

The domain model should remain understandable through spatial interaction.

---

# 19. Item Creation UX

Global shortcut:

```text
N
```

or:

```text
Cmd/Ctrl + K → New Item
```

can be added if convenient.

But the primary flow remains an input directly inside Dropbox.

Example:

```text
+ Add something...
```

Input should autofocus easily.

Ideal interaction:

```text
type → Enter → type → Enter → type → Enter
```

This allows rapid brain-dump capture.

---

# 20. Workspace Creation UX

`+ View` opens:

```text
Add view

Dropbox
Calendar
Timeline
```

Selecting one adds it to the workspace.

The user can then drag it wherever desired.

---

# 21. Suggested Default Workspace

First-time users receive:

```text
┌────────────────────┬─────────────────────────────┐
│                    │                             │
│ Dropbox            │ Calendar                    │
│                    │                             │
│                    │                             │
├────────────────────┴─────────────────────────────┤
│ Timeline                                         │
│                                                  │
└──────────────────────────────────────────────────┘
```

This immediately communicates the mental model:

```text
WHAT
Dropbox

WHEN DUE
Timeline

WHEN WORKING
Calendar
```

---

# 22. Empty States

Dropbox:

```text
Nothing here yet.

Add something whenever it comes up.
```

Timeline:

```text
No dated Items in this period.
```

Calendar:

```text
Nothing scheduled.
Drag an Item here to plan time.
```

Keep these understated.

---

# 23. Visual System

Suggested character:

```text
Background:
neutral / near-white

Panels:
same or minimally differentiated background

Borders:
1px subtle neutral

Typography:
strong hierarchy
few font weights

Primary text:
high contrast

Secondary metadata:
muted

Accent:
one restrained product accent

Corners:
moderately small

Shadows:
minimal
```

Notion should influence simplicity.

Ramp should influence precision and polish.

The application should feel closer to:

```text
professional productivity tool
```

than:

```text
consumer habit tracker
```

---

# 24. Animation

Use animation only where it clarifies spatial behavior:

- panel docking
- drag previews
- WorkBlock movement
- Item insertion/removal
- subtle hover transitions

No ornamental animation.

---

# 25. State Synchronization

Consider this workspace:

```text
┌ Dropbox A ┐
┌ Dropbox B ┐
┌ Timeline  ┐
┌ Calendar  ┐
```

If the user renames:

```text
"Physics HW"
```

to:

```text
"Physics Assignment"
```

all four representations update immediately.

This should feel like manipulating one shared object from several perspectives.

---

# 26. Persistence

Workspace state should survive reload.

Persist:

```text
open view instances
view type
view filters
panel positions
panel sizes
```

Example:

User closes Friday with:

```text
Left:
Unscheduled Dropbox

Center:
Calendar

Bottom:
Timeline

Right:
Scheduled Dropbox
```

Saturday opens exactly the same arrangement.

---

# 27. Responsive Strategy

Desktop/web is the design target for MVP.

Mobile is intentionally deferred.

The domain and API should nevertheless support a future simple mobile UI:

```text
Bottom navigation

Dropbox
Calendar
```

Mobile does not need:

- simultaneous panes
- Timeline editing
- complex workspace management

The most important eventual mobile operation is rapid capture.

---

# 28. MVP UX Test

A new user should be able to discover the workflow without onboarding documentation:

```text
1. Type "Physics assignment" into Dropbox.

2. Drag it into Timeline.

3. Stretch it Monday → Friday.

4. Drag it from Timeline into Tuesday on Calendar.

5. Drag it again into Thursday.

6. Move Thursday's block to Wednesday.

7. Mark Item complete.
```

If those actions feel obvious from the interface itself, the interaction design has succeeded.

---

# 29. Core Mental Model

The entire MVP can be summarized as:

```text
                           ITEM
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
         DROPBOX         TIMELINE        CALENDAR
            │               │               │
        What exists?     When active?    When work?
                            │               │
                            ▼               ▼
                      Open → Deadline    WorkBlocks
```

And the central workflow remains:

```text
CAPTURE
   ↓
ORGANIZE
   ↓
SCHEDULE
   ↓
DO
```

Everything in the MVP should make those four steps faster.
