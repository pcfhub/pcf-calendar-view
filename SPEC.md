# Calendar View

A Dataverse view as a month, week or timeline calendar, by a date column.

## 0.3.0 — an hour grid (probe 0.2.5 out, 4 October 2026)

Picked by the eighteenth demand run: downloads 3 → 17 in two days (the
largest move the hub has shown), and **No hour grid** is the first entry on
`docs/limitations.md`. A search for an hour-grid calendar returned that entry
beside three controls that have one (rwilson504's Scheduler, Chrona
Scheduler, LTAPPs Calendar). The plan: a **Day** view, and Week drawn against
the hours, behind a setting that is off by default so installed weeks do not
change; an all-day row for whole-day and multi-day events; overlapping events
side by side; drag to a time (snapped) and drag the bottom edge for the end;
**+** on a slot opens the quick create with a start and an end.

Everything 0.2.x measured was whole days. **Nothing of 0.3.0 is written until
these are answered**, and an answer the wrong way removes what rests on it.
The probe is `CalendarView/probe.ts` on `window.__pcfCalendarViewProbe`
(`.version` is `0.2.5-probe` — check it before trusting an answer); the
active calls print MATCH or MISMATCH against what the control expects.

| | Question | Right way | If it goes the wrong way | Measured |
| --- | --- | --- | --- | --- |
| H1 | `timeViaRecord(id, "14:45", 45)`: `setValue` on start *and* end with a time and minutes, one `save()`, from a browser an hour from the user | Both MATCH: stored as 14:45 / 15:30 in the **user's** zone | Drag-to-time goes through the Web API only, and the record route stays whole-day | **MATCH, both** (4 Oct). `isEditable(start)` true; handed `14:45`/`15:30` local in a UTC−6 browser (`20:45Z`), stored `19:45Z`/`20:30Z` — 14:45/15:30 in the user's UTC−5. Minutes kept; one `save()` resolved `{ etn, id }`. |
| H2 | `timeViaApi(id, "09:15", 90)`: the same through `updateRecord`, spelled by `valueForApi` | Both MATCH | The Web API route refuses times; drag-to-time needs the record route | **MATCH, both** (4 Oct). Body `14:15:00.000Z`/`15:45:00.000Z` (the user's offset subtracted), read back exactly. |
| H3a | `createAt("2026-10-08", "14:30", 60, "user")`: the quick create with a start **and** an end, in the user's own date and time patterns | Start 2:30 PM, End 3:30 PM; saved row MATCH | **+** on a slot sets the start only, and the end is the user's to type | **Both set** (4 Oct). `10/8/2026 2:30 PM` and `3:30 PM`: the quick create showed Starts 10/8/2026 2:30 PM, Ends 3:30 PM; saved row MATCH (`19:30Z`/`20:30Z`). A second date parameter in one call works. |
| H3b | The same with `"h24"` and `"isoLocal"` | Recorded either way: which spellings parse, for a user whose time pattern is `HH:mm` | Whatever parses is what is sent; an unparsed one means a 24-hour user gets the day only | **All three parse, all MATCH** (4 Oct): `10/8/2026 14:30` and `2026-10-08T14:30:00` both opened on 2:30 PM / 3:30 PM and saved `19:30Z`/`20:30Z`. **The zone-less ISO date-time is read as the *user's* wall clock**, not the browser's (that would have stored `20:30Z` and shown 3:30) — unlike the bare ISO *day*, which 0.0.2 measured landing a day early. So a slot sends `yyyy-MM-ddTHH:mm:00`: no pattern to follow, and the unmeasured `dd/MM/yyyy` question does not arise for times. |
| H4 | Passive: the time half of `dateFormattingInfo` on a dataset control | `shortTimePattern`, `amDesignator`, `pmDesignator`, `timeSeparator` present | The hour labels fall back to `h:mm tt` | **Present** (4 Oct), every key under both spellings as on a field: `shortTimePattern` `h:mm tt`, `longTimePattern` `h:mm:ss tt`, `timeSeparator` `:`, `amDesignator`/`pmDesignator` `AM`/`PM`; `formatTime` renders 2:30 PM and 9:05 AM. |
| H5 | Passive (and `workHours()`): `usersettings` through `webAPI` — `workdaystarttime`, `workdaystoptime` | One row, readable by an ordinary user | The grid opens on a fixed hour (a maker property), not the user's working day | **One row in 163–254 ms** (4 Oct, as System Administrator): `workdaystarttime` `"08:00"`, `workdaystoptime` `"17:00"` (strings), `timeformatstring` `h:mm tt`, `timezonecode` 20, `timezonebias` 360. The grid opens on the user's working day; 08:00–17:00 where the row cannot be read (canvas, a refusal). An ordinary user's read is not verified. |
| H6 | Passive: the user's offset on eight dates across 2026 | Recorded: whether the user's zone has DST, so a transition day can be placed | — | **It has** (4 Oct). User −360 on Jan 15 and Mar 7, −300 from Mar 9 to Oct 26, −360 again by Nov 2 — US Central (code 20); the bare call −360. The browser is −360 all year. **The test form's "user an hour from the browser" is summer only** — from November the two agree, and the zone-gap cases stop being exercised there. The control's offset cache is keyed by UTC *day*, which misreads up to five hours around a transition: harmless on a month, an hour out on an hour grid — 0.3.0 keys it by UTC hour. |
| H7 | Passive: `allocatedHeight` on the subgrid, at install and +5 s | Recorded: -1 means the control decides its own height and scrolls the hours inside | — | **−1 throughout** (4 Oct); width −1 at install, 1028 by +5 s. The subgrid allocates no height, so the hour grid is a box of its own height that scrolls the day inside, opened at the working day. |

After each write: `restore(id)` puts the record back as it was before the
probe touched it.

**Every answer went the right way and nothing is cut.** One more thing the
first records showed (P1): *Birthday* ends at `04:30Z` and starts at
`05:00Z` — an end before its start, saved by hand on the form. The month
view never minded; an hour grid would draw it with a negative height, so an
end before the start is drawn as the start alone.

## 0.2.4 — a move keeps what Load more brought in

`pcf-kanban-board` found it on a form (2026-09-29, its 0.4.1): a dataset
`refresh()` starts the view again at its first page. `adjustEvent` ended with
one in `finally`, so moving or resizing an event after **Load more** took every
event past the first page off the calendar. Now there is no refresh after a
write: the override shows the move, a refused one is put back by the component
from the outcome `adjustEvent` resolves (the overlay adds shifts, so the
opposite one), and a move never sent (an end before its start) is put back the
same way — through 0.2.3 its placement stayed until the events changed. The
range and create refreshes stay; both must fetch.

The rig was moved onto the template's host first (`62bcae6`); against its
page-one refresh, restoring the old refresh fails "9 loaded, then 5". In the
harness, with `record.save()` refusing, an event moved a day later twice went
back each time with the sentence and no busy mark.

| | Look at | Right way | Measured |
| --- | --- | --- | --- |
| W1 | **Events per fetch** below the month's events, **Load more** until all are shown, drag an event from the last page to another day | Lands; every event stays on the calendar || **Passed** 2026-09-29 |
| W2 | The same on the timeline, dragging a bar's edge | Resizes; every bar stays || **Passed** 2026-09-29 |
| W3 | A month with fewer events than a page, a move | As before 0.2.4 || **Passed** 2026-09-29 |
| W4 | **+** on a day, save | The event appears; the range starts again at its first page (documented) || **Passed** 2026-09-29 |

## Measured — the 0.2.0 timeline walkthrough, 17 September 2026

On the Accounts form's `cll_event` subgrid, the 0.2.0 build imported over
0.1.4, the form ~2,000px wide. Six questions, six answers the right way; one
of them earned a change before the tag.

| # | Question | Measured |
| --- | --- | --- |
| W1 | Drag a bar's **right edge** two days later. Does `cll_ends` change by two days with `cll_starts` untouched, and does the bar hold its length through the refresh? | **Yes.** The one-column write through `setValue` + `save` lands, and the override held across the unasked `updateView` a real `save()` fires — the both-days reconcile rule, now measured against the platform and not only the rig. |
| W2 | Drag a bar sideways. Does the pointer stay with the bar, and does the form neither pan nor select? | **Yes** — the drag stays inside the day columns and the form is untouched. Pointer capture works under the platform's event handling. |
| W3 | Does the month scroll sideways inside the control, and does the section keep its width? | **Yes.** The section stays the same width through the ‹ › arrows; the grid scrolls inside `.CalendarView-timeline`. |
| W4 | On a narrow section, 112px labels and 28px days, badge gone? | **Yes** — 112 and 28 on a small screen. |
| W5 | Press **+ New** with a day selected in the header. | **The form opened on the pressed day — and nothing on the calendar showed a day had been pressed.** The selection was real (the quick create's Starts said so) and invisible. Fixed before the tag: the pressed day wears a brand ring on its number and its column a neutral tint in the timeline; the month and week views' day number takes the same ring, which they had never had either. `aria-pressed` on every day button. |
| W6 | Resize the **end** of an event with no `cll_ends`. | **Yes** — it gets an end the right number of days after its start. |

Four things the harness — and the first look on the form — settled on 17
September:

- **A bar's text is decided by pixels, not by its day count.** The first
  rule drew text only on a bar spanning two or more days, and on the test
  form — 2,000px wide, 58px a day — every one-day bar was blank while the
  month view beside it said "6:00 PM Meeting 4". The day width is measured
  by a ResizeObserver on the grid now: title from 48px, time as well from
  120px, a bare chip below that (a phone at 28px a day).

- **A handle with its own `pointerup` committed one resize twice.** The
  handle's release ran `finish`, and the event bubbled to the bar, whose
  handler's closure still held the drag. Handles take only the press now.
- **`min-width: max-content` on the grid sized every 1fr day track to the
  longest bar title** — a month 6,414px wide. The 36px track minimum alone is
  what overflows a narrow control into the sideways scroll.
- **The month view's narrow rules hid the timeline's labels**, because the
  label column reuses `.CalendarView-eventTitle`; a phone frame showed
  thirteen empty rows. The rules are scoped to the chip now.

## Measured — the 0.0.1 / 0.0.2 probes, 16 September 2026

On the Accounts form (`cll365`), a `cll_event` subgrid: page size 4, twelve
rows, User Local `cll_starts`/`cll_ends`, a `cll_dueon` that turned out to be
**User Local with a Date Only format**, a coloured `cll_kind` choice. The
user's zone was UTC−5 (DST); **the browser's was UTC−6** — an hour apart,
which is the state this control had listed as unmeasurable.

### The four questions, and what each settled

| # | Question | Measured |
| --- | --- | --- |
| Q1 | Which spelling does a **date** form parameter accept on the quick create? | **Not the ISO day.** `2026-09-20` was parsed as UTC midnight and the form opened on *9/19 6:00 PM*. `09/20/26`, `09/20/2026` and `09/20/2026 12:00 PM` all landed on the 20th. The control sends the user's own `shortDatePattern` (`9/20/2026` here). |
| Q2 | Is a nested `filters[]` honoured on a subgrid? | **Yes.** `start ≤ 19 Sep AND (end ≥ 13 Sep OR end IS NULL)` returned 6 of 12 and included an event starting 31 Aug that spans in; the flat window on the start column returned 5 and dropped it. `Null` (12) is honoured inside the nested `Or`. |
| Q3 | Does the window narrow or replace the view's own filter? | **Narrows.** The same window on a *Kind ≠ Meeting* view returned 4, not 6. The two filters AND, so a filtered view is an honest binding. |
| Q4 | What does `webAPI.updateRecord` take for a date? | **An ISO instant for User Local** read back exactly +1 day (`10/4/2026 12:00 AM`). **A bare `yyyy-MM-dd` into a User Local column formatted as Date Only stored UTC midnight and displayed the previous day** (`2026-10-04` → *10/3/2026*). Only a column whose metadata says `Behavior: 2` gets the bare day; every other whole day goes as an instant at the user's noon. A true Date Only behaviour was not on the table and is under *Not verified*. |

### The zone gap, closed

`moveViaRecord` handed `setValue` a `Date` built from **browser-local**
components — *Mon Oct 05 2026 00:00 GMT−0600*, i.e. `06:00Z` — and the
platform stored `05:00Z`, shown as **10/5/2026 12:00 AM**. The record route
reads a `Date`'s local components as the **user's** wall clock, whatever
zone the browser is in. That is the field-control finding from
`pcf-date-range-picker`, now measured on a dataset record from a browser an
hour away from its user. `dateForWrite` is right as written.

### Passive, before any question

- The write half is on a dataset record (`setValue`, `save`, `isEditable`);
  `isEditable("cll_starts")` answered `true`, and `save()` resolved
  `{ etn, id: { guid } }`.
- `getValue` on a date column is the ISO instant (`2026-10-03T05:00:00.000Z`
  shown as *10/3/2026 12:00 AM*).
- `getTimeZoneOffsetMinutes(new Date())` answered `-300`; the bare call
  `-360` — the range picker's quirk, on a second tenant.
- The datetime metadata node: `Behavior: 1`, `Format: "dateandtime"`,
  `AttributeType: 2`, `AttributeTypeName: "datetime"` (lower-case; the rig
  said `DateTimeType` and is corrected). Its own keys are all private with
  the public names as getters; the `attributeDescriptor` underneath spells
  the format `"datetime"`, not `"dateandtime"`.
- `Color` on `attributeDescriptor.OptionSet[]` — `#1a8bed`, `#bfed18`,
  `#ea1cfc`. The first record carried `cll_kind = "4"`, a value the
  descriptor did not list; the control drew it with the brand edge and the
  label as a badge, the designed fallback.
- `contextInfo` is the parent account, unbraced; `filtering`, `openForm`,
  `webAPI`, `utils` all present; `hasNextPage` true at page size 4.
- **`context.parameters.records` is a new object on every pass**, and the
  0.0.1 probe read counts off the first one — every Q2 answer it printed was
  the first pass's. The `pcf-data-table` 0.5.0 finding, walked into again
  by the thing written to avoid it. 0.0.2 read through a getter.

## Platform behaviour this control rests on

All measured elsewhere, all in the skill; this file points rather than repeats.

- **`On` / `OnOrBefore` / `OnOrAfter` with `'yyyy-MM-dd'` compare by the
  user's calendar day** (`pcf-data-table` 0.4.0). Model-driven only per the
  reference table; canvas gets no window filter.
- **`getEntityMetadata`'s datetime node carries `Behavior` and `Format`**
  (`pcf-date-range-picker`); **a choice's `Color` is on
  `attributeDescriptor.OptionSet[]` only** (`pcf-kanban-board`).
- **Two write routes chosen per record**, `openForm`'s second argument, a
  dismissed form resolving `{ savedEntityReference: null }` —
  `pcf-kanban-board` 0.3.0 and `pcf-data-table` 0.4.0. Both seen again here.

### Two console lines from the walkthrough, 16 September

- **`FormSignalUtils … reading 'entityTypeName'`, uncaught, after the +'s
  quick create closes.** Read off the platform script: it is
  `registerFormInitCortexHandler`'s post-navigation callback looking up the
  quick create *page's* entity reference from app state after the page has
  gone (`(0,n.j)(state, pageId)` → `undefined`). Microsoft's Copilot
  form-signal telemetry, registered on every form init; nothing in
  `openForm`'s options reaches it and the control's `.catch` cannot, since
  it is the platform's own promise. Documented in the FAQ; not ours.
- **`UserDateTimeUtils_getConstraintByYear_InvalidDate`, once per event per
  render**, from `getTimeZoneOffsetMinutes(date)`. The platform's DST lookup
  logs it for a date in a year the user's zone has no rule on file for, and
  still answers (`-300`). The offset is memoised per UTC day on the instance
  now — one call per day that carries an event, once — and the suite counts
  the rig's calls across three renders.

### 0.1.3 collapsed the calendar on every form, and 0.1.4 is why

`container-type: inline-size` on the root, added so the phone layout could key
off the control's own width. **Size containment makes the element's intrinsic
inline size zero**, and a form section hands the control a shrink-to-fit
parent — the root is *capped* by `allocatedWidth` through `max-width`, not
sized by it — so the parent shrank to nothing and the month rendered as a
one-column sliver. The hub's phone frame has a definite width, which is why
the demo looked right. Measured 2026-09-16 on the Accounts form. The narrow
layout is a class set from a `ResizeObserver` on the root now: it measures
the width the control got and contains nothing; the viewport media query
stays for a host without the observer. **Never put size containment on a
control's root** — the parent may be sizing itself from you.

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

`mocked` since 2026-09-28; `limited` before that. The harness had no column
metadata, no organisation URL for the **+**, and no environment to write to.

pcfhub/pcfhub#52 let a fixture describe its columns. `demo/records.json` now
carries a stand-in Dataverse:

- `cr123_starton` and `cr123_endon` are User Local;
- `cr123_kind` holds integers, with four options, each with a colour.

It was checked with 0.2.3's published bundle against that harness, before the
push, in a browser at UTC−6:

- every event was placed as an instant in the user's zone (Sprint planning,
  14:00Z, at 8:00 AM), each edge in its option's colour;
- each day carried "Add an event on …", asking `openForm` for
  `cr123_appointment`'s quick create form;
- *A day later* from Sprint planning's menu went through `record.save` and a
  refresh, and the event stayed on 2 September after a property change;
- *End a day later* on the timeline's Offsite saved the same way, and the bar
  spanned four days after a property change.

**What still stands in for the platform:** the user's zone is the browser's,
because there is no Dataverse user, and `initialDate` opens the fixture's
month.

**Release 2.4 lost its whole day.** It sat at UTC midnight, which the
no-metadata fallback reads as a Date Only day. With the columns declared User
Local it would have been an instant on the evening before, west of Greenwich.
So it now has a time (15:00Z), and no event in the demo is a whole day. A
second, Date Only column pair would show one. The fixture binds one pair.

Since pcfhub/pcfhub#51 the harness also applies the window filter and pages.
It was checked with 0.2.3's published bundle against that harness:

- Next from September gave October's grid holding the two events on 29 and
  30 September, after `paging.reset` and `refresh`;
- Previous twice gave August's grid with the two events on 1 and 3 September;
- September again showed all 13;
- at five events per fetch, "5 loaded — there are more in this range" and
  Load more went 5, 10, 13.

## Not verified

- **The timeline on the phone client.** W2 was answered on the web client;
  a finger on a bar (`touch-action: none`) has not been tried.

- **A true Date Only *behaviour* column** (`Behavior: 2`). Placement reads
  its UTC components and the API route sends a bare day, both from the
  reference; `cll_dueon` looked like one and was User Local underneath, so
  neither has been on a form. Change `cll_dueon`'s behaviour (it is permanent
  once set — create a second column) and rebind Start to it.
- **A quick create for a `dd/MM/yyyy` user.** The form parameter is sent in
  the user's own `shortDatePattern`; only `M/d/yyyy` has been seen to parse.
- **Canvas**: whether the dataset hands over records with a write half, and
  whether any date operator filters there. Neither has a test bed.
- **A Time Zone Independent column.** Placement reads the UTC components and
  the API route writes them as UTC; neither has been on a form.
- **`weekStart: auto` on a tenant whose `firstDayOfWeek` is not Sunday.** The
  rig models it; this tenant answers `0`.

## Promoting a finding

The zone-gap measurement, the form-parameter spelling, the nested filter and
the User-Local-as-Date-Only trap are in the skill's *A date read through a
dataset*; this file keeps the numbers and the dates. The rig's
host-that-changes-an-input (`handle.setInput`, and the harness page's inputs
box driving the mounted control) is in the template and the skill's rig rules
(0.40.0); the timeline's pointer-capture drag is in *The timeline, and a drag with
nothing to drop on* there (0.40.1 marks it measured).

## Screenshots

Headless Chrome against `dev/preview.html` on the harness server, at
`--force-device-scale-factor=2`, `--virtual-time-budget=4000`,
`--hide-scrollbars`, with `?fixture=demo&date=2026-09-14&zone=-300&width=760`
and `&view=month|week|timeline`; window `792×540`, `792×300` and `792×560`.
The narrow check is the same page at `width=373` in a `405×420` window. The
timeline shot adds `&select=2026-09-09`, which presses that day after mount
so the selection ring and column are in the picture. New
file names on every retake — the hub's mirror never re-fetches a path.
