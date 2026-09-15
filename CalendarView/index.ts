import * as React from 'react';
import { IInputs, IOutputs } from './generated/ManifestTypes';
import { CalendarViewControl, IProps, Metadata, Row } from './components/CalendarViewControl';
import {
    Behavior,
    ROLES,
    Wall,
    behaviorOf,
    dateForWrite,
    dayKey,
    formParameterDay,
    formatOf,
    optionColors,
    shiftDays,
    valueForApi,
    wallOf,
    windowFilter,
} from './components/calendar';

type DataSet = ComponentFramework.PropertyTypes.DataSet;
type Column = ComponentFramework.PropertyHelper.DataSetApi.Column;

/**
 * The write half of a dataset record, which the type definitions do not
 * declare and a model-driven host supplies.
 *
 * Measured on a real subgrid by `pcf-data-table` (text, number, **date** and
 * Choice cells, 2026-09-11): `setValue` then one `save()` commits, needs no
 * `<uses-feature>` and so no install-time prompt, and is the route that
 * exists on a host where `webAPI` does not. **`setValue` returns
 * `undefined`** — chaining `.then` off it is a synchronous `TypeError`
 * outside every `.catch`. **`isEditable` is a Promise**, so an unawaited call
 * is truthy for every column.
 */
interface EditableRecord {
    setValue(columnName: string, value: unknown): unknown;
    save(): Promise<unknown>;
    isEditable(columnName: string): Promise<boolean> | boolean;
}

/** The record as something that can be written to, or `null`. Detected on the three methods actually called. */
function editableRecord(record: unknown): EditableRecord | null {
    const candidate = record as EditableRecord | undefined;

    return candidate
        && typeof candidate.setValue === 'function'
        && typeof candidate.save === 'function'
        && typeof candidate.isEditable === 'function'
        ? candidate
        : null;
}

type FormOpener = (options: Record<string, unknown>, parameters?: Record<string, string>) => Promise<unknown>;

/**
 * `navigation.openForm`, or `null` on a host without one. The bag is typed
 * non-optional and its members go missing one at a time — canvas has the
 * bag and not this method — so the method is what is checked.
 */
function formOpener(context: ComponentFramework.Context<IInputs>): FormOpener | null {
    const navigation = (context as { navigation?: { openForm?: unknown } }).navigation;

    return navigation && typeof navigation.openForm === 'function'
        ? (navigation.openForm as FormOpener).bind(navigation)
        : null;
}

/** `mode.contextInfo` — untyped, the parent record on a form subgrid; absent on a main grid. */
function parentReference(
    context: ComponentFramework.Context<IInputs>,
): { entityType: string; id: string } | null {
    const info = (context.mode as { contextInfo?: { entityTypeName?: unknown; entityId?: unknown } })
        .contextInfo;

    return info && typeof info.entityTypeName === 'string' && typeof info.entityId === 'string'
        ? { entityType: info.entityTypeName, id: info.entityId }
        : null;
}

/** A GUID as the outputs spell it: unbraced, lower-case. `openForm` resolves it braced and upper-case. */
function bareGuid(raw: unknown): string | null {
    if (typeof raw !== 'string') {
        return null;
    }

    const trimmed = raw.trim().replace(/^\{|\}$/g, '').toLowerCase();

    return /^[0-9a-f-]{36}$/.test(trimmed) ? trimmed : null;
}

/** The platform's ceiling on a page. Not in the type definitions. */
const MAX_PAGE_SIZE = 250;

/**
 * The user's zone, as a function of the date, because DST is per date.
 *
 * `getTimeZoneOffsetMinutes(date)` is the platform's sign — minutes ahead of
 * UTC, `-300` for UTC-5 — and **the bare call answers the standard offset**
 * even on a day in daylight time (measured, `pcf-date-range-picker`). A host
 * without the method, which is the demo harness, falls back to the browser's
 * own zone, sign flipped to match.
 */
function userOffsetOf(context: ComponentFramework.Context<IInputs>): (date: Date) => number {
    const settings = context.userSettings as { getTimeZoneOffsetMinutes?: (date?: Date) => number } | undefined;

    if (settings && typeof settings.getTimeZoneOffsetMinutes === 'function') {
        const read = settings.getTimeZoneOffsetMinutes.bind(settings);

        return (date: Date): number => {
            const offset = read(date);

            return typeof offset === 'number' && Number.isFinite(offset) ? offset : -date.getTimezoneOffset();
        };
    }

    return (date: Date): number => -date.getTimezoneOffset();
}

/**
 * A Dataverse view as a calendar.
 *
 * Everything that talks to the platform lives in this file. The component
 * never sees `context` or the dataset — every call reaches it as a callback
 * prop, so the whole platform surface can be read against the type
 * definitions in one pass.
 *
 * Three things shape the rest of this class.
 *
 * **The visible range is a server-side filter.** A month is a window, and a
 * view is not a month: it holds every appointment there is. So the component
 * tells this control what it is showing, the control asks the dataset for
 * exactly that — `setFilter` → `paging.reset()` → `refresh()`, guarded on the
 * window actually changing — and a month with more records than a page shows
 * a Load more. Where the host has no `filtering`, or the date operators are
 * not honoured, the calendar shows whatever the view loaded and says so.
 *
 * **This control writes.** Moving an event writes the start column (and the
 * end, shifted by the same days) — through the record where the record
 * allows it, through `webAPI.updateRecord` where it does not — and the event
 * moves on screen before the write resolves. `pending` holds what this
 * control has asserted and not yet seen confirmed, `reconcile()` retires
 * entries as the data catches up, and the `.catch()` puts an event back.
 *
 * **A date's meaning is decided by metadata that arrives late.** Whether a
 * value is a whole day or an instant in the user's zone is the column's
 * `Behavior`, read through `getEntityMetadata`, which is asynchronous where
 * `updateView` is not. So the component fetches it through `loadMetadata`
 * and holds it in React state, the way `pcf-kanban-board` holds its lanes;
 * this control keeps a copy for the writes. Until it lands, and on a host
 * with no `utils`, the value's own shape decides.
 */
export class CalendarView implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private notifyOutputChanged!: () => void;
    private selectedDate = '';
    private openedRecordId = '';
    private movedRecordId = '';
    private createdRecordId = '';

    /** The page size this control has already asked the platform for. See `applyPageSize`. */
    private appliedPageSize = 0;

    /** The window last sent to `setFilter`, as `first|last`, so a repaint never re-fetches. */
    private appliedRange = '';

    /** Column behaviours and option colours, once `loadMetadata` has resolved. */
    private metadata: Metadata | null = null;

    /** Moves asserted locally and not yet confirmed: record id → the day key the start now sits on. */
    private readonly pending = new Map<string, { start: Wall; end: Wall | null }>();

    /** Events with a write in flight, so the component can show them as busy. */
    private readonly moving = new Set<string>();

    private moveError: string | null = null;

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
    ): void {
        // No container: a virtual control never receives one.
        this.notifyOutputChanged = notifyOutputChanged;

        // Without this `allocatedWidth` is -1 forever; with it the month grid
        // can decide between seven columns and a stacked layout.
        if (typeof context.mode.trackContainerResize === 'function') {
            context.mode.trackContainerResize(true);
        }
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const dataset = context.parameters.records;

        this.applyPageSize(context, dataset);

        const start = this.roleColumn(dataset, ROLES.start);
        const end = this.roleColumn(dataset, ROLES.end);
        const title = this.roleColumn(dataset, ROLES.title);
        const color = this.roleColumn(dataset, ROLES.color);
        const userOffset = userOffsetOf(context);

        this.reconcile(dataset, start, end, userOffset);

        const getString = (id: string): string => context.resources.getString(id);
        const names = (context.userSettings as { dateFormattingInfo?: IProps['names'] } | undefined)?.dateFormattingInfo;
        const view = context.parameters.defaultView.raw;

        const props: IProps = {
            rows: this.rows(dataset, start, end, title, color),
            startFormat: formatOf(start?.dataType),
            endFormat: formatOf(end?.dataType),
            hasStart: start !== undefined,
            hasTitle: title !== undefined,
            hasEnd: end !== undefined,
            hasColor: color !== undefined,
            canFilter: typeof dataset.filtering?.setFilter === 'function',
            canMove: (context.parameters.allowMove.raw ?? true) && this.canWrite(context, dataset),
            canCreate: (context.parameters.allowCreate.raw ?? true) && formOpener(context) !== null,
            openOnEventClick: context.parameters.openOnEventClick.raw ?? true,
            showTimes: context.parameters.showTimes.raw ?? true,
            defaultView: view === 'week' ? 'week' : 'month',
            weekStart: context.parameters.weekStart.raw,
            moving: [...this.moving],
            moveError: this.moveError,
            loading: dataset.loading,
            error: dataset.error,
            errorMessage: dataset.errorMessage,
            hasNextPage: dataset.paging.hasNextPage,
            loadedCount: (dataset.sortedRecordIds ?? []).length,
            allocatedWidth: context.mode.allocatedWidth > 0 ? context.mode.allocatedWidth : null,
            visible: context.mode.isVisible,
            disabled: context.mode.isControlDisabled,
            isRTL: context.userSettings.isRTL,
            theme: context.fluentDesignLanguage?.tokenTheme,
            title: dataset.getTitle(),
            names,
            userOffset,
            getString,
            metadataKey: start ? `${dataset.getTargetEntityType()}:${start.name}:${end?.name ?? ''}:${color?.name ?? ''}` : '',
            loadMetadata: this.metadataLoader(context, dataset, start, end, color),
            today: dayKey(this.todayWall(userOffset)),
            initialDay: (context.parameters.initialDate.raw ?? '').trim(),
            onRangeChange: (first: Wall, last: Wall): void => this.applyRange(dataset, start, end, first, last),
            onMove: (recordId: string, days: number): void => this.moveEvent(context, dataset, recordId, days),
            onSelectDay: (day: Wall): void => this.selectDay(day),
            onCreate: (day: Wall): void => this.createEvent(context, dataset, day),
            onOpenRecord: (id: string): void => this.openRecord(dataset, id),
            onLoadMore: (): void => this.loadMore(dataset),
        };

        return React.createElement(CalendarViewControl, props);
    }

    /** Every output, and the empty string rather than `undefined` — which would mean "no change". */
    public getOutputs(): IOutputs {
        return {
            selectedDate: this.selectedDate,
            movedRecordId: this.movedRecordId,
            openedRecordId: this.openedRecordId,
            createdRecordId: this.createdRecordId,
        };
    }

    public destroy(): void {
        // The platform unmounts the React tree for a virtual control, and this
        // control holds no listeners, timers or observers of its own.
    }

    /** A `property-set` column, found by **alias**; read off the record by `name`. */
    private roleColumn(dataset: DataSet, alias: string): Column | undefined {
        return (dataset.columns ?? []).find((column) => column.alias === alias);
    }

    /** Today in the user's zone — the day the calendar opens on and highlights. */
    private todayWall(userOffset: (date: Date) => number): Wall {
        const now = new Date();
        const shifted = new Date(now.getTime() + userOffset(now) * 60_000);

        return {
            year: shifted.getUTCFullYear(),
            month: shifted.getUTCMonth(),
            day: shifted.getUTCDate(),
            hour: 0,
            minute: 0,
        };
    }

    /**
     * Whether this host can be written to at all — by either route. The
     * record's own write half is checked first, on the first loaded record,
     * because it costs nothing; `webAPI` is typed as always present and is
     * not, so the optional access is deliberately narrower than the type.
     */
    private canWrite(context: ComponentFramework.Context<IInputs>, dataset: DataSet): boolean {
        const firstId = (dataset.sortedRecordIds ?? [])[0];

        if (firstId !== undefined && editableRecord(dataset.records[firstId]) !== null) {
            return true;
        }

        return typeof context.webAPI?.updateRecord === 'function';
    }

    /** Ask for a new page size, but only when it actually changed. Unset, adopt the host's and never call `setPageSize`. */
    private applyPageSize(context: ComponentFramework.Context<IInputs>, dataset: DataSet): void {
        const raw = context.parameters.pageSize.raw;

        if (raw === null || raw === undefined) {
            this.appliedPageSize = dataset.paging.pageSize > 0 ? dataset.paging.pageSize : 0;

            return;
        }

        const wanted = Math.min(Math.max(Math.trunc(raw), 1), MAX_PAGE_SIZE);

        if (wanted === this.appliedPageSize) {
            return;
        }

        const previous = this.appliedPageSize;

        this.appliedPageSize = wanted;
        dataset.paging.setPageSize(wanted);

        if (previous > 0) {
            dataset.paging.reset();
        }

        dataset.refresh();
    }

    /**
     * Fetch the window the component is showing.
     *
     * `setFilter` records, `refresh()` fetches, and the two are one round
     * trip — never two refreshes in a row, because a second in flight is
     * dropped (measured, `pcf-data-table`). Guarded on the window changing,
     * because the component reports its range from an effect that runs on
     * every mount, and a control that re-fetched on each would loop through
     * the `updateView` the refresh itself triggers.
     *
     * Called from an effect, never from `updateView`.
     */
    private applyRange(dataset: DataSet, start: Column | undefined, end: Column | undefined, first: Wall, last: Wall): void {
        const filtering = dataset.filtering;

        if (!start || !filtering || typeof filtering.setFilter !== 'function') {
            return;
        }

        const key = `${dayKey(first)}|${dayKey(last)}`;

        if (key === this.appliedRange) {
            return;
        }

        this.appliedRange = key;
        filtering.setFilter(windowFilter(start.name, end?.name ?? null, first, last) as unknown as ComponentFramework.PropertyHelper.DataSetApi.FilterExpression);
        dataset.paging.reset();
        dataset.refresh();
    }

    /**
     * Drop the overrides the data has caught up with: the record now reports
     * the day this control asked for, or has left the view — which is what a
     * window filter does to an event dragged out of the month.
     *
     * Reads only. Called from `updateView`, so a mutator here would loop.
     */
    private reconcile(dataset: DataSet, start: Column | undefined, end: Column | undefined, userOffset: (date: Date) => number): void {
        if (this.pending.size === 0 || !start) {
            return;
        }

        for (const [id, wanted] of [...this.pending]) {
            const record = dataset.records[id];

            if (!record) {
                this.pending.delete(id);
                continue;
            }

            const behavior = this.metadata?.startBehavior ?? 'unknown';
            const actual = wallOf(record.getValue(start.name), behavior, userOffset);

            if (actual && dayKey(actual) === dayKey(wanted.start)) {
                this.pending.delete(id);
            }
        }
    }

    /**
     * Every loaded record as a row the component turns into an event, with
     * any pending move applied as a `Date` the reader takes as-is.
     *
     * The raw values are handed over unread: which day they mean depends on
     * metadata the component may not have yet, so the conversion happens
     * there, once per render, against whatever it knows.
     */
    private rows(
        dataset: DataSet,
        start: Column | undefined,
        end: Column | undefined,
        title: Column | undefined,
        color: Column | undefined,
    ): Row[] {
        if (!start || !title) {
            return [];
        }

        const built: Row[] = [];

        for (const id of dataset.sortedRecordIds ?? []) {
            const record = dataset.records[id];

            if (!record) {
                continue;
            }

            const override = this.pending.get(id);

            built.push({
                id,
                title: record.getFormattedValue(title.name),
                start: override ? dateForWrite(override.start, false) : record.getValue(start.name),
                end: end ? (override ? (override.end ? dateForWrite(override.end, false) : null) : record.getValue(end.name)) : null,
                colorValue: color ? record.getValue(color.name) : null,
                colorLabel: color ? record.getFormattedValue(color.name) : null,
            });
        }

        return built;
    }

    /**
     * A function the component can call to read the columns' metadata, or
     * `null` when there is nothing to read — no `utils`, which is canvas.
     *
     * Handed over rather than resolved here: `getEntityMetadata` is
     * asynchronous and `updateView` is not, and `notifyOutputChanged()` does
     * not repaint a control whose outputs did not change. The component holds
     * the answer in state; this control keeps a copy for the writes.
     */
    private metadataLoader(
        context: ComponentFramework.Context<IInputs>,
        dataset: DataSet,
        start: Column | undefined,
        end: Column | undefined,
        color: Column | undefined,
    ): (() => Promise<Metadata>) | null {
        if (!start || typeof context.utils?.getEntityMetadata !== 'function') {
            return null;
        }

        const entity = dataset.getTargetEntityType();
        const columns = [start.name, end?.name, color?.name].filter((name): name is string => typeof name === 'string');

        return (): Promise<Metadata> =>
            context.utils
                .getEntityMetadata(entity, columns)
                .then((metadata: unknown) => {
                    const attributes = (metadata as { Attributes?: { get?: (name: string) => unknown } } | null)?.Attributes;
                    const node = (name: string | undefined): unknown =>
                        name && attributes && typeof attributes.get === 'function' ? attributes.get(name) : undefined;

                    const result: Metadata = {
                        startBehavior: behaviorOf(node(start.name)),
                        endBehavior: behaviorOf(node(end?.name)),
                        colors: optionColors(node(color?.name)),
                    };

                    this.metadata = result;

                    return result;
                })
                .catch((error: unknown) => {
                    console.warn(`CalendarView: could not read metadata for ${entity}. Dates are placed by their shape.`, error);

                    return { startBehavior: 'unknown' as Behavior, endBehavior: 'unknown' as Behavior, colors: new Map<number, string>() };
                });
    }

    /** The day the user chose, as an output a canvas app can filter on. */
    private selectDay(day: Wall): void {
        const key = dayKey(day);

        if (key === this.selectedDate) {
            return;
        }

        this.selectedDate = key;
        this.notifyOutputChanged();
    }

    /**
     * Move an event by whole days, optimistically.
     *
     * The override goes in and the output is notified *before* the write is
     * sent; the `.catch()` takes the override back out. `refresh()` runs
     * either way, from `finally` — on success it is what eventually retires
     * the override, on failure it repaints from data that never changed.
     */
    private moveEvent(
        context: ComponentFramework.Context<IInputs>,
        dataset: DataSet,
        recordId: string,
        days: number,
    ): void {
        const start = this.roleColumn(dataset, ROLES.start);
        const end = this.roleColumn(dataset, ROLES.end);
        const title = this.roleColumn(dataset, ROLES.title);
        const record = dataset.records[recordId];

        if (!start || !record || days === 0 || !this.canWrite(context, dataset)) {
            return;
        }

        const userOffset = userOffsetOf(context);
        const startBehavior = this.metadata?.startBehavior ?? 'unknown';
        const endBehavior = this.metadata?.endBehavior ?? 'unknown';
        const current = this.pending.get(recordId);
        const fromStart = current?.start ?? wallOf(record.getValue(start.name), startBehavior, userOffset);

        if (!fromStart) {
            return;
        }

        const fromEnd = current ? current.end : end ? wallOf(record.getValue(end.name), endBehavior, userOffset) : null;
        const toStart = shiftDays(fromStart, days);
        const toEnd = fromEnd ? shiftDays(fromEnd, days) : null;
        const startAllDay = formatOf(start.dataType) === 'date';
        const endAllDay = end ? formatOf(end.dataType) === 'date' : false;

        const label = title ? record.getFormattedValue(title.name) : recordId;

        this.pending.set(recordId, { start: toStart, end: toEnd });
        this.moving.add(recordId);
        this.moveError = null;
        this.movedRecordId = recordId;
        this.selectedDate = dayKey(toStart);
        this.notifyOutputChanged();

        const writes: { column: string; wall: Wall; behavior: Behavior; allDay: boolean }[] = [
            { column: start.name, wall: toStart, behavior: startBehavior, allDay: startAllDay },
        ];

        if (end && toEnd) {
            writes.push({ column: end.name, wall: toEnd, behavior: endBehavior, allDay: endAllDay });
        }

        void this.write(context, dataset, record, recordId, writes, userOffset)
            .catch((error: unknown) => {
                this.pending.delete(recordId);
                this.moveError = `${context.resources
                    .getString('CalendarView_MoveFailed')
                    .replace('{0}', label)} ${this.describe(error)}`;
                this.notifyOutputChanged();
            })
            .finally(() => {
                this.moving.delete(recordId);
                dataset.refresh();
            });
    }

    /**
     * The write itself, by whichever route this record allows.
     *
     * **Two routes, chosen per record.** `record.isEditable(startColumn)`
     * decides: `true` and every column goes through `setValue` + one
     * `save()`; `false`, or no write half at all, and the whole change goes
     * through one `webAPI.updateRecord` with the values spelled the Web API's
     * way. Never half and half — an end column written by one route and a
     * start by the other is two round trips that can disagree.
     *
     * `Promise.resolve().then(...)` rather than chaining off `setValue`,
     * which returns `undefined`.
     */
    private write(
        context: ComponentFramework.Context<IInputs>,
        dataset: DataSet,
        record: unknown,
        recordId: string,
        writes: { column: string; wall: Wall; behavior: Behavior; allDay: boolean }[],
        userOffset: (date: Date) => number,
    ): Promise<unknown> {
        const editable = editableRecord(record);
        const api = context.webAPI;
        const viaApi = (): Promise<unknown> => {
            if (typeof api?.updateRecord !== 'function') {
                return Promise.reject(new Error(context.resources.getString('CalendarView_ReadOnly')));
            }

            const body: Record<string, string> = {};

            for (const entry of writes) {
                body[entry.column] = valueForApi(entry.wall, entry.behavior, entry.allDay, userOffset);
            }

            return api.updateRecord(dataset.getTargetEntityType(), recordId, body);
        };

        if (!editable) {
            return viaApi();
        }

        return Promise.resolve()
            .then(() => editable.isEditable(writes[0].column))
            .then((allowed) => {
                if (allowed !== true) {
                    return viaApi();
                }

                for (const entry of writes) {
                    editable.setValue(entry.column, dateForWrite(entry.wall, entry.allDay));
                }

                return editable.save();
            });
    }

    /**
     * Open the quick create form for a new event on a day, and report the
     * row it made.
     *
     * The day goes as a **form parameter** — the second argument, typed
     * `{ [key: string]: string }` — which is how a quick create arrives with
     * a column already set. `createFromEntity` seeds the parent so the row
     * lands in this subgrid. A dismissed form resolves
     * `{ savedEntityReference: null }`, so every read below is optional.
     */
    private createEvent(context: ComponentFramework.Context<IInputs>, dataset: DataSet, day: Wall): void {
        const open = formOpener(context);
        const start = this.roleColumn(dataset, ROLES.start);

        if (!open || !start) {
            return;
        }

        this.selectDay(day);

        const parent = parentReference(context);
        const options: Record<string, unknown> = {
            entityName: dataset.getTargetEntityType(),
            useQuickCreateForm: true,
        };

        if (parent) {
            options.createFromEntity = { entityType: parent.entityType, id: parent.id };
        }

        void Promise.resolve()
            .then(() => open(options, { [start.name]: formParameterDay(day) }))
            .then((result) => {
                const saved = (result as { savedEntityReference?: { id?: unknown }[] | null } | undefined)
                    ?.savedEntityReference;
                const id = bareGuid(saved?.[0]?.id);

                if (id === null) {
                    return;
                }

                this.createdRecordId = id;
                this.notifyOutputChanged();
                dataset.refresh();
            })
            .catch((error: unknown) => {
                console.warn('[CalendarView] create failed', error);
            });
    }

    /** A rejected platform call is not reliably an `Error`; take a message where there is one. */
    private describe(error: unknown): string {
        if (typeof error === 'object' && error !== null && 'message' in error) {
            return String((error as { message: unknown }).message);
        }

        return String(error);
    }

    /** `loadNextPage()` with **no argument**, so `sortedRecordIds` accumulates and the month fills in. */
    private loadMore(dataset: DataSet): void {
        if (!dataset.paging.hasNextPage) {
            return;
        }

        dataset.paging.loadNextPage();
    }

    /** Notify before opening, so the output is observable even where `openDatasetItem` does nothing. */
    private openRecord(dataset: DataSet, id: string): void {
        const record = dataset.records[id];

        if (!record) {
            return;
        }

        this.openedRecordId = id;
        this.notifyOutputChanged();
        dataset.openDatasetItem(record.getNamedReference());
    }
}
