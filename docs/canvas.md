---
title: Canvas apps
description: Adding Calendar View to a canvas app or custom page.
order: 3
---

# Canvas apps

:::callout{type=warning}
**Expect a calendar of what the view loaded, placed by the shape of each
value.** Three things this control leans on are model-driven only: the date
operators the range filter uses (`On`, `OnOrAfter`, `OnOrBefore`), the
metadata call that reads a column's behaviour, and the quick create form the
**+** opens. In a canvas app the calendar shows the records the data source
handed it — every month at once, with a notice saying so — reads a value at
UTC midnight as a whole day and anything else as an instant in the browser's
zone, and hides the **+**.

Moving is offered where the host hands the control records it can save.
Whether a canvas app ever does is unverified; if the drag handles and the
**⋯** menu are absent, it did not.
:::

Use the calendar in a canvas app to *show* a small, bounded set of dated
records — a team's appointments this quarter, a booking sheet. Bind it to a
filtered data source so the set is small: the control cannot narrow it
server-side there, and a month view of ten thousand rows is ten thousand rows.

## Adding it

:::steps
1. In the app, select **Insert** → **Get more components** → **Code** and add
   **Calendar View**.
2. Insert it onto the screen and set **Records** to a Dataverse data source,
   filtered as tightly as the screen allows.
3. Bind **Start** and **Title**; **End** and **Colour** are optional.
:::

## Reading a day back

The `selectedDate` output carries the day the user last clicked — the day
number is a button — as `yyyy-MM-dd`. Bind a gallery's `Items` to a filter on
it and the calendar becomes the picker for the list beside it:

```
Filter(Appointments, Text(ScheduledStart, "yyyy-mm-dd") = CalendarView1.selectedDate)
```

`openedRecordId` updates when an event is clicked, whether or not the host
opened anything, so a canvas app can navigate to a detail screen from it.
