/*
 * THE 0.0.1 PROBE. Deleted before the real build; not part of the control.
 *
 * Installed once from `updateView` on the first pass that carries records. It
 * logs, passively, the shapes the control rests on, and hangs
 * `window.__calendarViewProbe` on the page with the four active questions in
 * SPEC.md. Run from the browser console on the live form and paste the output.
 *
 * Nothing here is reachable from the component. Everything reads the same
 * `context` the control does.
 */
import { IInputs } from './generated/ManifestTypes';
import { Behavior, ROLES, Wall, behaviorOf, dayKey, valueForApi, wallOf, windowFilter } from './components/calendar';

type DataSet = ComponentFramework.PropertyTypes.DataSet;

const TAG = '[CalendarView probe]';

function log(label: string, value: unknown): void {
    let text: string;

    try {
        text = JSON.stringify(value, null, 2);
    } catch {
        text = String(value);
    }

    console.log(`${TAG} ${label}\n${text}`);
}

function describeShape(value: unknown, depth = 0): unknown {
    if (depth > 2 || value === null || typeof value !== 'object') {
        return typeof value === 'function' ? 'function' : value;
    }

    if (Array.isArray(value)) {
        return value.slice(0, 3).map((item) => describeShape(item, depth + 1));
    }

    const out: Record<string, unknown> = {};

    for (const key of Object.keys(value as object).slice(0, 40)) {
        out[key] = describeShape((value as Record<string, unknown>)[key], depth + 1);
    }

    return out;
}

export function installProbe(context: ComponentFramework.Context<IInputs>, dataset: DataSet): void {
    const w = window as unknown as { __calendarViewProbe?: unknown };

    if (w.__calendarViewProbe) {
        return;
    }

    const column = (alias: string): { name: string; dataType: string } | undefined =>
        (dataset.columns ?? []).find((c) => c.alias === alias);
    const start = column(ROLES.start);
    const end = column(ROLES.end);
    const color = column(ROLES.color);
    const entity = dataset.getTargetEntityType();
    const firstId = (dataset.sortedRecordIds ?? [])[0];
    const first = firstId ? dataset.records[firstId] : undefined;
    const settings = context.userSettings as unknown as {
        getTimeZoneOffsetMinutes?: (d?: Date) => number;
        dateFormattingInfo?: Record<string, unknown>;
    };

    // ---- passive ---------------------------------------------------------

    log('P0 columns', (dataset.columns ?? []).map((c) => ({ alias: c.alias, name: c.name, dataType: c.dataType })));
    log('P1 first record raw dates', first && start
        ? {
            id: firstId,
            start: first.getValue(start.name),
            startFormatted: first.getFormattedValue(start.name),
            end: end ? first.getValue(end.name) : '(no end role)',
            endFormatted: end ? first.getFormattedValue(end.name) : '(no end role)',
            color: color ? first.getValue(color.name) : '(no colour role)',
            writeHalf: {
                setValue: typeof (first as unknown as { setValue?: unknown }).setValue,
                save: typeof (first as unknown as { save?: unknown }).save,
                isEditable: typeof (first as unknown as { isEditable?: unknown }).isEditable,
            },
        }
        : 'no records yet');
    log('P2 userSettings', {
        offsetDated: settings.getTimeZoneOffsetMinutes?.(new Date()),
        offsetBare: settings.getTimeZoneOffsetMinutes?.(),
        browserOffset: -new Date().getTimezoneOffset(),
        firstDayOfWeek: settings.dateFormattingInfo?.firstDayOfWeek,
        shortTimePattern: settings.dateFormattingInfo?.shortTimePattern,
        shortDatePattern: settings.dateFormattingInfo?.shortDatePattern,
        abbreviatedDayNames: settings.dateFormattingInfo?.abbreviatedDayNames,
    });
    log('P3 filtering / paging', {
        hasFiltering: typeof dataset.filtering?.setFilter,
        currentFilter: dataset.filtering?.getFilter?.(),
        pageSize: dataset.paging.pageSize,
        totalResultCount: dataset.paging.totalResultCount,
        hasNextPage: dataset.paging.hasNextPage,
        contextInfo: (context.mode as { contextInfo?: unknown }).contextInfo,
        hasOpenForm: typeof (context as { navigation?: { openForm?: unknown } }).navigation?.openForm,
        hasWebApi: typeof context.webAPI?.updateRecord,
        hasUtils: typeof context.utils?.getEntityMetadata,
    });

    if (start && typeof context.utils?.getEntityMetadata === 'function') {
        void context.utils.getEntityMetadata(entity, [start.name, end?.name, color?.name].filter((n): n is string => typeof n === 'string'))
            .then((metadata: unknown) => {
                const attributes = (metadata as { Attributes?: { get?: (n: string) => unknown } }).Attributes;
                const node = (name: string | undefined): unknown => (name && attributes?.get ? attributes.get(name) : undefined);
                const startNode = node(start.name) as Record<string, unknown> | undefined;

                log('P4 metadata', {
                    start: startNode ? { Behavior: startNode.Behavior, Format: startNode.Format, AttributeType: startNode.AttributeType, AttributeTypeName: startNode.AttributeTypeName, keys: Object.keys(startNode) } : 'no node',
                    startBehaviorRead: behaviorOf(startNode),
                    end: end ? describeShape(node(end.name)) : '(none)',
                    colorDescriptor: color ? describeShape((node(color.name) as { attributeDescriptor?: { OptionSet?: unknown } } | undefined)?.attributeDescriptor?.OptionSet) : '(none)',
                });
            })
            .catch((error: unknown) => log('P4 metadata FAILED', String(error)));
    }

    // ---- active ----------------------------------------------------------

    const userOffset = (d: Date): number => settings.getTimeZoneOffsetMinutes?.(d) ?? -d.getTimezoneOffset();
    const wallFromKey = (key: string): Wall => {
        const [y, m, d] = key.split('-').map(Number);

        return { year: y, month: m - 1, day: d, hour: 0, minute: 0 };
    };

    const probe = {
        help: 'window(first,last) | windowFlat(first,last) | clear() | tryCreate("iso"|"us"|"short"|"long") | moveViaApi(id, days) | readBack(id) | dump()',

        /** Q2/Q3: the nested window expression, then the count after 15 s. */
        window(firstKey: string, lastKey: string): string {
            if (!start || !dataset.filtering) {
                return 'no start column or no filtering';
            }

            const expression = windowFilter(start.name, end?.name ?? null, wallFromKey(firstKey), wallFromKey(lastKey));

            log('Q2 sending nested window', expression);
            dataset.filtering.setFilter(expression as unknown as ComponentFramework.PropertyHelper.DataSetApi.FilterExpression);
            dataset.paging.reset();
            dataset.refresh();
            this.countLater('Q2 nested window after 15s');

            return 'sent — wait 15 s';
        },

        /** Q2 control: the same window without the nested Or. */
        windowFlat(firstKey: string, lastKey: string): string {
            if (!start || !dataset.filtering) {
                return 'no start column or no filtering';
            }

            const expression = windowFilter(start.name, null, wallFromKey(firstKey), wallFromKey(lastKey));

            log('Q2 sending flat window', expression);
            dataset.filtering.setFilter(expression as unknown as ComponentFramework.PropertyHelper.DataSetApi.FilterExpression);
            dataset.paging.reset();
            dataset.refresh();
            this.countLater('Q2 flat window after 15s');

            return 'sent — wait 15 s';
        },

        clear(): string {
            dataset.filtering?.clearFilter();
            dataset.paging.reset();
            dataset.refresh();
            this.countLater('cleared, after 15s');

            return 'cleared — wait 15 s';
        },

        countLater(label: string): void {
            window.setTimeout(() => {
                log(label, {
                    loaded: (dataset.sortedRecordIds ?? []).length,
                    totalResultCount: dataset.paging.totalResultCount,
                    error: dataset.error,
                    errorMessage: dataset.errorMessage,
                    ids: (dataset.sortedRecordIds ?? []).slice(0, 20),
                    days: (dataset.sortedRecordIds ?? []).slice(0, 20).map((id) => start ? dataset.records[id]?.getValue(start.name) : null),
                });
            }, 15_000);
        },

        /** Q1: the quick create with the start column preset in one of four spellings. */
        tryCreate(format: 'iso' | 'us' | 'short' | 'long', dayKeyText = '2026-09-20'): string {
            const navigation = (context as { navigation?: { openForm?: (o: unknown, p: unknown) => Promise<unknown> } }).navigation;

            if (!start || !navigation?.openForm) {
                return 'no start column or no openForm';
            }

            const [y, m, d] = dayKeyText.split('-');
            const values: Record<string, string> = {
                iso: `${y}-${m}-${d}`,
                us: `${m}/${d}/${y.slice(2)}`,
                short: `${m}/${d}/${y}`,
                long: `${m}/${d}/${y} 12:00 PM`,
            };
            const info = (context.mode as { contextInfo?: { entityTypeName?: string; entityId?: string } }).contextInfo;
            const options: Record<string, unknown> = { entityName: entity, useQuickCreateForm: true };

            if (info?.entityTypeName && info.entityId) {
                options.createFromEntity = { entityType: info.entityTypeName, id: info.entityId };
            }

            const parameters = { [start.name]: values[format] };

            log(`Q1 openForm (${format})`, { options, parameters });
            navigation.openForm(options, parameters)
                .then((result) => log(`Q1 openForm (${format}) resolved`, result))
                .catch((error: unknown) => log(`Q1 openForm (${format}) REJECTED`, String(error)));

            return `opened with ${JSON.stringify(parameters)} — is the day preset?`;
        },

        /** Q4: force the Web API route for a move, then read the record back. */
        moveViaApi(id: string, days: number, behavior: Behavior = 'unknown'): string {
            const record = dataset.records[id];
            const api = context.webAPI;

            if (!record || !start || typeof api?.updateRecord !== 'function') {
                return 'no record, no start column or no webAPI';
            }

            const fromStart = wallOf(record.getValue(start.name), behavior, userOffset);

            if (!fromStart) {
                return 'start unreadable';
            }

            const shift = (wl: Wall): Wall => {
                const dt = new Date(wl.year, wl.month, wl.day + days, wl.hour, wl.minute);

                return { year: dt.getFullYear(), month: dt.getMonth(), day: dt.getDate(), hour: dt.getHours(), minute: dt.getMinutes() };
            };
            const allDay = start.dataType === 'DateAndTime.DateOnly';
            const body: Record<string, string> = { [start.name]: valueForApi(shift(fromStart), behavior, allDay, userOffset) };

            if (end) {
                const fromEnd = wallOf(record.getValue(end.name), behavior, userOffset);

                if (fromEnd) {
                    body[end.name] = valueForApi(shift(fromEnd), behavior, end.dataType === 'DateAndTime.DateOnly', userOffset);
                }
            }

            log('Q4 updateRecord body', { id, from: dayKey(fromStart), body });
            api.updateRecord(entity, id, body)
                .then((result) => {
                    log('Q4 updateRecord resolved', result);

                    return this.readBack(id);
                })
                .catch((error: unknown) => log('Q4 updateRecord REJECTED', describeShape(error)));

            return 'sent';
        },

        readBack(id: string): Promise<unknown> | string {
            const api = context.webAPI;

            if (!start || typeof api?.retrieveRecord !== 'function') {
                return 'no webAPI';
            }

            const select = [start.name, end?.name].filter((n): n is string => typeof n === 'string').join(',');

            return api.retrieveRecord(entity, id, `?$select=${select}`)
                .then((row) => log('readBack', row))
                .catch((error: unknown) => log('readBack REJECTED', describeShape(error)));
        },

        dump(): void {
            log('dump', {
                loaded: (dataset.sortedRecordIds ?? []).length,
                total: dataset.paging.totalResultCount,
                filter: dataset.filtering?.getFilter?.(),
                firstRaw: first && start ? first.getValue(start.name) : null,
            });
        },
    };

    w.__calendarViewProbe = probe;
    console.log(`${TAG} installed — window.__calendarViewProbe.help`);
}
