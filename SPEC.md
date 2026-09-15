# Calendar View

A Dataverse view as a month or week calendar, by a date column.

## Not verified — the 0.0.1 probe

Everything below the line rests on measurements other controls made. Four
things do not, and each names the feature it removes if the answer goes the
wrong way. The probe build (`0.0.1`, `CalendarView/probe.ts`, deleted before
the real build) logs passively from `updateView` and exposes
`window.__calendarViewProbe` for the active calls; the answers go here as
*Measured* before `0.1.0` is tagged.

| # | Question | If it goes the wrong way |
| --- | --- | --- |
| Q1 | Which string does `openForm(options, { [dateColumn]: value })` accept for a **date** column — the ISO day `2026-09-20`, the documented `MM/dd/yy`, or the user's short date? The docs say "the text value of the date" and show `01/31/11`. `probe.tryCreate(format)` tries each. | The **+** sends the format that worked; if none preselects the day, the **+** opens a bare quick create and `docs/model-driven.md` says so. |
| Q2 | Is a **nested `filters` array** honoured on a subgrid — `start ≤ last AND (end ≥ first OR end IS NULL)`? `probe.window(first, last)` sends it and reads `sortedRecordIds.length` back after ≥15 s. Compare with `probe.windowFlat(first, last)`, which sends `end ≥ first` without the `Null`. | The filter collapses to `first ≤ start ≤ last` on the start column alone — events spanning into the window from before it are missed, and `docs/limitations.md` says so. |
| Q3 | Does a window filter **narrow the view's own filter or replace it**? Bind the calendar to a view that excludes a known record and call `probe.window` over its date; count whether it appears. | If it replaces: the control cannot be bound to a filtered view honestly, and `docs/model-driven.md` says the view's filter is lost while a window is applied. |
| Q4 | Does `webAPI.updateRecord` accept `"yyyy-MM-dd"` for a **Date Only** column and an ISO instant for a **User Local** one, and read back as the day/instant written? `probe.moveViaApi(id, days)` forces the API route. | The API route sends whichever shape read back right; if neither, moves are record-route only and a refused `isEditable` becomes a refused move. |

Also on the walkthrough, though not a probe question: a move through the record
(`setValue` with a local-component `Date`, measured for a date cell by
`pcf-data-table` 0.4.0) read back a day later with the time of day kept, on
both a User Local and a Date Only column; the end column shifted with it; the
**+** on a form subgrid created a row that landed in the subgrid.

## Platform behaviour this control rests on

All measured elsewhere, all in the skill; this file points rather than repeats.

- **A date column's `getValue` is an ISO string** — a Date Only day at UTC
  midnight, a User Local instant — measured by `pcf-data-table` 2026-09-11.
- **`On` / `OnOrBefore` / `OnOrAfter` with `'yyyy-MM-dd'` work on a
  model-driven subgrid and compare by the user's calendar day**, not UTC
  (`pcf-data-table` 0.4.0). Model-driven only per the reference table; canvas
  is not asked and gets no window filter.
- **`getEntityMetadata`'s datetime node carries `Behavior` (1/2/3) and
  `Format`** (`pcf-date-range-picker`); **a choice's `Color` is on
  `attributeDescriptor.OptionSet[]` only** (`pcf-kanban-board`, 2026-09-14).
- **`getTimeZoneOffsetMinutes(date)` is the platform's sign and the bare call
  answers the standard offset** (`pcf-date-range-picker`). Every call here
  passes the date.
- **Two write routes chosen per record**, `openForm`'s second argument, a
  dismissed form resolving `{ savedEntityReference: null }` — `pcf-kanban-board`
  0.3.0 and `pcf-data-table` 0.4.0.

## What the build disagreed with

- **`-webkit-line-clamp` on a `<button>`.** Chrome lays a button's content out
  in an anonymous box where `-webkit-box` does not apply, so a two-line clamp
  read as "break anywhere" and split words in half. The week view clamps by
  `max-height` instead and loses the ellipsis.
- **A space inside a `white-space: nowrap` span is not a break opportunity.**
  `<span class="time">10:30 AM </span>Interview` rendered as one unbreakable
  token; the space has to sit *outside* the span, and a margin is not a space.
- **The suite's Fluent stub could not render `MenuItem`.** The template's
  stub returned each component's *name* as the element type; React lower-cases
  an unknown element, and `<menuitem>` is void in HTML, so
  `renderToStaticMarkup` threw. Fixed in the template: every capitalised export
  is now a stand-in component.

## Demo

`limited`, and the list in `pcfhub.json` is the whole reason: the harness has
one page, no filters, no metadata, no user settings, no forms and no
environment. What *does* work there is placement, navigation, the view switch,
and an optimistic move — enough to see what the control is. `initialDate`
exists partly so the demo can open on the fixture's month.

## Not verified — beyond the probe

- **A browser whose zone differs from the user's Dataverse zone.** Placement
  reads the user's zone; a move writes a `Date` built from *browser-local*
  components, which the platform's date editors also do. Correct where the two
  agree, which is every host measured so far. Needs a user whose personal
  options are set to a zone the machine is not in.
- **Canvas: whether the dataset hands over records with a write half**, and
  whether any date operator filters there. Neither has a test bed.
- **A Time Zone Independent column.** Placement reads the UTC components and
  the API route writes them as UTC; neither has been on a form.
- **`weekStart: auto` on a tenant whose `firstDayOfWeek` is not Sunday.**
  The rig models it; no real user settings have been read.
