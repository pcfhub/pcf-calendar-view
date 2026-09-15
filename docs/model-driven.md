---
title: Model-driven apps
description: Adding Calendar View to a form or a view.
order: 4
---

# Model-driven apps

This is the host the control was built for: the month is fetched from the
server, events can be moved and created, and each date column's behaviour is
read rather than guessed.

:::steps
1. Open the form in the form designer and add a **subgrid** for the table you
   want to show, choosing the view whose records should become events — or
   open the table's **Controls** to put the calendar on its main grid.
2. With the subgrid selected, open **Components** → **Get more components** and
   add **Calendar View**, then switch the control to it for Web, Tablet and
   Phone.
3. Bind the column roles under the control's properties. **Start** and
   **Title** are required; **End** and **Colour** are optional.
4. Save and publish.
:::

## Binding the column roles

The roles are the control's own names for the parts of an event. Each one is
bound to a column in *your* table — the control never assumes a schema name.

| Role | Bind it to | Required |
| --- | --- | --- |
| Start | The date column an event starts on. Date Only or Date and Time. | Yes |
| Title | The text column shown on the event. | Yes |
| End | The date column an event ends on, so it spans its days. | No |
| Colour | A **choice** column whose option colours colour the events. | No |

:::callout{type=warning}
**Every column bound to a role must be in the view.** The roles are read
through the dataset, so a role bound to a column the view does not select
arrives empty — and an empty Start is no calendar at all.
:::

## How a date is placed

A Dataverse date column has a *format* — Date Only or Date and Time, which the
picker restricts binding by — and a *behaviour*, which the picker cannot see
and which decides what the stored value means:

| Behaviour | The value is | Placed |
| --- | --- | --- |
| **User Local** | a true instant | on the day it falls in the **user's** time zone, at that time |
| **Date Only** | a day | on that day, everywhere, as a whole-day event |
| **Time Zone Independent** | a wall clock | on that day at that time, everywhere |

The control reads the behaviour through `getEntityMetadata` once per view,
and the user's zone through `userSettings.getTimeZoneOffsetMinutes()` — the
zone set in their personal options, which is what the rest of the form uses.
That is why a **User Local** column formatted as *Date Only* can put the same
record on different days for users in different zones: it is an instant at
midnight in whoever entered it, and the platform's own guidance is to avoid
that pairing.

## Moving an event

Drag an event to another day, or open its **⋯** menu and choose *A day
earlier*, *A day later*, *A week earlier* or *A week later* — the same write,
and the route for anyone without a mouse. The time of day is kept; a bound End
column moves by the same number of days, so the duration holds.

The write goes through the record — `setValue` and `save` — where the platform
reports the Start column as editable for that record, and through
`webAPI.updateRecord` where it does not. Either way the event moves before the
round trip finishes, and returns to its day with a message above the calendar
if the write is refused. Turn **Allow move** off for a calendar that should
never write.

## Creating an event

Each day carries a **+** (on hover, or always on a touch screen) that opens
the table's **quick create form** with the Start column already set to that
day, passed as a form parameter. On a form subgrid the new record is also
seeded from the parent, so it lands in the subgrid you created it from. The
`createdRecordId` output carries the new row's id once the form saves, and the
calendar refreshes to show it.

The table needs a quick create form; without one the platform opens the main
form instead. Turn **Allow create** off to hide the **+** entirely.

## Which rows are fetched

The visible range — the whole weeks a month view shows, or the seven days of a
week — is sent to the dataset as a filter: *Start* on or before the last day,
and either *End* on or after the first day or *End* empty. Stepping months
re-filters and refreshes, so the view's own filter still applies and only the
rows in range load.

A range with more rows than the page size shows *N loaded — there are more in
this range* with a **Load more** button. Leave **Events per fetch** empty to
use the subgrid's own page size, or set it to fetch a whole month at once.

## Colour

Bind **Colour** to a choice column and each event takes the colour Dataverse
assigned its option — as a bar on the leading edge, never a background, so an
arbitrary colour cannot make the title unreadable. In the week view the
option's label is also shown as a badge. Options with no colour, and choice
values the option set does not carry, show the brand edge and the label.
