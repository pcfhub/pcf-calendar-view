---
title: Limitations
description: What Calendar View does not do.
order: 7
---

# Limitations

## No hour grid

A week is seven columns of events in time order, a month is whole days, and
the timeline's bars are whole days. Events are not drawn to scale against the
hours of the day, do not overlap visually, and cannot be dragged to a
different *time* — only to a different day, with their time of day kept; a
bar's edge moves its end by whole days too. Use the **⋯** menu or drag for
the day; open the record for the time.

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
