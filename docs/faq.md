---
title: FAQ
description: Questions that come up more than once.
order: 8
---

# FAQ

## The calendar is empty

Working through the likely causes in order:

1. **Nothing is due this month.** The calendar opens on today (or **Opens
   on**) and fetches only that range. Step back or forward, or press
   **Today** to check where you are.
2. **Start is bound to a column the view does not select.** The roles are
   read through the view; add the column to it.
3. **The view's own filter excludes everything in range.** The range filter is
   added to the view's, not instead of it — a view of *My Active
   Appointments* shows only yours.
4. **The message says "Bind the Start property".** The role is unbound, or
   bound to something that is not a date column.

## An event is on the wrong day

Almost always a *User Local* column formatted as *Date Only*: the value is
midnight in whoever entered it, which is the previous evening for anyone
west of them. Dataverse's own guidance is to avoid that pairing; changing the
column's behaviour to *Date Only* fixes it at the source, for every control
on the form and not just this one.

If the day is wrong only in a canvas app, the control has no metadata there
and placed the value by its shape — see [Canvas apps](canvas.md).

Your browser being in a different time zone from your Dataverse personal
options is *not* a cause: events are placed and written by the Dataverse
zone, measured with the two an hour apart.

## Dragging does nothing

- **The drag handles are missing altogether.** No route on this host can
  write: the record refused `setValue` and there is no Web API. That is
  canvas, or **Allow move** is off.
- **The event moves and then jumps back, with a message.** The write was
  refused — most often a user without update privilege on the record, or a
  column the platform will not let a control write. The message names the
  event and the platform's reason.
- **The event moves and stays, but the record did not change.** The refresh
  after the write has not landed yet; a subgrid refresh takes several
  seconds. If it never changes, the host confirmed a write it did not apply
  — open the record and check.

## The + is not there

It appears on hover on a desktop and always on a touch screen, and only where
the host has a form to open — a model-driven app. **Allow create** off hides
it everywhere.

## Can I move an event to a different time?

Not by dragging: a drag changes the day and keeps the time. Open the record
for the time. An hour grid is the shape this control does not have — see
[Limitations](limitations.md).

## Why does the week start on Sunday for me and Monday for a colleague?

**Week starts on** is *Auto*, which follows each user's personal options —
the same setting the rest of the app uses. Fix it to Sunday or Monday for a
calendar that has to agree with a printed one.

## Why two permission prompts?

**Web API** is the second write route, taken only where the record refuses a
direct write; **Utility** reads each date column's behaviour and the colour
column's option colours. Both are declared optional, so a host without them
loads the calendar and does less rather than refusing to load it.
