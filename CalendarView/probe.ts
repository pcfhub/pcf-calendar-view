/*
 * THE 0.3.5 PROBE — the light Gantt's questions. Deleted before 0.4.0; not
 * part of the control.
 *
 * 0.4.0 puts the timeline's rows in a tree by a Parent lookup, draws arrows
 * from a Depends on lookup, and adds a quarter span. What that rests on and
 * this repository has not watched (SPEC.md G1–G6):
 *
 *   G1  a Lookup.Simple property-set bound on the subgrid, as a column
 *   G2  the lookup's value on a dataset row — and whether `name` is there
 *       when the row it points at is not loaded
 *   G3  a role column the view does not carry, fetched or not
 *   G4  the lookups still on the row after a record-route save
 *   G5  the window filter over a quarter, against a Web API count
 *   G6  the new Enum's raw value
 *
 * Installed once from `updateView` on the first pass that carries records.
 * Everything reads the dataset and context through getters —
 * `context.parameters.records` is a new object every pass, and the 0.0.1
 * probe answered three questions off a dead first one.
 */
import { IInputs } from './generated/ManifestTypes';
import { ROLES, Wall, dateForWrite, dayKey, shiftDays, wallFromKey, wallOf, windowFilter } from './components/calendar';

type DataSet = ComponentFramework.PropertyTypes.DataSet;
type Context = ComponentFramework.Context<IInputs>;

const TAG = '[CalendarView probe 0.3.5]';
const VERSION = '0.3.5-probe';

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
    if (depth > 3 || value === null || typeof value !== 'object') {
        return typeof value === 'function' ? 'function' : value === undefined ? '(undefined)' : value;
    }

    if (value instanceof Date) {
        return `Date ${value.toISOString()}`;
    }

    if (Array.isArray(value)) {
        return value.slice(0, 4).map((item) => describe(item, depth + 1));
    }

    const out: Record<string, unknown> = {};

    for (const key of Object.keys(value as object).slice(0, 40)) {
        out[key] = describe((value as Record<string, unknown>)[key], depth + 1);
    }

    return out;
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function bare(raw: unknown): string | null {
    const id = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : null;
    const guid = id && typeof id === 'object' ? (id as { guid?: unknown }).guid : id;

    return typeof guid === 'string' ? guid.replace(/[{}]/g, '').toLowerCase() : null;
}

function column(dataset: DataSet, alias: string): ComponentFramework.PropertyHelper.DataSetApi.Column | undefined {
    return (dataset.columns ?? []).find((c) => c.alias === alias);
}

export function installProbe(latestContext: () => Context, latest: () => DataSet): void {
    const w = window as unknown as { __pcfCalendarViewProbe?: unknown };

    if (w.__pcfCalendarViewProbe) {
        return;
    }

    /** G2/G3: every loaded row's two lookups, raw and formatted, and whether what each points at is loaded. */
    const lookups = (label = 'G2/G3 lookups on the loaded rows'): unknown[] => {
        const dataset = latest();
        const title = column(dataset, ROLES.title);
        const start = column(dataset, ROLES.start);
        const parent = column(dataset, 'parentField');
        const dependsOn = column(dataset, 'dependsOnField');
        const ids = (dataset.sortedRecordIds ?? []).map((id) => id.replace(/[{}]/g, '').toLowerCase());
        const rows = (dataset.sortedRecordIds ?? []).map((id) => {
            const record = dataset.records[id];
            const read = (c: typeof parent): unknown =>
                c
                    ? {
                          value: describe(record.getValue(c.name)),
                          formatted: record.getFormattedValue(c.name),
                          targetLoaded: bare(record.getValue(c.name)) === null ? null : ids.indexOf(bare(record.getValue(c.name)) as string) >= 0,
                      }
                    : '(role not bound)';

            return {
                id,
                title: title ? record.getFormattedValue(title.name) : null,
                start: start ? describe(record.getValue(start.name)) : null,
                parent: read(parent),
                dependsOn: read(dependsOn),
            };
        });

        log(`${label} — ${rows.length} rows, first dataset object: ${dataset === firstDataset}`, rows);

        return rows;
    };

    const firstDataset = latest();

    // G1, G6 and the context the rest rests on.
    {
        const context = latestContext();
        const dataset = latest();

        log('G1 columns', (dataset.columns ?? []).map((c) => ({ alias: c.alias, name: c.name, dataType: c.dataType, order: c.order, isHidden: (c as { isHidden?: unknown }).isHidden })));
        log('G1 target entity / title / view', { target: dataset.getTargetEntityType(), title: dataset.getTitle(), viewId: typeof dataset.getViewId === 'function' ? dataset.getViewId() : '(none)' });
        log('G6 timelineSpan', describe((context.parameters as unknown as Record<string, { raw?: unknown; type?: unknown }>).timelineSpan));
        log('context', {
            version: VERSION,
            contextInfo: describe((context.mode as unknown as { contextInfo?: unknown }).contextInfo),
            pageSize: dataset.paging.pageSize,
            hasNextPage: dataset.paging.hasNextPage,
            totalResultCount: dataset.paging.totalResultCount,
            filter: describe(dataset.filtering?.getFilter?.()),
        });
        lookups();
    }

    /** G4: a record-route move a day later, then the lookups on the passes after the save. */
    const moveDay = async (id: string): Promise<void> => {
        const dataset = latest();
        const start = column(dataset, ROLES.start);
        const end = column(dataset, ROLES.end);
        const record = dataset.records[id] as unknown as EditableRecord & ComponentFramework.PropertyHelper.DataSetApi.EntityRecord;

        if (!start || !record) {
            log('G4 moveDay', 'no such record or no start role');

            return;
        }

        const context = latestContext();
        const offset = (date: Date): number => context.userSettings.getTimeZoneOffsetMinutes(date);
        const fromStart = wallOf(record.getValue(start.name), 'userlocal', offset) as Wall;
        const fromEnd = end ? wallOf(record.getValue(end.name), 'userlocal', offset) : null;

        saved.set(id, { start: record.getValue(start.name), end: end ? record.getValue(end.name) : null });
        record.setValue(start.name, dateForWrite(shiftDays(fromStart, 1), false));

        if (end && fromEnd) {
            record.setValue(end.name, dateForWrite(shiftDays(fromEnd, 1), false));
        }

        try {
            log('G4 save resolved', describe(await record.save()));
        } catch (error) {
            log('G4 save refused', String(error));

            return;
        }

        for (const at of [0, 5000, 15000]) {
            await wait(at === 0 ? 0 : at === 5000 ? 5000 : 10000);
            const row = lookups(`G4 +${at / 1000}s after the save`).find((r) => (r as { id: string }).id === id.replace(/[{}]/g, '').toLowerCase());

            log(`G4 +${at / 1000}s the moved row`, row ?? '(not loaded)');
        }
    };

    const saved = new Map<string, { start: unknown; end: unknown }>();

    /** Put a moved record back exactly, through the Web API (instants, not wall clocks). */
    const restore = async (id: string): Promise<void> => {
        const before = saved.get(id);
        const dataset = latest();
        const start = column(dataset, ROLES.start);
        const end = column(dataset, ROLES.end);

        if (!before || !start) {
            log('restore', 'nothing saved for that id');

            return;
        }

        const body: Record<string, unknown> = { [start.name]: before.start };

        if (end) {
            body[end.name] = before.end;
        }

        await latestContext().webAPI.updateRecord(dataset.getTargetEntityType(), id, body);
        log('restore', { id, body });
    };

    /** G5: the window over `first`..`last` (yyyy-MM-dd), every page loaded, against a Web API count under the same parent. */
    const span = async (first: string, last: string, parentLookup = 'cll_accountid'): Promise<void> => {
        const dataset = latest();
        const start = column(dataset, ROLES.start);
        const end = column(dataset, ROLES.end);
        const from = wallFromKey(first);
        const to = wallFromKey(last);

        if (!start || !from || !to) {
            log('G5 span', 'no start role or a bad day');

            return;
        }

        dataset.filtering.setFilter(windowFilter(start.name, end?.name ?? null, from, to) as unknown as ComponentFramework.PropertyHelper.DataSetApi.FilterExpression);
        dataset.paging.reset();
        dataset.refresh();

        const counts: { at: string; loaded: number; hasNextPage: boolean }[] = [];

        await wait(5000);

        for (let page = 0; page < 40; page += 1) {
            const now = latest();

            counts.push({ at: `page ${page + 1}`, loaded: (now.sortedRecordIds ?? []).length, hasNextPage: now.paging.hasNextPage });

            if (!now.paging.hasNextPage) {
                break;
            }

            now.paging.loadNextPage();
            await wait(4000);
        }

        await wait(10000);
        counts.push({ at: '+10s after the last page', loaded: (latest().sortedRecordIds ?? []).length, hasNextPage: latest().paging.hasNextPage });

        const info = (latestContext().mode as unknown as { contextInfo?: { entityId?: string } }).contextInfo;
        const parentId = (info?.entityId ?? '').replace(/[{}]/g, '');
        const endName = end?.name;
        const filter = [
            `_${parentLookup}_value eq ${parentId}`,
            `Microsoft.Dynamics.CRM.OnOrBefore(PropertyName='${start.name}',PropertyValue='${dayKey(to)}')`,
            endName ? `(Microsoft.Dynamics.CRM.OnOrAfter(PropertyName='${endName}',PropertyValue='${dayKey(from)}') or ${endName} eq null)` : null,
        ]
            .filter(Boolean)
            .join(' and ');
        let api: unknown;

        try {
            const answer = await latestContext().webAPI.retrieveMultipleRecords(dataset.getTargetEntityType(), `?$select=${start.name}&$filter=${filter}`);

            api = answer.entities.length;
        } catch (error) {
            api = `refused: ${String(error)}`;
        }

        log('G5 span', { first, last, counts, webApiCount: api, filter });
    };

    w.__pcfCalendarViewProbe = { version: VERSION, lookups: () => lookups(), moveDay, restore, span };
    log('installed', `window.__pcfCalendarViewProbe — lookups(), moveDay(id), restore(id), span(first, last)`);
}
