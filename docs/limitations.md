---
title: Limitations
description: What Calendar View does not do.
order: 7
---

# Limitations

## The hour grid is off until you turn it on

**Hour grid in Day and Week** (from 0.3.0) draws those two views against the
hours of the day. It is off by default, so a calendar installed before 0.3.0
keeps the week it had: seven columns of events in time order, where a drag
changes the day and keeps the time. The month is always whole days, and the
timeline's bars always move by whole days.

## What the hour grid does not draw

- **An event that crosses midnight is not a tall block over two days.** It
  sits in the *All day* row above the hours, across the days it covers, with
  whole-day events — a night shift reads as a bar, not as two half-blocks.
  An event ending at exactly midnight still ends its own day.
- **Twenty-four equal hours, even on the day the clocks change.** On the
  autumn change the repeated hour's events share that hour's space; on the
  spring change the skipped hour is still drawn, and a time dragged into it
  is one that does not exist in the user's zone — where it lands is the
  platform's to decide (not yet seen on a form).
- **Steps of 15, 30 or 60 minutes.** A drag snaps to **Time step**, an event
  created from a free slot is one step long, and the menu moves by one step.
  A time between steps is kept until the event is moved, then snapped.
- **A short event shows its title, not its time.** Under about 45 minutes a
  block has room for one line, and the title takes it; the time is in its
  tooltip, and its place in the column says when. A Day view's wider column
  shows both.

## The hour grid has a height of its own

A form subgrid gives a control no height (measured — the platform answers
`-1`), so the grid is a box of its own: the user's working day plus an hour,
eight to twelve hours of it, scrolling to the rest of the day inside. Where
the host does give a height — a canvas app, full screen — the grid takes it.

It opens on the user's working day, read from their own **Personal Options**
(`usersettings`); where that cannot be read — a canvas app, a user without
read access to their own settings row, the hub's demo — it opens on 8:00 AM
and shades outside 8:00 AM–5:00 PM. Reading it as anyone but a System
Administrator has not been tried on a form yet.

## The hour grid's pointer and keyboard routes differ

Dragging a block, dragging its bottom edge and pressing a free slot are
pointer gestures. The keyboard reaches the same changes another way: each
block's **⋯** menu moves it by one step or one day and its end by one step,
and the **+** in each day's head creates an event at the start of the
working day. There is no keyboard route to a particular empty slot. On a
touch screen a finger on a block drags it rather than scrolling the day;
scroll from the empty part of the grid.

## The timeline's edges are pointer-only

The resize handles on a bar respond to a mouse, a pen or a finger, and to
nothing else — there is no keyboard focus on a bar, because the bar is a
picture of the row's title. Every change a handle makes is also in the
row's **⋯** menu, a day at a time, which is the keyboard route. A finger on
a bar drags the bar rather than scrolling the month; scroll from the header
or the empty cells.

## Not a Gantt chart

The timeline draws one bar per record and nothing between them: no
dependencies, no progress, no critical path, no grouping into lanes. It is
the calendar's third view, not a project planner.

## The range filter is model-driven only

The visible range is fetched with the `On`/`OnOrAfter`/`OnOrBefore` date
operators, which the platform documents for model-driven apps and which were
measured working on a model-driven subgrid — including the nested *or* for
events with no end, and narrowing a view's own filter rather than replacing
it. Canvas apps are not asked: there the calendar shows what the data source
loaded, every month at once, with a notice under the grid saying so. Bind a
filtered data source there.

## A month bigger than a page needs Load more

The control never asks for more than the host's page size — or **Events per
fetch**, when set — in one go. A range with more rows shows *N loaded — there
are more in this range* and a **Load more** button, which appends the next
page without turning it. The platform caps a page at 250.

Moving or resizing an event keeps every event **Load more** has brought in
(from 0.2.4; before it, each move started the range again at its first page).
**Creating an event, or stepping to another range, still does**: both have to
fetch, and a fetch starts at the first page. Press **Load more** again to
bring the rest back.

## Behaviour is read from metadata, and only where metadata can be read

Whether a stored value is a whole day or an instant is the column's
*Behavior*, read through `getEntityMetadata` on model-driven hosts. Where
that call is unavailable — canvas, or a user who cannot read the table's
metadata — a value at exactly UTC midnight is taken as a Date Only day and
anything else as an instant in the user's zone. A **User Local** column whose
value happens to fall on UTC midnight is misplaced by that rule; it is the one
ambiguity only metadata resolves.

## A Date Only *format* on a User Local column is a day early for someone

Not this control's limitation, but the one it makes visible. A column whose
format is *Date Only* but whose behaviour is *User Local* — the default when
a maker creates one — stores midnight in whoever entered it, so users in
other zones see the previous or next day, and a whole day written through
the Web API as a bare date lands a day early for everyone west of Greenwich.
The control reads the behaviour from metadata and writes such a column as an
instant at the user's noon, which lands on the right day; the platform's own
guidance is to give the column *Date Only* behaviour, which cannot be
changed once set.

## Moving in a canvas app is unverified

The record's write half (`setValue` and `save`) is offered wherever the host
supplies it, and the Web API where it does not — and canvas apps offer code
components neither the Web API ([not available there][limits]) nor, as far
as this control has seen, a record it can save. The drag handles and the
menu are hidden where neither route exists, so the calendar is read-only
there rather than broken.

[limits]: https://learn.microsoft.com/power-apps/developer/component-framework/limitations

## The + needs a quick create form

Creating an event opens the table's quick create form through
`navigation.openForm`. A table without one gets the main form instead, which
still opens with the day set. Canvas apps have no forms to open, so the **+**
is not shown there. The hub's demo shows it, and names the form it would have
opened in its event log.

## The colour role needs a choice column with colours

Option colours come from the option set's metadata, so they exist only on
model-driven hosts and only for options Dataverse assigned a colour to. The
role is typed `OptionSet` and a text or lookup column will not appear in its
picker; in a canvas app the label shows as a badge and every event wears the
brand edge.

## Not a scheduler

The hour grid draws a calendar's events against the clock; it does not
schedule. There are no resource lanes, no availability, no recurrence, and
no conflict detection — overlapping events are drawn side by side, and
nothing stops one being moved onto another. For a scheduling board, this is
not the control.
