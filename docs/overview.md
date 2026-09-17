---
title: Overview
description: What Calendar View does, and when to reach for it.
order: 1
---

# Calendar View

A Dataverse view as a month, a week or a timeline, by a date column. Drag an
event to another day to reschedule it; on the timeline, drag an end of its bar
to change how long it runs; press **+** to create one.

::image{src=media/screenshot-month-v2.png alt="A month of appointments, one dragged to a new day" zoom}

::image{src=media/screenshot-timeline.png alt="The same month as a timeline: one row per event, a bar from its start to its end" zoom}

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

Not a scheduler. There is no hour grid, no resource lane and no overlap
resolution: a week is seven columns of events in time order, a month is whole
days, and the timeline's bars are whole days too. If you need appointments
drawn to scale against the hours of a day, this is not that control. Nor is
it a Gantt chart: the timeline draws no dependencies and no critical path.
