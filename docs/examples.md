---
title: Examples
description: Worked configurations of Calendar View.
order: 6
---

# Examples

## A team's appointments on a form

The default shape: a subgrid of appointments on an account form, as a month.

| Property | Value |
| --- | --- |
| Start | `scheduledstart` |
| End | `scheduledend` |
| Title | `subject` |
| Colour | `prioritycode` |
| Default view | Month |
| Week starts on | Auto |
| Allow move | On |
| Allow create | On |

Both date columns are *Date and Time*, User Local, so each event shows its
start time and sits on the day it falls for whoever is looking. Dragging one
moves both columns by the same number of days; the **+** opens the quick
create form with `scheduledstart` set to the day pressed, seeded from the
account.

## Due dates, as whole days

A view of tasks with a single *Date Only* column, on a dashboard.

| Property | Value |
| --- | --- |
| Start | `cr123_dueon` |
| End | *(unbound)* |
| Title | `cr123_name` |
| Colour | `cr123_status` |
| Show times | Off |
| Allow move | On |
| Allow create | Off |

A Date Only column places whole days on the same day everywhere, so nothing
here depends on a time zone. Moving a task writes the new day; with no End
bound there is nothing else to shift. **Show times** is off because a Date
Only column has none to show, and off it also hides the time on any *Date and
Time* column you later bind.

## A fixed period, read-only

A conference programme embedded on a custom page: nobody edits it from here.

| Property | Value |
| --- | --- |
| Start | `cr123_starts` |
| End | `cr123_ends` |
| Title | `cr123_session` |
| Default view | Week |
| Week starts on | Monday |
| Opens on | `2026-10-05` |
| Allow move | Off |
| Allow create | Off |
| Open on click | Off |

**Opens on** lands the reader on the conference week rather than today; they
can still step away from it. **Week starts on** is fixed to Monday so the
calendar agrees with the printed programme whatever the reader's personal
options say.

## Driving a gallery from the selected day

In a canvas app, bind the calendar to a filtered data source and read
`selectedDate` back:

```
Filter(
    Appointments,
    Text(ScheduledStart, "yyyy-mm-dd") = CalendarView1.selectedDate
)
```

The day number on each cell is a button; pressing it sets the output, and the
gallery beside the calendar narrows to that day.
