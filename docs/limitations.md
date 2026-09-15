---
title: Limitations
description: What Calendar View does not do.
order: 7
---

# Limitations

## No hour grid

A week is seven columns of events in time order, and a month is whole days.
Events are not drawn to scale against the hours of the day, do not overlap
visually, and cannot be dragged to a different *time* — only to a different
day, with their time of day kept. Use the **⋯** menu or drag for the day; open
the record for the time.

## The range filter is model-driven only

The visible range is fetched with the `On`/`OnOrAfter`/`OnOrBefore` date
operators, which the platform documents for model-driven apps and which were
measured working on a model-driven subgrid. Canvas apps are not asked: there
the calendar shows what the data source loaded, every month at once, with a
notice under the grid saying so. Bind a filtered data source there.

## A month bigger than a page needs Load more

The control never asks for more than the host's page size — or **Events per
fetch**, when set — in one go. A range with more rows shows *N loaded — there
are more in this range* and a **Load more** button, which appends the next
page without turning it. The platform caps a page at 250.

## Behaviour is read from metadata, and only where metadata can be read

Whether a stored value is a whole day or an instant is the column's
*Behavior*, read through `getEntityMetadata` on model-driven hosts. Where
that call is unavailable — canvas, or a user who cannot read the table's
metadata — a value at exactly UTC midnight is taken as a Date Only day and
anything else as an instant in the user's zone. A **User Local** column whose
value happens to fall on UTC midnight is misplaced by that rule; it is the one
ambiguity only metadata resolves.

## Times are in the Dataverse user's zone, and the write assumes the browser agrees

Events are placed by `userSettings.getTimeZoneOffsetMinutes()`, the zone in
the user's personal options. A move is written back as a `Date` whose local
components are the wall clock — the shape the platform's own date editors
hand over — which is correct when the browser's zone is the user's, the case
on every host this control has been measured on. A browser set to a different
zone than the user's Dataverse settings has not been measured.

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
still opens with the day set. Canvas apps and the hub's demo have no forms to
open, so the **+** is not shown there.

## The colour role needs a choice column with colours

Option colours come from the option set's metadata, so they exist only on
model-driven hosts and only for options Dataverse assigned a colour to. The
role is typed `OptionSet` and a text or lookup column will not appear in its
picker; in a canvas app the label shows as a badge and every event wears the
brand edge.

## Not a scheduler

There are no resource lanes, no availability, no recurrence and no conflict
detection. For a scheduling board, this is not the control.
