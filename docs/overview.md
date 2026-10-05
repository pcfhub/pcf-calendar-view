---
title: Overview
description: What Calendar View does, and when to reach for it.
order: 1
---

# Calendar View

A Dataverse view as a month, a week, a day or a timeline, by a date column.
Drag an event to another day to reschedule it; turn on the **hour grid** and
Day and Week are drawn against the hours, where an event drags to another
time and its bottom edge changes how long it runs; on the timeline, drag an
end of a bar; press **+**, or a free slot, to create one.

:::callout{type=warning}
**Reference example · built with AI.** This control was written with AI (Claude) and tested on a live Dataverse form; its code has not been reviewed line by line. It is published as a worked example and is not maintained — read the source and [SPEC.md](https://github.com/pcfhub/pcf-calendar-view/blob/main/SPEC.md) (what was measured on the form) before you use it. Fixes are not guaranteed.
:::

::image{src=media/screenshot-hours-week.png alt="A week against the hours, opened on the working day: a dentist's appointment, a two-hour review with its range, an interview" zoom}

::image{src=media/screenshot-month-v2.png alt="A month of appointments, one dragged to a new day" zoom}

::image{src=media/screenshot-timeline-selected.png alt="The same month as a timeline: one row per event, a bar from its start to its end, and the 9th selected in the header" zoom}

## Why this one

A view of appointments, tasks or bookings is a list of dates, and a list of
dates is the one shape a grid cannot show: which days are full, which are
empty, and what sits next to what. The built-in subgrid shows the rows; this
control shows the *month*.

Three things it does that a subgrid does not:

- **Fetches the month, not the page.** The visible range goes to the server
  as a filter — start on or before the last day shown, end on or after the
  first, or no end at all — so a calendar of ten thousand appointments loads
  the thirty it needs. Step to another month and it asks again.
- **Places each event on the day its user means.** A Dataverse date is an
  instant whose day depends on the column's behaviour and the user's time
  zone. The control reads the column's *Behavior* from metadata and the
  user's zone from their settings, so a *User Local* dinner at 02:30 UTC
  lands on the evening before for someone at UTC−5, and a *Date Only*
  birthday lands on its day everywhere.
- **Writes the move back.** Dragging an event — or moving it by a day or a
  week from its menu, which is the keyboard route — writes the start column,
  and the end column shifted by the same days, through the record where the
  platform allows it and through the Web API otherwise. The event moves
  before the round trip finishes and returns if the write is refused.
- **Draws the hours** (from 0.3.0, with **Hour grid in Day and Week** on).
  Day and Week are drawn to scale against the hours, overlapping events side
  by side, whole-day ones in a row above. Drag an event to another time or
  day, drag its bottom edge to change its end, press a free slot to create
  one there with its start and end already set. It opens on the user's own
  working day.
- **Shows the length of things.** The timeline is one row per event with
  the days of the month across and a bar from start to end — the view for a
  month of projects, bookings or campaigns, where *how long* matters as much
  as *when*. Drag an end of a bar and only that column is written.

## What it works with

:::callout{type=info}
**Model-driven forms and views** are the host it was built for: the month is
fetched server-side, events can be moved and created, and each date column's
behaviour is read from metadata.

**Canvas apps and custom pages** get a calendar of whatever the view loaded,
placed by the shape of each value. The date operators the range filter uses
are model-driven only, there is no metadata to read, and no form to open — see
[Canvas apps](canvas.md).
:::

## What it is not

Not a scheduler. The hour grid draws a team's appointments against the clock,
but there are no resource lanes, no availability and no conflict checking:
two events at once are drawn side by side, and nothing stops a third. Nor is
it a Gantt chart: the timeline draws no dependencies and no critical path.
