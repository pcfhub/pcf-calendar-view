/*
 * THE 0.2.5 PROBE — the hour grid's questions. Deleted before 0.3.0; not part
 * of the control.
 *
 * 0.3.0 draws Day and Week against the hours of the day, so a drag writes a
 * *time*, and the + on a slot opens the quick create with a start and an end
 * already set. Everything 0.2.x measured was whole days. What the hour grid
 * rests on and this repository has not watched:
 *
 *   H1  the record route (setValue + one save) carrying a time with minutes,
 *       both columns, from a browser an hour from the user
 *   H2  the Web API route carrying the same
 *   H3  the quick create taking a start *and* an end with times, and which
 *       spelling of a time it parses
 *   H4  the time half of `dateFormattingInfo` on a dataset control
 *   H5  the user's working day, read from `usersettings` through `webAPI`
 *   H6  the user's offset across the year — whether the zone has DST
 *   H7  what the subgrid allocates in height (the grid scrolls inside a box
 *       whose height somebody has to decide)
 *
 * Installed once from `updateView` on the first pass that carries records.
 * The passive answers log at once; the active ones hang on
 * `window.__pcfCalendarViewProbe` and print MATCH or MISMATCH against the
 * value the control would expect, so a pasted answer reads without
 * arithmetic. Everything reads the dataset and context through getters —
 * `context.parameters.records` is a new object every pass, and the 0.0.1
 * probe answered three questions off a dead first one.
 */
import { IInputs } from './generated/ManifestTypes';
import {
    Behavior,
    DateNames,
    ROLES,
    Wall,
    behaviorOf,
    dateForWrite,
    dayKey,
    formParameterDay,
    formatTime,
    pad,
    valueForApi,
    wallFromKey,
    wallOf,
} from './components/calendar';

type DataSet = ComponentFramework.PropertyTypes.DataSet;
type Context = ComponentFramework.Context<IInputs>;

const TAG = '[CalendarView probe 0.2.5]';
const VERSION = '0.2.5-probe';

interface EditableRecord {
    setValue(columnName: string, value: unknown): unknown;
    save(): Promise<unknown>;
    isEditable?(columnName: string): Promise<boolean>;
}

function log(label: string, value: unknown): void {
    let text: string;

    try {
        text = JSON.stringify(value, null, 2);
    } catch {
        text = String(value);
    }

    console.log(`${TAG} ${label}\n${text}`);
}

function describe(value: unknown, depth = 0): unknown {
    if (depth > 2 || value === null || typeof value !== 'object') {
        return typeof value === 'function' ? 'function' : value;
    }

    if (Array.isArray(value)) {
        return value.slice(0, 4).map((item) => describe(item, depth + 1));
    }

    const out: Record<string, unknown> = {};

    for (const key of Object.keys(value as object).slice(0, 60)) {
        out[key] = describe((value as Record<string, unknown>)[key], depth + 1);
    }

    return out;
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** `HH:mm` → hour and minute, or null. */
function parseClock(text: string): { hour: number; minute: number } | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());

    if (!match) {
        return null;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    return hour < 24 && minute < 60 ? { hour, minute } : null;
}

/** A wall clock plus minutes, through `Date`'s own component arithmetic. */
function addMinutes(wall: Wall, minutes: number): Wall {
    const date = new Date(wall.year, wall.month, wall.day, wall.hour, wall.minute + minutes, 0, 0);

    return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate(), hour: date.getHours(), minute: date.getMinutes() };
}

function wallText(wall: Wall | null): string {
    return wall ? `${dayKey(wall)} ${pad(wall.hour)}:${pad(wall.minute)}` : '(none)';
}

export function installProbe(latestContext: () => Context, latest: () => DataSet): void {
    const w = window as unknown as { __pcfCalendarViewProbe?: unknown };

    if (w.__pcfCalendarViewProbe) {
        return;
    }

    const context = latestContext();
    const firstPass = latest();
    const column = (alias: string): { name: string; dataType: string } | undefined =>
        (latest().columns ?? []).find((c) => c.alias === alias);
    const start = column(ROLES.start);
    const end = column(ROLES.end);
    const title = column(ROLES.title);
    const entity = firstPass.getTargetEntityType();
    const settings = context.userSettings as unknown as {
        userId?: string;
        getTimeZoneOffsetMinutes?: (d?: Date) => number;
        dateFormattingInfo?: Record<string, unknown>;
    };
    const names = settings.dateFormattingInfo as DateNames | undefined;
    const userOffset = (d: Date): number => {
        const offset = settings.getTimeZoneOffsetMinutes?.(d);

        return typeof offset === 'number' && Number.isFinite(offset) ? offset : -d.getTimezoneOffset();
    };

    /** Behaviours, once metadata lands; `unknown` until then, the control's own fallback. */
    const behaviours: { start: Behavior; end: Behavior } = { start: 'unknown', end: 'unknown' };

    /** The values a record held before this probe first wrote to it, for `restore`. */
    const originals = new Map<string, Record<string, unknown>>();

    /** The instant a User Local wall clock should be stored as — what MATCH compares against. */
    const expectedInstant = (wall: Wall, behavior: Behavior): string => {
        if (behavior === 'tzi') {
            return new Date(Date.UTC(wall.year, wall.month, wall.day, wall.hour, wall.minute)).toISOString();
        }

        const asUtc = Date.UTC(wall.year, wall.month, wall.day, wall.hour, wall.minute);

        return new Date(asUtc - userOffset(new Date(asUtc)) * 60_000).toISOString();
    };

    const sameInstant = (stored: unknown, expected: string): boolean =>
        typeof stored === 'string' && new Date(stored).getTime() === new Date(expected).getTime();

    // ---- passive ---------------------------------------------------------

    const loaded = (firstPass.sortedRecordIds ?? []).slice(0, 3);

    log('P1 columns and the first records', {
        version: VERSION,
        entity,
        columns: (firstPass.columns ?? []).map((c) => ({ alias: c.alias, name: c.name, dataType: c.dataType })),
        records: loaded.map((id) => {
            const record = firstPass.records[id];

            return {
                id,
                title: title ? record.getFormattedValue(title.name) : null,
                start: start ? { raw: record.getValue(start.name), formatted: record.getFormattedValue(start.name) } : null,
                end: end ? { raw: record.getValue(end.name), formatted: record.getFormattedValue(end.name) } : null,
            };
        }),
    });

    const info = settings.dateFormattingInfo ?? {};
    const pick = (keys: string[]): Record<string, unknown> =>
        Object.fromEntries(keys.map((key) => [key, (info as Record<string, unknown>)[key]]));

    log('H4 dateFormattingInfo — the time half', {
        keys: Object.keys(info).sort(),
        time: pick([
            'shortTimePattern', 'longTimePattern', 'timeSeparator', 'amDesignator', 'pmDesignator',
            'ShortTimePattern', 'TimeSeparator', 'AMDesignator', 'PMDesignator',
        ]),
        date: pick(['shortDatePattern', 'dateSeparator', 'firstDayOfWeek']),
        formatTimeOf1430: formatTime({ year: 2026, month: 9, day: 8, hour: 14, minute: 30 }, names),
        formatTimeOf0905: formatTime({ year: 2026, month: 9, day: 8, hour: 9, minute: 5 }, names),
    });

    const offsetOn = (iso: string): { user: number | undefined; browser: number } => {
        const d = new Date(iso);

        return { user: settings.getTimeZoneOffsetMinutes?.(d), browser: -d.getTimezoneOffset() };
    };

    log('H6 the user\'s offset across the year (does the zone have DST?)', {
        bare: settings.getTimeZoneOffsetMinutes?.(),
        '2026-01-15': offsetOn('2026-01-15T17:00:00Z'),
        '2026-03-07': offsetOn('2026-03-07T17:00:00Z'),
        '2026-03-09': offsetOn('2026-03-09T17:00:00Z'),
        '2026-03-30': offsetOn('2026-03-30T17:00:00Z'),
        '2026-07-01': offsetOn('2026-07-01T17:00:00Z'),
        '2026-10-26': offsetOn('2026-10-26T17:00:00Z'),
        '2026-11-02': offsetOn('2026-11-02T17:00:00Z'),
        '2026-11-15': offsetOn('2026-11-15T17:00:00Z'),
    });

    const mode = context.mode as unknown as { allocatedWidth: number; allocatedHeight: number; contextInfo?: unknown };

    log('H7 allocated size at install', {
        allocatedWidth: mode.allocatedWidth,
        allocatedHeight: mode.allocatedHeight,
        windowInnerHeight: window.innerHeight,
    });

    window.setTimeout(() => {
        const later = latestContext().mode;

        log('H7 allocated size +5 s', { allocatedWidth: later.allocatedWidth, allocatedHeight: later.allocatedHeight });
    }, 5000);

    const workHours = (): Promise<unknown> => {
        const api = latestContext().webAPI;
        const userId = (settings.userId ?? '').replace(/[{}]/g, '').toLowerCase();

        if (typeof api?.retrieveMultipleRecords !== 'function' || userId === '') {
            log('H5 usersettings', { skipped: true, hasWebApi: typeof api?.retrieveMultipleRecords, userId: settings.userId });

            return Promise.resolve(null);
        }

        const query = '?$select=workdaystarttime,workdaystoptime,timeformatstring,timeseparator,timezonecode,timezonebias'
            + `&$filter=systemuserid eq ${userId}`;
        const started = performance.now();

        return api.retrieveMultipleRecords('usersettings', query)
            .then((result) => {
                log('H5 usersettings', {
                    ms: Math.round(performance.now() - started),
                    rows: result.entities.length,
                    first: result.entities[0] ?? null,
                });

                return result.entities[0] ?? null;
            })
            .catch((error: unknown) => {
                log('H5 usersettings REFUSED', describe(error));

                return null;
            });
    };

    void workHours();

    const utils = context.utils as unknown as { getEntityMetadata?: (e: string, a: string[]) => Promise<unknown> } | undefined;

    if (start && typeof utils?.getEntityMetadata === 'function') {
        void utils.getEntityMetadata(entity, [start.name, end?.name].filter((n): n is string => typeof n === 'string'))
            .then((metadata) => {
                const attributes = (metadata as { Attributes?: { get?: (n: string) => unknown } }).Attributes;
                const node = (name: string | undefined): unknown => (name && attributes?.get ? attributes.get(name) : undefined);

                behaviours.start = behaviorOf(node(start.name));
                behaviours.end = end ? behaviorOf(node(end.name)) : 'unknown';
                log('P2 behaviours', {
                    start: { column: start.name, dataType: start.dataType, behavior: behaviours.start, Format: (node(start.name) as { Format?: unknown } | undefined)?.Format },
                    end: end ? { column: end.name, dataType: end.dataType, behavior: behaviours.end, Format: (node(end.name) as { Format?: unknown } | undefined)?.Format } : '(no end role)',
                });
            })
            .catch((error: unknown) => log('P2 metadata FAILED', String(error)));
    }

    // ---- active ----------------------------------------------------------

    const readBack = (id: string): Promise<Record<string, unknown> | null> => {
        const api = latestContext().webAPI;

        if (!start || typeof api?.retrieveRecord !== 'function') {
            return Promise.resolve(null);
        }

        const select = [start.name, end?.name].filter((n): n is string => typeof n === 'string').join(',');

        return api.retrieveRecord(entity, id, `?$select=${select}`)
            .then((row) => row as Record<string, unknown>)
            .catch((error: unknown) => {
                log('readBack REJECTED', describe(error));

                return null;
            });
    };

    const remember = (id: string): Promise<void> => {
        if (originals.has(id)) {
            return Promise.resolve();
        }

        return readBack(id).then((row) => {
            if (row && start) {
                const kept: Record<string, unknown> = { [start.name]: row[start.name] };

                if (end) {
                    kept[end.name] = row[end.name];
                }

                originals.set(id, kept);
            }
        });
    };

    /** The day a record's start sits on, as the control reads it — the time questions keep the day and set the clock. */
    const dayOf = (id: string): Wall | null => {
        const record = latest().records[id];

        if (!record || !start) {
            return null;
        }

        return wallOf(record.getValue(start.name), behaviours.start, userOffset);
    };

    /** The two walls a time question writes: the record's own day at `clock`, and `minutes` later. */
    const target = (id: string, clock: string, minutes: number): { from: Wall; to: Wall } | string => {
        const day = dayOf(id);
        const time = parseClock(clock);

        if (!day) {
            return `no record ${id} in the loaded page, or no start — try pick()`;
        }

        if (!time) {
            return `clock "${clock}" is not HH:mm`;
        }

        const from: Wall = { year: day.year, month: day.month, day: day.day, hour: time.hour, minute: time.minute };

        return { from, to: addMinutes(from, minutes) };
    };

    const verdict = (label: string, row: Record<string, unknown> | null, from: Wall, to: Wall): void => {
        if (!row || !start) {
            log(`${label} readBack`, 'nothing read back');

            return;
        }

        const wantStart = expectedInstant(from, behaviours.start);
        const wantEnd = end ? expectedInstant(to, behaviours.end) : null;
        const gotStart = row[start.name];
        const gotEnd = end ? row[end.name] : null;

        log(`${label} readBack`, {
            behaviours,
            start: { asked: wallText(from), stored: gotStart, expected: wantStart, verdict: sameInstant(gotStart, wantStart) ? 'MATCH' : 'MISMATCH' },
            end: end && wantEnd
                ? { asked: wallText(to), stored: gotEnd, expected: wantEnd, verdict: sameInstant(gotEnd, wantEnd) ? 'MATCH' : 'MISMATCH' }
                : '(no end role)',
            formattedOnRecordAfterRefresh: '(see the subgrid — does the event show the asked time?)',
            userOffsetThatDay: userOffset(new Date(wantStart)),
            browserOffsetThatDay: -new Date(wantStart).getTimezoneOffset(),
        });
    };

    const probe = {
        version: VERSION,

        help: [
            'pick()                                  — the loaded events with ids, as the control reads them',
            'timeViaRecord(id, "14:45", 45)          — H1: setValue start+end with a time, one save, read back',
            'timeViaApi(id, "09:15", 90)             — H2: the same through webAPI.updateRecord',
            'createAt("2026-10-08", "14:30", 60, s)  — H3: quick create with start AND end; s = user | us12 | h24 | isoLocal',
            'workHours()                             — H5 again',
            'restore(id)                             — put back what the record held before this probe wrote',
        ].join('\n'),

        pick(): unknown {
            const now = latest();
            const rows = (now.sortedRecordIds ?? []).slice(0, 15).map((id) => {
                const record = now.records[id];

                return {
                    id,
                    title: title ? record.getFormattedValue(title.name) : '',
                    start: start ? wallText(wallOf(record.getValue(start.name), behaviours.start, userOffset)) : null,
                    end: end ? wallText(wallOf(record.getValue(end.name), behaviours.end, userOffset)) : null,
                    startFormatted: start ? record.getFormattedValue(start.name) : null,
                };
            });

            log('pick', rows);

            return rows;
        },

        /**
         * H1. The record route with a time. 0.2.x measured it at midnight
         * (Oct 5 00:00 local → stored 05:00Z, the user's midnight); the hour
         * grid needs it at a time with minutes, both columns, one save.
         */
        timeViaRecord(id: string, clock = '14:45', minutes = 45): string {
            const walls = target(id, clock, minutes);

            if (typeof walls === 'string') {
                return walls;
            }

            const record = latest().records[id] as unknown as Partial<EditableRecord> | undefined;

            if (!record || !start || typeof record.setValue !== 'function' || typeof record.save !== 'function') {
                return 'this record has no write half — H1 cannot be asked here; try timeViaApi';
            }

            const startValue = dateForWrite(walls.from, false);
            const endValue = dateForWrite(walls.to, false);

            log('H1 setValue', {
                id,
                asked: { start: wallText(walls.from), end: end ? wallText(walls.to) : '(no end role)' },
                handedOver: { start: { local: startValue.toString(), iso: startValue.toISOString() }, end: end ? { local: endValue.toString(), iso: endValue.toISOString() } : null },
            });

            void remember(id)
                .then(() => record.isEditable?.(start.name))
                .then((allowed) => {
                    log('H1 isEditable(start)', allowed);
                    record.setValue?.(start.name, startValue);

                    if (end) {
                        record.setValue?.(end.name, endValue);
                    }

                    return record.save?.();
                })
                .then((result) => {
                    log('H1 save resolved', describe(result));

                    return wait(3000);
                })
                .then(() => readBack(id))
                .then((row) => verdict('H1', row, walls.from, walls.to))
                .catch((error: unknown) => log('H1 REJECTED', describe(error)));

            return 'sent — the verdict follows in ~4 s';
        },

        /** H2. The Web API route with a time, spelled by the control's own `valueForApi`. */
        timeViaApi(id: string, clock = '09:15', minutes = 90): string {
            const walls = target(id, clock, minutes);
            const api = latestContext().webAPI;

            if (typeof walls === 'string') {
                return walls;
            }

            if (!start || typeof api?.updateRecord !== 'function') {
                return 'no start column or no webAPI';
            }

            const body: Record<string, string> = { [start.name]: valueForApi(walls.from, behaviours.start, false, userOffset) };

            if (end) {
                body[end.name] = valueForApi(walls.to, behaviours.end, false, userOffset);
            }

            log('H2 updateRecord body', { id, asked: { start: wallText(walls.from), end: wallText(walls.to) }, body });

            void remember(id)
                .then(() => api.updateRecord(entity, id, body))
                .then(() => readBack(id))
                .then((row) => verdict('H2', row, walls.from, walls.to))
                .catch((error: unknown) => log('H2 REJECTED', describe(error)));

            return 'sent';
        },

        /**
         * H3. The quick create with a start *and* an end, both with times.
         * 0.0.2 measured one parameter, a day: `09/20/2026 12:00 PM` landed
         * with its time. Unasked: a second date parameter in the same call,
         * a time that is not noon, and a 24-hour spelling — which is what a
         * user whose `shortTimePattern` is `HH:mm` would be sent.
         *
         * Look at the quick create: what do Start and End show? Then save it
         * — the probe reads the new row back and prints MATCH or MISMATCH —
         * or cancel, and say what it showed.
         */
        createAt(dayText = '2026-10-08', clock = '14:30', minutes = 60, spelling: 'user' | 'us12' | 'h24' | 'isoLocal' = 'user'): string {
            const ctx = latestContext();
            const navigation = (ctx as unknown as { navigation?: { openForm?: (o: unknown, p: unknown) => Promise<unknown> } }).navigation;
            const day = wallFromKey(dayText);
            const time = parseClock(clock);

            if (!start || !navigation?.openForm || !day || !time) {
                return 'no start column, no openForm, or a bad day/clock';
            }

            const from: Wall = { ...day, hour: time.hour, minute: time.minute };
            const to = addMinutes(from, minutes);
            const spell = (wall: Wall): string => {
                switch (spelling) {
                    case 'us12':
                        return `${wall.month + 1}/${wall.day}/${wall.year} ${formatTime(wall, { shortTimePattern: 'h:mm tt', amDesignator: 'AM', pmDesignator: 'PM' })}`;
                    case 'h24':
                        return `${formParameterDay(wall, names)} ${pad(wall.hour)}:${pad(wall.minute)}`;
                    case 'isoLocal':
                        return `${dayKey(wall)}T${pad(wall.hour)}:${pad(wall.minute)}:00`;
                    default:
                        return `${formParameterDay(wall, names)} ${formatTime(wall, names)}`;
                }
            };
            const parameters: Record<string, string> = { [start.name]: spell(from) };

            if (end) {
                parameters[end.name] = spell(to);
            }

            const contextInfo = (ctx.mode as unknown as { contextInfo?: { entityTypeName?: string; entityId?: string } }).contextInfo;
            const options: Record<string, unknown> = { entityName: entity, useQuickCreateForm: true };

            if (contextInfo?.entityTypeName && contextInfo.entityId) {
                options.createFromEntity = { entityType: contextInfo.entityTypeName, id: contextInfo.entityId };
            }

            log(`H3 openForm (${spelling})`, { asked: { start: wallText(from), end: wallText(to) }, options, parameters });

            void navigation.openForm(options, parameters)
                .then((result) => {
                    log(`H3 openForm (${spelling}) resolved`, result);

                    const saved = (result as { savedEntityReference?: { id?: string }[] | null } | undefined)?.savedEntityReference;
                    const id = saved?.[0]?.id?.replace(/[{}]/g, '').toLowerCase();

                    return id ? readBack(id).then((row) => verdict(`H3 (${spelling}) saved row`, row, from, to)) : undefined;
                })
                .catch((error: unknown) => log(`H3 openForm (${spelling}) REJECTED`, describe(error)));

            return `opened with ${JSON.stringify(parameters)} — what do Start and End show?`;
        },

        workHours(): string {
            void workHours();

            return 'sent';
        },

        restore(id: string): string {
            const kept = originals.get(id);
            const api = latestContext().webAPI;

            if (!kept) {
                return 'nothing kept for that id — the probe never wrote to it';
            }

            if (typeof api?.updateRecord !== 'function') {
                return 'no webAPI';
            }

            void api.updateRecord(entity, id, kept)
                .then(() => readBack(id))
                .then((row) => log('restore readBack', { kept, now: row }))
                .catch((error: unknown) => log('restore REJECTED', describe(error)));

            return 'sent';
        },
    };

    w.__pcfCalendarViewProbe = probe;
    console.log(`${TAG} installed — window.__pcfCalendarViewProbe.help`);
}
