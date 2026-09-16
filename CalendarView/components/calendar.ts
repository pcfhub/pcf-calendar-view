/**
 * The calendar's arithmetic, with no platform in it.
 *
 * Everything here is a pure function over plain values so that `dev/smoke.js`
 * can drive the decisions that matter — which day an event lands on, what a
 * drag writes, what the window filter asks the server for — without a DOM or
 * a host. `index.ts` reads the platform and calls in; the component draws
 * what comes out.
 *
 * **The unit is the wall clock, not the instant.** A Dataverse date arrives as
 * an ISO string whose meaning depends on the column's *behaviour*: a Date Only
 * column keeps its day in the UTC components (`2026-08-31T00:00:00.000Z` is
 * the 31st, everywhere); a User Local column is a true instant, and the day it
 * belongs to is the day in the **Dataverse user's** zone — which is not the
 * browser's zone, and a calendar is exactly the control that shows the
 * difference, one event per day. So every value is turned into `Wall`
 * components once, at the boundary, and nothing past that point calls
 * `getDate()` on anything.
 */

/** The manifest's role names. `column.alias` carries these; `column.name` carries the maker's schema name. */
export const ROLES = {
    start: 'startField',
    end: 'endField',
    title: 'titleField',
    color: 'colorField',
} as const;

/**
 * A column's behaviour, from `DateTimeAttributeMetadata.DateTimeBehavior` —
 * `1` User Local, `2` Date Only, `3` Time Zone Independent — or `unknown`
 * where metadata could not be read (canvas, or before the call lands).
 */
export type Behavior = 'userlocal' | 'dateonly' | 'tzi' | 'unknown';

/** A date column's format, from the column's `dataType`. */
export type Format = 'date' | 'datetime';

/** A wall-clock reading: the components a person would write down. `month` is 0-based like `Date`'s. */
export interface Wall {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
}

export interface CalendarEvent {
    id: string;
    title: string;
    start: Wall;
    /** `null` for a single-day or instantaneous event. Never before `start`. */
    end: Wall | null;
    /** True for a whole-day event: a Date Only column, or a Date and Time column formatted as a date. */
    allDay: boolean;
    /** The colour role's option label, when bound; `null` otherwise. */
    badge: string | null;
    /** The option's colour, when the option set carries one. */
    color: string | null;
}

export type View = 'month' | 'week';

/** How `Behavior` is read off a metadata node. The numbers are the platform's. */
export function behaviorOf(node: unknown): Behavior {
    const raw = (node as { Behavior?: unknown } | null | undefined)?.Behavior;

    switch (raw) {
        case 1:
            return 'userlocal';
        case 2:
            return 'dateonly';
        case 3:
            return 'tzi';
        default:
            return 'unknown';
    }
}

/** `DateAndTime.DateOnly` is a *format*, and only that. Behaviour is decided elsewhere. */
export function formatOf(dataType: string | undefined): Format {
    return dataType === 'DateAndTime.DateOnly' ? 'date' : 'datetime';
}

/**
 * The instant a stored value denotes, or `null`.
 *
 * `record.getValue` on a date column returns an ISO **string**, not a `Date`
 * (measured on `pcf-data-table`, 2026-09-11). A `Date` is accepted too,
 * because the optimistic override holds one.
 */
export function toDate(raw: unknown): Date | null {
    if (raw === null || raw === undefined || raw === '') {
        return null;
    }

    const date = raw instanceof Date ? raw : new Date(String(raw));

    return Number.isNaN(date.getTime()) ? null : date;
}

/** Whether a stored value is a whole day expressed as UTC midnight — how a Date Only column hands its day over. */
export function isUtcMidnight(raw: unknown): boolean {
    return typeof raw === 'string' && /T00:00:00(\.000)?Z$/.test(raw);
}

/** A `Date`'s UTC components as a wall clock. */
function utcWall(date: Date): Wall {
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth(),
        day: date.getUTCDate(),
        hour: date.getUTCHours(),
        minute: date.getUTCMinutes(),
    };
}

/** A `Date`'s browser-local components as a wall clock. */
export function localWall(date: Date): Wall {
    return {
        year: date.getFullYear(),
        month: date.getMonth(),
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
    };
}

/**
 * Where a stored value sits on the calendar.
 *
 * `userOffset` is `userSettings.getTimeZoneOffsetMinutes(date)` — minutes
 * *ahead* of UTC in the platform's sign (`-300` for UTC-5, the opposite of
 * `getTimezoneOffset()`), and always the dated call, because the bare one
 * answers the standard offset on a day that is in daylight time.
 *
 * - **Date Only**: the day is in the UTC components. Reading local ones is
 *   the previous day west of Greenwich.
 * - **Time Zone Independent**: the wall clock is in the UTC components too.
 * - **User Local**: the value is a true instant, and the wall clock is that
 *   instant in the user's zone — shifted by the offset and then read as UTC,
 *   which sidesteps the browser's zone entirely.
 * - **unknown**: a value at exactly UTC midnight is taken as a Date Only day,
 *   anything else as an instant in the user's zone. A User Local value that
 *   happens to fall on UTC midnight is misread; that is the ambiguity only
 *   metadata resolves, and why the control asks for it.
 */
export function wallOf(raw: unknown, behavior: Behavior, userOffset: (date: Date) => number): Wall | null {
    if (raw instanceof Date) {
        // The control's own override, built from local components — read back the way it was built.
        return localWall(raw);
    }

    const date = toDate(raw);

    if (!date) {
        return null;
    }

    const asDay = behavior === 'dateonly' || behavior === 'tzi' || (behavior === 'unknown' && isUtcMidnight(raw));

    if (asDay) {
        return utcWall(date);
    }

    return utcWall(new Date(date.getTime() + userOffset(date) * 60_000));
}

/** `yyyy-MM-dd`, the key every day-indexed structure here uses. */
export function dayKey(wall: Wall): string {
    return `${wall.year}-${pad(wall.month + 1)}-${pad(wall.day)}`;
}

/** The `Wall` for a day key at midnight. Component-built, never parsed through `Date`. */
export function wallFromKey(key: string): Wall | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);

    if (!match) {
        return null;
    }

    return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]), hour: 0, minute: 0 };
}

/**
 * A wall clock moved by whole days, with the time of day kept.
 *
 * Through `Date`'s own day arithmetic on the components, which rolls months
 * and years and is unaffected by DST because nothing here is an instant —
 * `new Date(2026, 2, 31 + 1)` is 1 April, and the hour comes back as it went in.
 */
export function shiftDays(wall: Wall, days: number): Wall {
    return localWall(new Date(wall.year, wall.month, wall.day + days, wall.hour, wall.minute, 0, 0));
}

/** Days from `a` to `b`, by calendar day — sign included. */
export function daysBetween(a: Wall, b: Wall): number {
    const first = Date.UTC(a.year, a.month, a.day);
    const second = Date.UTC(b.year, b.month, b.day);

    return Math.round((second - first) / 86_400_000);
}

export function sameDay(a: Wall, b: Wall): boolean {
    return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** Ordering by wall clock, minutes resolution. */
export function compareWall(a: Wall, b: Wall): number {
    return (
        a.year - b.year || a.month - b.month || a.day - b.day || a.hour - b.hour || a.minute - b.minute
    );
}

/**
 * The `Date` to hand `record.setValue` for a wall clock.
 *
 * A `Date` whose **local components** are the wall clock the user means is
 * the shape every behaviour wants on the way in (`pcf-date-range-picker`,
 * measured on all three behaviours), and a whole day is anchored at midday so
 * a Date Only column keeps the same calendar day in UTC from every zone
 * within twelve hours of Greenwich.
 */
export function dateForWrite(wall: Wall, allDay: boolean): Date {
    return allDay
        ? new Date(wall.year, wall.month, wall.day, 12, 0, 0, 0)
        : new Date(wall.year, wall.month, wall.day, wall.hour, wall.minute, 0, 0);
}

/**
 * The value to hand `webAPI.updateRecord` for the same wall clock — the
 * second write route, taken where the record refuses `setValue`.
 *
 * The Web API takes a bare `yyyy-MM-dd` for a Date Only column and an ISO
 * instant otherwise. For User Local the instant is the wall clock in the
 * *user's* zone, so the offset is subtracted rather than the browser's;
 * Time Zone Independent stores the components verbatim, as UTC.
 */
export function valueForApi(wall: Wall, behavior: Behavior, allDay: boolean, userOffset: (date: Date) => number): string {
    /*
     * Only a **Date Only behaviour** takes the bare day. A date-*formatted*
     * column is usually User Local underneath — the pairing Microsoft warns
     * against, and the one a maker gets by default — and a bare day into it
     * is stored as UTC midnight and shown a day early for every user west of
     * Greenwich: measured 2026-09-16 on `cll_dueon`, `2026-10-04` read back
     * as `10/3/2026`. So a whole day on anything else is an instant at the
     * user's **noon**, which is the same calendar day in every zone within
     * twelve hours of the user.
     */
    if (behavior === 'dateonly') {
        return dayKey(wall);
    }

    const hour = allDay ? 12 : wall.hour;
    const minute = allDay ? 0 : wall.minute;
    const asUtc = Date.UTC(wall.year, wall.month, wall.day, hour, minute, 0, 0);

    if (behavior === 'tzi') {
        return new Date(asUtc).toISOString();
    }

    // The offset that applies on that day, not today's — DST is per date.
    const offset = userOffset(new Date(asUtc));

    return new Date(asUtc - offset * 60_000).toISOString();
}

/**
 * The value to pass as a **form parameter** for a date column — the second
 * argument to `openForm`, which is `{ [column]: string }`.
 *
 * **Not the ISO day.** Measured 2026-09-16 on a quick create: `2026-09-20`
 * is parsed as UTC midnight and the form opened on **9/19 6:00 PM**; the
 * documented `MM/dd/yy`, `MM/dd/yyyy` and `MM/dd/yyyy hh:mm tt` all landed
 * on the 20th. So the day goes in the user's own `shortDatePattern`
 * (`M/d/yyyy`, `dd.MM.yyyy` …), which is the spelling the form parses
 * dates in, with the US pattern as the fallback where no settings are
 * published. Whether a `dd/MM/yyyy` user's form parses that pattern back
 * correctly is not yet measured (SPEC.md).
 */
export function formParameterDay(wall: Wall, names?: DateNames): string {
    const pattern = names?.shortDatePattern || 'M/d/yyyy';

    return pattern
        .replace(/yyyy/g, String(wall.year))
        .replace(/yy/g, String(wall.year).slice(-2))
        .replace(/MM/g, pad(wall.month + 1))
        .replace(/M/g, String(wall.month + 1))
        .replace(/dd/g, pad(wall.day))
        .replace(/d/g, String(wall.day));
}

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

/** 0 Sunday … 6 Saturday — `Date.getDay()`'s numbering, which `firstDayOfWeek` shares. */
export function weekday(wall: Wall): number {
    return new Date(wall.year, wall.month, wall.day, 12).getDay();
}

/** The first day of the week containing `wall`. */
export function startOfWeek(wall: Wall, firstDay: number): Wall {
    const back = (weekday(wall) - firstDay + 7) % 7;

    return { ...shiftDays(wall, -back), hour: 0, minute: 0 };
}

/**
 * The days a month view shows: whole weeks from the one containing the 1st
 * through the one containing the last day. Five or six rows, never padded to
 * six — a fixed six-row grid shows a whole week of the next month for most
 * months, which reads as the calendar being a week ahead of itself.
 */
export function monthGrid(year: number, month: number, firstDay: number): Wall[][] {
    const first = startOfWeek({ year, month, day: 1, hour: 0, minute: 0 }, firstDay);
    const lastDay = new Date(year, month + 1, 0).getDate();
    const last = shiftDays(startOfWeek({ year, month, day: lastDay, hour: 0, minute: 0 }, firstDay), 6);
    const rows: Wall[][] = [];
    let cursor = first;

    while (compareWall(cursor, last) <= 0) {
        const row: Wall[] = [];

        for (let i = 0; i < 7; i += 1) {
            row.push(shiftDays(cursor, i));
        }

        rows.push(row);
        cursor = shiftDays(cursor, 7);
    }

    return rows;
}

/** The seven days of the week containing `anchor`. */
export function weekDays(anchor: Wall, firstDay: number): Wall[] {
    const start = startOfWeek(anchor, firstDay);
    const days: Wall[] = [];

    for (let i = 0; i < 7; i += 1) {
        days.push(shiftDays(start, i));
    }

    return days;
}

/** The first and last day a view shows, inclusive — what the window filter asks for. */
export function visibleRange(view: View, anchor: Wall, firstDay: number): { first: Wall; last: Wall } {
    if (view === 'week') {
        const days = weekDays(anchor, firstDay);

        return { first: days[0], last: days[6] };
    }

    const rows = monthGrid(anchor.year, anchor.month, firstDay);

    return { first: rows[0][0], last: rows[rows.length - 1][6] };
}

/** Where a step of the navigation lands. */
export function stepAnchor(view: View, anchor: Wall, direction: -1 | 1): Wall {
    if (view === 'week') {
        return shiftDays(anchor, 7 * direction);
    }

    // Day 1, so stepping from 31 January lands in February rather than March.
    return localWall(new Date(anchor.year, anchor.month + direction, 1, 12));
}

/**
 * The events on one day: those whose span covers it, ordered all-day first
 * and then by start time. A multi-day event appears on every day it covers,
 * which is what a month grid without spanning bars can show honestly; the
 * component marks the continuation.
 */
export function eventsOn(events: CalendarEvent[], day: Wall): CalendarEvent[] {
    return events
        .filter((event) => {
            const last = event.end ?? event.start;

            return compareDay(event.start, day) <= 0 && compareDay(last, day) >= 0;
        })
        .sort((a, b) => Number(b.allDay) - Number(a.allDay) || compareWall(a.start, b.start) || a.title.localeCompare(b.title));
}

function compareDay(a: Wall, b: Wall): number {
    return a.year - b.year || a.month - b.month || a.day - b.day;
}

// ---------------------------------------------------------------------------
// The window filter
// ---------------------------------------------------------------------------

/**
 * The `ConditionOperator` values a date range needs. `On` (25), `OnOrBefore`
 * (26) and `OnOrAfter` (27) are past the both-host set — measured on a
 * model-driven subgrid (`pcf-data-table`, 2026-09-11), where the day is
 * compared in the user's zone. `Null` (12) is on both hosts.
 */
export const OPERATOR = { Null: 12, OnOrBefore: 26, OnOrAfter: 27 } as const;
export const FILTER_AND = 0;
export const FILTER_OR = 1;

export interface Condition {
    attributeName: string;
    conditionOperator: number;
    value?: string;
}

export interface Filter {
    filterOperator: number;
    conditions: Condition[];
    filters?: Filter[];
}

/**
 * The expression that fetches what the view shows: every record whose span
 * touches `[first, last]`.
 *
 * With an end column: `start ≤ last AND (end ≥ first OR end IS NULL)` — the
 * `Or` nested as a child filter, because a record with no end is a
 * single-day event that starts inside the window or not at all, and dropping
 * it would lose every event the maker never gave an end. Without one:
 * `first ≤ start ≤ last`.
 *
 * Whether a nested `filters` array is honoured on a subgrid is the probe's
 * second question (SPEC.md).
 */
export function windowFilter(startColumn: string, endColumn: string | null, first: Wall, last: Wall): Filter {
    const from = dayKey(first);
    const to = dayKey(last);

    if (endColumn === null) {
        return {
            filterOperator: FILTER_AND,
            conditions: [
                { attributeName: startColumn, conditionOperator: OPERATOR.OnOrAfter, value: from },
                { attributeName: startColumn, conditionOperator: OPERATOR.OnOrBefore, value: to },
            ],
        };
    }

    return {
        filterOperator: FILTER_AND,
        conditions: [{ attributeName: startColumn, conditionOperator: OPERATOR.OnOrBefore, value: to }],
        filters: [
            {
                filterOperator: FILTER_OR,
                conditions: [
                    { attributeName: endColumn, conditionOperator: OPERATOR.OnOrAfter, value: from },
                    { attributeName: endColumn, conditionOperator: OPERATOR.Null },
                ],
            },
        ],
    };
}

// ---------------------------------------------------------------------------
// Option colours
// ---------------------------------------------------------------------------

/**
 * `value → colour` for a choice column, from its metadata node.
 *
 * The colour is on `attributeDescriptor.OptionSet[]` only — an array of
 * `{ Label, Value, Color, IsHidden }` — never on the value-keyed `OptionSet`
 * map (measured 2026-09-14, `pcf-kanban-board`). A missing array, or one
 * whose options carry no `Color`, yields an empty map, and the events show
 * the label with no colour.
 */
export function optionColors(node: unknown): Map<number, string> {
    const colors = new Map<number, string>();
    const descriptor = (node as { attributeDescriptor?: { OptionSet?: unknown } } | null | undefined)
        ?.attributeDescriptor?.OptionSet;

    if (!Array.isArray(descriptor)) {
        return colors;
    }

    for (const option of descriptor as { Value?: unknown; Color?: unknown }[]) {
        if (typeof option?.Value === 'number' && typeof option.Color === 'string' && /^#[0-9a-f]{3,8}$/i.test(option.Color)) {
            colors.set(option.Value, option.Color);
        }
    }

    return colors;
}

/** A choice's raw value as a number — the platform hands it over as a string on a dataset record. */
export function optionValue(raw: unknown): number | null {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return raw;
    }

    if (typeof raw === 'string' && /^-?\d+$/.test(raw.trim())) {
        return Number(raw);
    }

    return null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** The subset of `userSettings.dateFormattingInfo` a calendar reads. Every member is optional because the demo harness publishes none. */
export interface DateNames {
    shortDatePattern?: string;
    dayNames?: string[];
    abbreviatedDayNames?: string[];
    monthNames?: string[];
    shortTimePattern?: string;
    amDesignator?: string;
    pmDesignator?: string;
    firstDayOfWeek?: number;
}

const FALLBACK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FALLBACK_MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

export function dayName(names: DateNames | undefined, weekdayIndex: number, short: boolean): string {
    const list = short ? names?.abbreviatedDayNames : names?.dayNames;
    const name = list?.[weekdayIndex];

    if (typeof name === 'string' && name !== '') {
        return name;
    }

    return short ? FALLBACK_DAYS[weekdayIndex].slice(0, 3) : FALLBACK_DAYS[weekdayIndex];
}

export function monthName(names: DateNames | undefined, month: number): string {
    const name = names?.monthNames?.[month];

    return typeof name === 'string' && name !== '' ? name : FALLBACK_MONTHS[month];
}

/**
 * The first day of the week: the maker's override, else the user's own
 * setting, else Sunday. `weekStart` is the manifest Enum.
 */
export function firstDayOfWeek(weekStart: string | null | undefined, names: DateNames | undefined): number {
    if (weekStart === 'sunday') {
        return 0;
    }

    if (weekStart === 'monday') {
        return 1;
    }

    const own = names?.firstDayOfWeek;

    return typeof own === 'number' && own >= 0 && own <= 6 ? own : 0;
}

/**
 * A time of day through the user's `shortTimePattern` — `h:mm tt`, `HH:mm`,
 * `H.mm` — with the designators from the same bag. Formatting it here rather
 * than through `context.formatting.formatTime` is deliberate: that call
 * renders in a zone this control has already accounted for, and prints the
 * date in front of the time (measured, `pcf-date-range-picker`).
 */
export function formatTime(wall: Wall, names: DateNames | undefined): string {
    const pattern = names?.shortTimePattern || 'h:mm tt';
    const twelveHour = /h/.test(pattern);
    const hour12 = wall.hour % 12 === 0 ? 12 : wall.hour % 12;
    const designator = wall.hour < 12 ? names?.amDesignator ?? 'AM' : names?.pmDesignator ?? 'PM';

    return pattern
        .replace(/tt/g, designator)
        .replace(/HH/g, pad(wall.hour))
        .replace(/H/g, String(wall.hour))
        .replace(/hh/g, pad(hour12))
        .replace(/h/g, String(twelveHour ? hour12 : wall.hour))
        .replace(/mm/g, pad(wall.minute))
        .trim();
}

export function pad(part: number): string {
    return `${part}`.padStart(2, '0');
}

/** A stable identity for the loaded events, so the component's overlay resets only when the data does. */
export function eventsKey(events: CalendarEvent[]): string {
    return events.map((event) => `${event.id}:${dayKey(event.start)}:${event.end ? dayKey(event.end) : ''}`).join('|');
}
