# Calendar View

A Dataverse view as a month or week calendar, by a date column.

[![Build](https://github.com/pcfhub/pcf-calendar-view/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-calendar-view/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-calendar-view/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-calendar-view/actions/workflows/release.yml)

Documentation lives on [PCFHub](https://pcfhub.dev/components/pcf-calendar-view), built
from the `docs/` directory in this repository. Edit the Markdown here; the hub
recompiles it.

<!--
  This README is for someone standing in the repository — a maintainer, or
  somebody deciding whether to install the control. The hub publishes `docs/`,
  not this file, so do not duplicate the documentation here.

  The three sections below are the ones worth writing by hand. Everything after
  them is the same in every repository and needs no edits.

  **Each carries a placeholder, and `npm run check` fails while one remains.**
  That is deliberate: an unwritten README is the first thing a visitor to the
  repository sees, and the version of this file that shipped before had worked
  examples sitting in it that read as real content. One of them — a bound
  `value` property — was wrong for every control that is not a field control,
  and reached a published repository.

  Delete these comments once the sections are written. They are instructions to
  you, and they are noise on a public page.
-->

## What it does

Binds a Dataverse view and lays its records out as a month or a week, by a date
column. Dragging an event to another day writes the new date back to the record;
pressing **+** on a day opens the quick create form with that day filled in. The
subgrid this replaces can show the same rows, but it cannot show *which days*
they fall on, and a list of dates is the one shape a grid does not have.

Three decisions a reader would otherwise question.

**The visible range is a server-side filter, not a slice of the page.** A view of
appointments holds every appointment there is; a month wants thirty. So the
component tells the control what it is showing, and the control sends that
window to the dataset as a filter — *start ≤ last day AND (end ≥ first day OR
end is empty)*, the `Or` nested as a child filter — resets the page and
refreshes. Stepping months re-filters. The date operators involved are
model-driven only, so a canvas app gets whatever the data source loaded, with a
notice saying so.

**A date is placed by the column's behaviour and the user's zone, not the
browser's.** A Dataverse date arrives as an ISO string whose meaning depends on
the column's *Behavior*: a Date Only column keeps its day in the UTC components,
a User Local column is a true instant whose day is the one in the Dataverse
user's zone. The control reads the behaviour through `getEntityMetadata` and the
zone through `userSettings.getTimeZoneOffsetMinutes(date)`, and turns every
value into wall-clock components once, at the boundary. The dev rig has a user
zone that can differ from the machine's for exactly this — a control reading
the browser's zone passes on the machine it was written on and fails for the
first user east of it.

**The write is optimistic, and it rolls back.** A move goes through the record
where the platform reports the start column editable and through
`webAPI.updateRecord` otherwise — never half and half, because the end column
moves with the start. The event lands before the round trip finishes, the
control retires its override once refreshed data agrees, and puts the event
back with a message if the write is refused.

Every event also carries a **⋯** menu with *a day earlier / later* and *a week
earlier / later*. HTML5 drag-and-drop has no keyboard equivalent, so a calendar
that only supported dragging could not be operated without a mouse.

## Properties

Bind the dataset to a view, then bind the column roles. **Start** and **Title**
are required; every column bound to a role must be in the view.

| Role | `property-set` | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| Start | `startField` | DateAndTime.DateOnly | DateAndTime.DateAndTime | **yes** | When the event starts, and the column a move writes. |
| End | `endField` | DateAndTime.DateOnly | DateAndTime.DateAndTime | no | When it ends, so it spans its days. Shifted with the start. |
| Title | `titleField` | SingleLine.Text | **yes** | The event's text. |
| Colour | `colorField` | OptionSet | no | A choice column whose option colours colour the events; its label is a badge in the week view. |

| Property | Type | Usage | Default | What it controls |
| --- | --- | --- | --- | --- |
| `defaultView` | Enum `month` | `week` | input | `month` | The view the calendar opens in. |
| `weekStart` | Enum `auto` | `sunday` | `monday` | input | `auto` | The first day of the week; `auto` follows the user's personal options. |
| `initialDate` | SingleLine.Text | input | *(empty — today)* | A `yyyy-MM-dd` to open on. |
| `allowMove` | TwoOptions | input | on | Whether events can be dragged or moved from their menu. |
| `allowCreate` | TwoOptions | input | on | Whether each day offers a **+** (model-driven only). |
| `openOnEventClick` | TwoOptions | input | on | Whether clicking an event opens its record. |
| `showTimes` | TwoOptions | input | on | Whether a timed event shows its start time. |
| `pageSize` | Whole.None | input | *(empty — the host's own)* | Events per fetch; a range with more shows *Load more*. |
| `selectedDate` | SingleLine.Text | output | | The day last clicked or moved to, as `yyyy-MM-dd`. |
| `movedRecordId` | SingleLine.Text | output | | The event last moved. |
| `openedRecordId` | SingleLine.Text | output | | The event last opened. |
| `createdRecordId` | SingleLine.Text | output | | The row the quick create form last saved. |

React and Fluent come from the platform (`react_virtual`). Strings ship in
English, Spanish, French, German and Japanese. Two features are declared, both
`required="false"`: **WebAPI** for the second write route and **Utility** for
`getEntityMetadata`; a host without either loads the calendar and does less.

## On the hub

`demo.fidelity` is `limited`. The harness supplies one page, discards filters,
has no metadata, no user settings, no forms and no environment to write to — so
in the demo the calendar shows every fixture record at once, places them by the
shape of their values in the browser's zone, moves them optimistically without
writing, and hides the **+**. The presets set `initialDate` because the fixture
cannot follow the clock. Every one of those is listed in `demo.limitations`.

## Install

Download the managed solution from the
[latest release](https://github.com/pcfhub/pcf-calendar-view/releases/latest), or from
the component's page on the hub, and import it into your environment.

## Develop

```bash
npm install
npm start          # the PCF test harness
npm run build
npm run lint
npm run check      # what CI runs first: placeholders, pcfhub.json, control shape
npm run smoke      # assertions against the built bundle — see dev/
npm run harness    # serves dev/harness.html and opens it
```

`npm start` renders the control; `dev/` is for the states it cannot reach. Build
first, then `npm run smoke` for the assertions, or `npm run harness` for the
switches — field-level security, a failed business rule, a host that publishes
no theme or no column metadata, and for a dataset control, more than one page.
Both read the bundle `npm run build` wrote, and both are described in the header
of `dev/smoke.js`.

`npm run harness` serves the repository over `http://` rather than leaving you to
open the file: over `file://` a dataset fixture cannot be fetched and a module
script is refused, and both arrive as an empty control with a CORS error. It
takes `--port` and `--no-open`, and needs no dependency — `dev/serve.js` is
`node:http`. A React (virtual) control gets one too: `dev/fluent-stub.js` stands
in for the Fluent the platform would supply, and its header says exactly where
the stand-in is less capable than the real thing.

Run `npm run refreshTypes` after every manifest edit — until you do,
`context.parameters` is typed from the old manifest and `tsc` will accept code that
cannot work.

To pack the solution locally you need msbuild — either Visual Studio or the
Visual Studio Build Tools:

```bash
cd Solution
msbuild /t:build /restore /p:configuration=Release
```

Both zips land in `Solution/bin/Release`. This is the only local step that compiles
in **production** mode, so a green `npm run build` is not evidence the shipping
bundle compiles — and the pack is incremental, so delete `obj/`, `out/`,
`Solution/obj/` and `Solution/bin/` first if you intend to quote a bundle size from
it.

## Release

1. Bump the version in **three** places, in one commit — they are checked
   against each other in CI:
   - `CalendarView/ControlManifest.Input.xml` → `<control version="…">`
   - `Solution/src/Other/Solution.xml` → `<Version>`
   - `package.json` → `"version"`
2. Write the release notes — what changed for the user, what was fixed, what
   they must do — in a Markdown file.
3. Tag with them: `git tag -a --cleanup=verbatim v1.2.3 -F notes.md && git push origin v1.2.3` — without `--cleanup=verbatim`, git drops every `## Heading` in the notes as a comment, silently

**The tag message is the release body, and the release body is the changelog
on the hub.** A lightweight tag gets GitHub's generated notes instead, which
for a repository without pull requests is a single compare link — and the
workflow warns when that is about to happen.

The release workflow builds, packs both solution types, and attaches them to a
GitHub Release. PCFHub picks the release up from its webhook within seconds, or
from the hourly sweep otherwise. A sync imports a draft; a person publishes it.

## Repository layout

| Path | What it is |
| --- | --- |
| `CalendarView/` | The control: manifest, entry point, CSS, localised strings |
| `Solution/` | The Dataverse solution that packages it |
| `dev/` | A stand-in host: `npm run smoke` asserts, `harness.html` shows |
| `SPEC.md` | What building this corrected, and what is verified versus read |
| `docs/` | The pages PCFHub publishes — see the comments in each file |
| `media/` | Images and video referenced from the docs |
| `pcfhub.json` | The hub's manifest: identity, links, docs path, demo |
| `scripts/` | Template setup and the CI guard that keeps it adopted |

## Licence

[MIT](LICENSE)
