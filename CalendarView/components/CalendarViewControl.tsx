import * as React from 'react';
import {
    Button,
    FluentProvider,
    Menu,
    MenuItem,
    MenuList,
    MenuPopover,
    MenuTrigger,
    webLightTheme,
} from '@fluentui/react-components';
import {
    Bar,
    Behavior,
    CalendarEvent,
    DateNames,
    Format,
    View,
    Wall,
    clampResize,
    compareDay,
    compareWall,
    dayKey,
    dayName,
    daysBetween,
    eventsInRange,
    eventsKey,
    eventsOn,
    firstDayOfWeek,
    formatTime,
    isUtcMidnight,
    monthGrid,
    monthName,
    optionValue,
    sameDay,
    shiftDays,
    stepAnchor,
    timelineBar,
    timelineDays,
    visibleRange,
    wallFromKey,
    wallOf,
    weekDays,
    weekday,
} from './calendar';

/** Which end of a bar a resize takes hold of. */
export type Edge = 'start' | 'end';

/** One loaded record, values unread — `index.ts` hands the raw dates over and this file decides what day they mean. */
export interface Row {
    id: string;
    title: string;
    /** The start column's raw value: an ISO string from the platform, or a `Date` for a pending move. */
    start: unknown;
    end: unknown;
    colorValue: unknown;
    colorLabel: string | null;
}

/** What `getEntityMetadata` answered about the bound columns. */
export interface Metadata {
    startBehavior: Behavior;
    endBehavior: Behavior;
    colors: Map<number, string>;
}

export interface IProps {
    rows: Row[];
    startFormat: Format;
    endFormat: Format;
    hasStart: boolean;
    hasTitle: boolean;
    hasEnd: boolean;
    hasColor: boolean;
    /** Whether the host has `dataset.filtering` — without it the calendar shows what the view loaded and says so. */
    canFilter: boolean;
    /** False where the maker turned moving off, or no route on this host can write. */
    canMove: boolean;
    /** False where the maker turned it off, or the host has no `navigation.openForm` — canvas, the demo. */
    canCreate: boolean;
    openOnEventClick: boolean;
    showTimes: boolean;
    defaultView: View;
    weekStart: string | null | undefined;
    moving: string[];
    moveError: string | null;
    loading: boolean;
    error: boolean;
    errorMessage: string;
    hasNextPage: boolean;
    loadedCount: number;
    allocatedWidth: number | null;
    visible: boolean;
    disabled: boolean;
    isRTL: boolean;
    theme?: Record<string, string>;
    title: string;
    names: DateNames | undefined;
    userOffset: (date: Date) => number;
    getString: (id: string) => string;
    /** Identifies the columns being read, so the metadata fetch re-runs only when they change. */
    metadataKey: string;
    loadMetadata: (() => Promise<Metadata>) | null;
    /** Today's day key in the user's zone. */
    today: string;
    /** The maker's `initialDate`, or `''` for today. Read once, at mount. */
    initialDay: string;
    onRangeChange: (first: Wall, last: Wall) => void;
    /** Move the whole event by days — start and end together. */
    onMove: (recordId: string, days: number) => void;
    /** Move one end of it by days, the other held — the timeline's resize. Only offered with an end role bound. */
    onResize: (recordId: string, edge: Edge, days: number) => void;
    onSelectDay: (day: Wall) => void;
    onCreate: (day: Wall) => void;
    onOpenRecord: (id: string) => void;
    onLoadMore: () => void;
}

const NO_METADATA: Metadata = { startBehavior: 'unknown', endBehavior: 'unknown', colors: new Map() };

/** Below this many pixels of the control's own width, the month becomes dots and the + goes. Matches the stylesheet's media query. */
const NARROW_BELOW = 560;

/*
 * Fluent's own 16-px path data — the platform's Fluent build ships no icon
 * set, so the three glyphs a calendar needs are drawn here. Inline SVG rather
 * than a text character: `‹` and `+` sit on the font's baseline, come out a
 * different size in every font the host might set, and were visibly small and
 * off-centre beside a real Button on a form. A path scales with the button
 * and follows `currentColor`.
 */
const ICONS = {
    chevronLeft: 'M10.35 3.15a.5.5 0 0 1 0 .7L6.21 8l4.14 4.15a.5.5 0 0 1-.7.7l-4.5-4.5a.5.5 0 0 1 0-.7l4.5-4.5a.5.5 0 0 1 .7 0Z',
    chevronRight: 'M5.65 3.15a.5.5 0 0 0 0 .7L9.79 8l-4.14 4.15a.5.5 0 0 0 .7.7l4.5-4.5a.5.5 0 0 0 0-.7l-4.5-4.5a.5.5 0 0 0-.7 0Z',
    add: 'M8 2.5a.5.5 0 0 1 .5.5v4.5H13a.5.5 0 0 1 0 1H8.5V13a.5.5 0 0 1-1 0V8.5H3a.5.5 0 0 1 0-1h4.5V3a.5.5 0 0 1 .5-.5Z',
};

function Icon({ path, size }: { path: string; size: number }): React.ReactElement {
    return (
        <svg className="CalendarView-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d={path} fill="currentColor" />
        </svg>
    );
}

/**
 * The columns' metadata, once it arrives.
 *
 * Held in React rather than on the control instance, because the fetch is
 * asynchronous and `updateView` is not: `notifyOutputChanged()` announces
 * changed *outputs*, and reading metadata changes none, so the platform never
 * calls `updateView` again. `setState` has no such condition. Keyed on the
 * columns so switching view refetches and a re-render does not.
 */
function useMetadata(key: string, load: (() => Promise<Metadata>) | null): Metadata {
    const [loaded, setLoaded] = React.useState<Metadata>(NO_METADATA);

    React.useEffect(() => {
        setLoaded(NO_METADATA);

        if (!load) {
            return undefined;
        }

        let alive = true;

        void load().then((metadata) => {
            if (alive) {
                setLoaded(metadata);
            }
        });

        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return loaded;
}

/** How far each end of an event has been shifted, in days. A move shifts both by the same amount; a resize shifts one. */
interface Shift {
    start: number;
    end: number;
}

/**
 * Where this component thinks each event is, over the top of what props say.
 *
 * On a real form the overlay is redundant: `index.ts` applies its own pending
 * move before the platform re-renders. PCFHub's demo harness rebuilds the
 * dataset on every render and never re-reads outputs, so a calendar placing
 * events straight from props would look dead there — every drag accepted,
 * nothing moving. The resync key is the events' *content*.
 */
function useOptimisticMoves(
    events: CalendarEvent[],
): [Record<string, Shift>, (id: string, startDays: number, endDays: number) => void] {
    const [overlay, setOverlay] = React.useState<Record<string, Shift>>({});
    const key = eventsKey(events);

    React.useEffect(() => {
        setOverlay({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const place = React.useCallback((id: string, startDays: number, endDays: number): void => {
        setOverlay((current) => {
            const before = current[id] ?? { start: 0, end: 0 };

            return { ...current, [id]: { start: before.start + startDays, end: before.end + endDays } };
        });
    }, []);

    return [overlay, place];
}

/**
 * An event with its shift applied. An end-only shift on an event that has
 * no end gives it one, measured from its start — which is what dragging the
 * right edge of a one-day bar means.
 */
function shifted(event: CalendarEvent, shift: Shift): CalendarEvent {
    const start = shiftDays(event.start, shift.start);
    const end = event.end
        ? shiftDays(event.end, shift.end)
        : shift.end !== shift.start
            ? shiftDays(event.start, shift.end)
            : null;

    return { ...event, start, end };
}

/** The rows as events, against whatever metadata is known. A row whose start cannot be read is not an event. */
function toEvents(props: IProps, metadata: Metadata): CalendarEvent[] {
    const events: CalendarEvent[] = [];

    for (const row of props.rows) {
        const start = wallOf(row.start, metadata.startBehavior, props.userOffset);

        if (!start) {
            continue;
        }

        let end = props.hasEnd ? wallOf(row.end, metadata.endBehavior, props.userOffset) : null;

        // An end before its start is a data error, and drawing it backwards
        // would place the event on days it never touches.
        if (end && compareWall(end, start) < 0) {
            end = null;
        }

        // A whole day: a date-formatted column, a Date Only behaviour, or —
        // with no metadata to say — a value at UTC midnight, which is how a
        // Date Only column hands its day over and what `wallOf` already
        // placed as one. Without the third case the day is right and the chip
        // says "12:00 AM".
        const allDay =
            props.startFormat === 'date'
            || metadata.startBehavior === 'dateonly'
            || (metadata.startBehavior === 'unknown' && isUtcMidnight(row.start));
        const value = optionValue(row.colorValue);

        events.push({
            id: row.id,
            title: row.title,
            start,
            end,
            allDay,
            badge: props.hasColor && row.colorLabel ? row.colorLabel : null,
            color: value !== null ? metadata.colors.get(value) ?? null : null,
        });
    }

    return events;
}

export function CalendarViewControl(props: IProps): React.ReactElement | null {
    const { getString } = props;
    const metadata = useMetadata(props.metadataKey, props.loadMetadata);
    const firstDay = firstDayOfWeek(props.weekStart, props.names);

    /*
     * The view and the anchor live here and nowhere else — a virtual control
     * cannot push a repaint from outside React, and stepping a month changes
     * no output. The anchor is a day; the view decides what around it shows.
     */
    const [view, setView] = React.useState<View>(props.defaultView);
    const [anchor, setAnchor] = React.useState<Wall>(
        () => wallFromKey(props.initialDay) ?? wallFromKey(props.today) ?? { year: 2026, month: 0, day: 1, hour: 0, minute: 0 },
    );

    /*
     * Re-apply the maker's two inputs when they *change* — not only at mount.
     * On a form they are set at design time and never move; on the hub's demo
     * a preset switch changes them on a mounted control, and a state seeded
     * once from props sat on the old value while the property panel said
     * otherwise. Both effects are no-ops on mount, where state already holds
     * the prop.
     */
    React.useEffect(() => {
        setView(props.defaultView);
    }, [props.defaultView]);

    React.useEffect(() => {
        const wanted = wallFromKey(props.initialDay);

        if (wanted) {
            setAnchor(wanted);
        }
    }, [props.initialDay]);

    /*
     * Narrow is measured, not queried. A viewport media query never fires for
     * a 373px control in a wide window — the hub's phone frame, a narrow form
     * section — and a CSS size container collapses the control under the
     * shrink-to-fit parent a form section is (0.1.3 shipped one and every
     * form showed a sliver). A ResizeObserver on the root reads the width the
     * control actually got and contains nothing. Hosts without the observer
     * keep the media query in the stylesheet.
     */
    const rootRef = React.useRef<HTMLDivElement>(null);
    const [narrow, setNarrow] = React.useState(false);

    React.useEffect(() => {
        const root = rootRef.current;

        if (!root || typeof ResizeObserver !== 'function') {
            return undefined;
        }

        const observer = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? 0;

            setNarrow(width > 0 && width < NARROW_BELOW);
        });

        observer.observe(root);

        return () => observer.disconnect();
    }, []);

    const range = React.useMemo(() => visibleRange(view, anchor, firstDay), [view, anchor, firstDay]);
    const rangeKey = `${dayKey(range.first)}|${dayKey(range.last)}`;

    /*
     * Tell the control what is on screen, so it can fetch it. From an effect
     * and not from render: the callback ends in `refresh()`, which is a
     * mutator, and a mutator during render is the loop `updateView` warns
     * about. `index.ts` guards on the key as well, because this effect also
     * fires on mount and on every remount the platform performs.
     */
    const { onRangeChange } = props;

    React.useEffect(() => {
        onRangeChange(range.first, range.last);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rangeKey]);

    const events = React.useMemo(() => toEvents(props, metadata), [props.rows, props.hasEnd, props.hasColor, props.startFormat, props.userOffset, metadata]); // eslint-disable-line react-hooks/exhaustive-deps
    const [overlay, place] = useOptimisticMoves(events);

    const placed = React.useMemo(
        () => events.map((event) => (event.id in overlay ? shifted(event, overlay[event.id]) : event)),
        [events, overlay],
    );

    const move = (id: string, days: number): void => {
        if (days === 0) {
            return;
        }

        place(id, days, days);
        props.onMove(id, days);
    };

    const resize = (id: string, edge: Edge, days: number): void => {
        if (days === 0 || !props.hasEnd) {
            return;
        }

        place(id, edge === 'start' ? days : 0, edge === 'end' ? days : 0);
        props.onResize(id, edge, days);
    };

    /*
     * The day the user last chose, kept here as well as reported, because the
     * timeline's + has no day cell to sit on: it creates on the selected day
     * when that is in view, else today when that is, else the first day shown.
     */
    const [selected, setSelected] = React.useState<Wall | null>(null);
    const selectDay = (day: Wall): void => {
        setSelected(day);
        props.onSelectDay(day);
    };

    const step = (direction: -1 | 1): void => setAnchor((current) => stepAnchor(view, current, direction));
    const goToday = (): void => {
        const today = wallFromKey(props.today);

        if (today) {
            setAnchor(today);
        }
    };

    const frame = (content: React.ReactElement): React.ReactElement => (
        <FluentProvider theme={props.theme ?? webLightTheme} dir={props.isRTL ? 'rtl' : 'ltr'}>
            <div
                ref={rootRef}
                className={`CalendarView CalendarView--${view}${narrow ? ' CalendarView--narrow' : ''}`}
                style={props.allocatedWidth ? { maxWidth: `${props.allocatedWidth}px` } : undefined}
            >
                {content}
            </div>
        </FluentProvider>
    );

    if (!props.visible) {
        return null;
    }

    if (props.error) {
        return frame(
            <p className="CalendarView-message" role="alert">
                {props.errorMessage || getString('CalendarView_Error')}
            </p>,
        );
    }

    if (!props.hasStart) {
        return frame(<p className="CalendarView-message">{getString('CalendarView_NoStart')}</p>);
    }

    if (!props.hasTitle) {
        return frame(<p className="CalendarView-message">{getString('CalendarView_NoTitle')}</p>);
    }

    const heading =
        view === 'week'
            ? `${range.first.day} ${monthName(props.names, range.first.month)} – ${range.last.day} ${monthName(props.names, range.last.month)} ${range.last.year}`
            : `${monthName(props.names, anchor.month)} ${anchor.year}`;

    const days = view === 'month' ? monthGrid(anchor.year, anchor.month, firstDay) : [weekDays(anchor, firstDay)];

    const inRange = (day: Wall | null): day is Wall =>
        day !== null && compareDay(day, range.first) >= 0 && compareDay(day, range.last) <= 0;
    const todayWall = wallFromKey(props.today);
    const createDay = inRange(selected) ? selected : inRange(todayWall) ? todayWall : range.first;
    const viewButton = (which: View, label: string): React.ReactElement => (
        <Button appearance={view === which ? 'primary' : 'secondary'} size="small" aria-pressed={view === which} disabled={props.disabled} onClick={(): void => setView(which)}>
            {label}
        </Button>
    );

    return frame(
        <>
            {props.moveError !== null && (
                <p className="CalendarView-error" role="alert">
                    {props.moveError}
                </p>
            )}

            <div className="CalendarView-toolbar">
                <div className="CalendarView-nav">
                    <Button appearance="subtle" size="small" className="CalendarView-navArrow" aria-label={getString('CalendarView_Previous')} disabled={props.disabled} onClick={(): void => step(-1)}>
                        <Icon path={props.isRTL ? ICONS.chevronRight : ICONS.chevronLeft} size={16} />
                    </Button>
                    <Button appearance="secondary" size="small" disabled={props.disabled} onClick={goToday}>
                        {getString('CalendarView_Today')}
                    </Button>
                    <Button appearance="subtle" size="small" className="CalendarView-navArrow" aria-label={getString('CalendarView_Next')} disabled={props.disabled} onClick={(): void => step(1)}>
                        <Icon path={props.isRTL ? ICONS.chevronLeft : ICONS.chevronRight} size={16} />
                    </Button>
                </div>

                {/* aria-live so a screen reader hears the month change as the arrows are pressed. */}
                <h2 className="CalendarView-heading" aria-live="polite">
                    {heading}
                </h2>

                <div className="CalendarView-views" role="group" aria-label={getString('CalendarView_ViewLabel')}>
                    {viewButton('month', getString('View_Month'))}
                    {viewButton('week', getString('View_Week'))}
                    {viewButton('timeline', getString('View_Timeline'))}
                </div>

                {/*
                    The timeline has no day cell to put a + on, so it gets one
                    in the toolbar, creating on the selected day. Hidden on the
                    same rule as the day cells' +: a host with no form to open.
                */}
                {view === 'timeline' && props.canCreate && (
                    <Button
                        appearance="secondary"
                        size="small"
                        className="CalendarView-new"
                        disabled={props.disabled}
                        aria-label={getString('CalendarView_AddEvent').replace('{0}', `${dayName(props.names, weekday(createDay), false)} ${createDay.day} ${monthName(props.names, createDay.month)}`)}
                        onClick={(): void => props.onCreate(createDay)}
                    >
                        <Icon path={ICONS.add} size={16} />
                        {getString('CalendarView_New')}
                    </Button>
                )}
            </div>

            {props.loading && placed.length === 0 && <p className="CalendarView-message">{getString('CalendarView_Loading')}</p>}

            {view === 'timeline' ? (
                <Timeline
                    {...props}
                    days={timelineDays(anchor)}
                    first={range.first}
                    last={range.last}
                    events={eventsInRange(placed, range.first, range.last)}
                    selectedKey={selected ? dayKey(selected) : ''}
                    onSelectDay={selectDay}
                    onDrop={move}
                    onResizeEdge={resize}
                />
            ) : (
            <table className="CalendarView-grid" role="grid" aria-label={props.title}>
                <thead>
                    <tr>
                        {days[0].map((day) => (
                            <th key={weekday(day)} scope="col" abbr={dayName(props.names, weekday(day), false)}>
                                {dayName(props.names, weekday(day), true)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {days.map((row) => (
                        <tr key={dayKey(row[0])}>
                            {row.map((day) => (
                                <DayCell
                                    key={dayKey(day)}
                                    {...props}
                                    day={day}
                                    view={view}
                                    inMonth={view === 'week' || day.month === anchor.month}
                                    isToday={dayKey(day) === props.today}
                                    isSelected={selected !== null && sameDay(selected, day)}
                                    events={eventsOn(placed, day)}
                                    onSelectDay={selectDay}
                                    onDrop={move}
                                />
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            )}

            {/*
                Two footers that are honest about what is on screen. Without
                `filtering` the calendar cannot ask for the month, so it shows
                what the view loaded and says so; with it, a month larger than
                a page offers the rest.
            */}
            {!props.canFilter && (
                <p className="CalendarView-notice">{getString('CalendarView_NoFilter').replace('{0}', String(props.loadedCount))}</p>
            )}

            {props.hasNextPage && (
                <div className="CalendarView-footer">
                    <span className="CalendarView-notice">{getString('CalendarView_MoreAvailable').replace('{0}', String(props.loadedCount))}</span>
                    <Button appearance="secondary" size="small" disabled={props.disabled || props.loading} onClick={props.onLoadMore}>
                        {getString('CalendarView_LoadMore')}
                    </Button>
                </div>
            )}
        </>,
    );
}

interface IDayProps extends IProps {
    day: Wall;
    view: View;
    inMonth: boolean;
    isToday: boolean;
    /** The day the user last pressed — what the timeline's + New creates on, and what a canvas app reads back. */
    isSelected: boolean;
    events: CalendarEvent[];
    onDrop: (id: string, days: number) => void;
}

function DayCell(props: IDayProps): React.ReactElement {
    const { day, events, getString } = props;
    const [over, setOver] = React.useState(false);
    const droppable = !props.disabled && props.canMove;
    const creatable = !props.disabled && props.canCreate;
    const label = `${dayName(props.names, weekday(day), false)} ${day.day} ${monthName(props.names, day.month)}`;

    const classes = ['CalendarView-day'];

    if (!props.inMonth) {
        classes.push('is-outside');
    }

    if (props.isToday) {
        classes.push('is-today');
    }

    if (props.isSelected) {
        classes.push('is-selected');
    }

    if (over) {
        classes.push('is-over');
    }

    return (
        <td
            className={classes.join(' ')}
            role="gridcell"
            aria-label={`${label}, ${getString('CalendarView_EventCount').replace('{0}', String(events.length))}`}
            data-day={dayKey(day)}
            onDragOver={(event): void => {
                if (!droppable) {
                    return;
                }

                // Without preventDefault the browser refuses the drop, which
                // reads as the calendar ignoring the gesture.
                event.preventDefault();
                setOver(true);
            }}
            onDragLeave={(): void => setOver(false)}
            onDrop={(event): void => {
                event.preventDefault();
                setOver(false);

                // `id|fromDay`: the day the chip was picked up from, so a
                // multi-day event dragged by its third day moves by the
                // distance the user dragged, not by its start.
                const [id, from] = event.dataTransfer.getData('text/plain').split('|');
                const origin = from ? wallFromKey(from) : null;

                if (droppable && id && origin) {
                    props.onDrop(id, daysBetween(origin, day));
                }
            }}
        >
            <div className="CalendarView-dayHead">
                {/*
                    A real button: selecting a day is the one thing a canvas
                    app reads back, and it has to be reachable by keyboard.
                */}
                <button
                    type="button"
                    className="CalendarView-dayNumber"
                    disabled={props.disabled}
                    aria-current={props.isToday ? 'date' : undefined}
                    aria-pressed={props.isSelected}
                    onClick={(): void => props.onSelectDay(day)}
                >
                    {day.day}
                </button>
                {creatable && (
                    <Button
                        appearance="subtle"
                        size="small"
                        className="CalendarView-dayAdd"
                        aria-label={getString('CalendarView_AddEvent').replace('{0}', label)}
                        onClick={(): void => props.onCreate(day)}
                    >
                        <Icon path={ICONS.add} size={20} />
                    </Button>
                )}
            </div>

            <ul className="CalendarView-events">
                {events.map((event) => (
                    <EventChip key={event.id} {...props} event={event} />
                ))}
            </ul>
        </td>
    );
}

function EventChip(props: IDayProps & { event: CalendarEvent }): React.ReactElement {
    const { event, day, getString } = props;
    const busy = props.moving.indexOf(event.id) >= 0;
    const continues = !sameDay(event.start, day);
    const endsLater = event.end !== null && !sameDay(event.end, day);
    const time = !event.allDay && props.showTimes && !continues ? formatTime(event.start, props.names) : null;

    const classes = ['CalendarView-event'];

    if (event.allDay) {
        classes.push('is-allDay');
    }

    if (continues) {
        classes.push('is-continued');
    }

    if (endsLater) {
        classes.push('is-continuing');
    }

    if (busy) {
        classes.push('is-moving');
    }

    const moves: { label: string; days: number }[] = [
        { label: getString('CalendarView_MoveEarlierDay'), days: -1 },
        { label: getString('CalendarView_MoveLaterDay'), days: 1 },
        { label: getString('CalendarView_MoveEarlierWeek'), days: -7 },
        { label: getString('CalendarView_MoveLaterWeek'), days: 7 },
    ];

    return (
        <li
            className={classes.join(' ')}
            style={event.color ? { borderInlineStartColor: event.color } : undefined}
            draggable={!props.disabled && props.canMove}
            onDragStart={(dragEvent): void => {
                dragEvent.dataTransfer.setData('text/plain', `${event.id}|${dayKey(day)}`);
                dragEvent.dataTransfer.effectAllowed = 'move';
            }}
        >
            {props.openOnEventClick ? (
                <button
                    type="button"
                    className="CalendarView-eventTitle"
                    disabled={props.disabled}
                    title={event.title}
                    onClick={(): void => props.onOpenRecord(event.id)}
                >
                    {/*
                        A real space after the time, and outside the span: a
                        margin makes the time and the first word one
                        unbreakable token, and a space inside the nowrap span
                        is one the browser may not break at either.
                    */}
                    {time && <span className="CalendarView-eventTime">{time}</span>}
                    {time && ' '}
                    {event.title}
                </button>
            ) : (
                <span className="CalendarView-eventTitle" title={event.title}>
                    {/*
                        A real space after the time, and outside the span: a
                        margin makes the time and the first word one
                        unbreakable token, and a space inside the nowrap span
                        is one the browser may not break at either.
                    */}
                    {time && <span className="CalendarView-eventTime">{time}</span>}
                    {time && ' '}
                    {event.title}
                </span>
            )}

            {event.badge && <span className="CalendarView-eventBadge">{event.badge}</span>}

            {/*
                The keyboard path for moving an event. HTML5 drag-and-drop has
                no keyboard equivalent, so a calendar that only supported
                dragging would be unreachable without a mouse. Hidden rather
                than disabled where the host cannot write.
            */}
            {props.canMove && (
                <Menu>
                    <MenuTrigger disableButtonEnhancement>
                        <Button
                            appearance="subtle"
                            size="small"
                            className="CalendarView-eventMenu"
                            disabled={props.disabled || busy}
                            aria-label={getString('CalendarView_MoveEvent').replace('{0}', event.title)}
                        >
                            ⋯
                        </Button>
                    </MenuTrigger>
                    <MenuPopover>
                        <MenuList>
                            {moves.map((option) => (
                                <MenuItem key={option.days} onClick={(): void => props.onDrop(event.id, option.days)}>
                                    {option.label}
                                </MenuItem>
                            ))}
                        </MenuList>
                    </MenuPopover>
                </Menu>
            )}

            {busy && <span className="CalendarView-eventBusy">{getString('CalendarView_Moving')}</span>}
        </li>
    );
}

/* ------------------------------------------------------------ timeline */

interface ITimelineProps extends IProps {
    days: Wall[];
    first: Wall;
    last: Wall;
    /** The events touching the range, one row each, in order. */
    events: CalendarEvent[];
    /** The selected day's key, or `''` — the column the + New creates on, marked so the user can see it (form walkthrough W5). */
    selectedKey: string;
    onDrop: (id: string, days: number) => void;
    onResizeEdge: (id: string, edge: Edge, days: number) => void;
}

/** A drag in progress on one bar. `days` is where the pointer has taken it so far, already clamped. */
interface Drag {
    id: string;
    edge: Edge | 'move';
    originX: number;
    dayWidth: number;
    length: number;
    days: number;
}

/**
 * One row per event, the days across, a bar from start to end.
 *
 * Laid out as one CSS grid with every cell placed explicitly — the label in
 * column 1, day *j* in column *j + 2*, row *i* for event *i* — so the bar can
 * span its columns over the top of the day cells. The label column is
 * sticky, and the day columns have a minimum width the grid will not go
 * below, which is what makes a month scroll sideways inside the control
 * rather than squeeze; the scrolling element is the control's own, so the
 * form around it is untouched.
 *
 * **Dragging is pointer capture, not HTML5 drag-and-drop.** The month view
 * drops chips onto day cells, which are real drop targets; a bar has no
 * target to land on — it moves by the distance dragged — and `dragstart`
 * carries no pointer position. So the bar takes the pointer on `pointerdown`,
 * turns each move into whole days by the width of one day column, and
 * commits on `pointerup`. Capture keeps the events coming when the pointer
 * leaves the bar, and there is no document listener to release: `destroy`
 * owes nothing here. A drag that moved nothing is not a write, and a click
 * that started a drag is not an open.
 */
function Timeline(props: ITimelineProps): React.ReactElement {
    const { getString, days, first, last, events } = props;
    const gridRef = React.useRef<HTMLDivElement>(null);
    const [drag, setDrag] = React.useState<Drag | null>(null);
    const dragged = React.useRef(false);
    const interactive = !props.disabled && props.canMove;
    const columns = `var(--CalendarView-tlLabel, 180px) repeat(${days.length}, minmax(var(--CalendarView-tlDay, 36px), 1fr))`;

    /*
     * How wide a day is, measured — the same ResizeObserver route as the
     * narrow class. A bar draws its title when it has the pixels for one,
     * and that is a fact about the form's width, not the bar's day count:
     * on a wide form a one-day bar is 60px and can carry "Meeting 4", on a
     * phone it is 28px and cannot. Column count was the first rule and it
     * left every one-day bar blank on a form 2,000px wide (2026-09-17).
     * Without an observer (a static render) the count decides.
     */
    const [dayWidth, setDayWidth] = React.useState(0);

    React.useEffect(() => {
        const grid = gridRef.current;

        if (!grid || typeof ResizeObserver !== 'function') {
            return undefined;
        }

        const measure = (): void => {
            const head = grid.querySelector<HTMLElement>('.CalendarView-tlHead');

            setDayWidth(head ? head.getBoundingClientRect().width : 0);
        };

        const observer = new ResizeObserver(measure);

        observer.observe(grid);
        measure();

        return () => observer.disconnect();
    }, [days.length]);

    const begin = (pointer: React.PointerEvent<HTMLElement>, event: CalendarEvent, edge: Edge | 'move', bar: Bar): void => {
        if (!interactive || pointer.button !== 0) {
            return;
        }

        const head = gridRef.current?.querySelector<HTMLElement>('.CalendarView-tlHead');
        const dayWidth = head ? head.getBoundingClientRect().width : 0;

        if (dayWidth <= 0) {
            return;
        }

        // Capture can refuse a pointer the browser is not tracking — a synthetic event, a test. The drag still works without it while the pointer stays on the bar.
        try {
            pointer.currentTarget.setPointerCapture(pointer.pointerId);
        } catch (error) {
            // no capture
        }

        pointer.preventDefault();
        dragged.current = false;
        setDrag({ id: event.id, edge, originX: pointer.clientX, dayWidth, length: bar.length, days: 0 });
    };

    const during = (pointer: React.PointerEvent<HTMLElement>): void => {
        if (!drag) {
            return;
        }

        const raw = Math.round((pointer.clientX - drag.originX) / drag.dayWidth) * (props.isRTL ? -1 : 1);
        const next = drag.edge === 'move' ? raw : clampResize(drag.edge, raw, drag.length);

        if (next !== drag.days) {
            dragged.current = dragged.current || next !== 0;
            setDrag({ ...drag, days: next });
        }
    };

    const finish = (pointer: React.PointerEvent<HTMLElement>, cancelled: boolean): void => {
        if (!drag) {
            return;
        }

        // The element that captured is the handle or the bar, whichever was pressed; the release reaches the bar either way.
        const captor = pointer.target as HTMLElement;

        if (typeof captor.hasPointerCapture === 'function' && captor.hasPointerCapture(pointer.pointerId)) {
            captor.releasePointerCapture(pointer.pointerId);
        }

        if (!cancelled && drag.days !== 0) {
            if (drag.edge === 'move') {
                props.onDrop(drag.id, drag.days);
            } else {
                props.onResizeEdge(drag.id, drag.edge, drag.days);
            }
        }

        setDrag(null);
    };

    const at = (row: number, column: number, span = 1): React.CSSProperties => ({
        gridRow: row,
        gridColumn: span > 1 ? `${column} / span ${span}` : column,
    });

    return (
        <div className={`CalendarView-timeline${drag ? ' is-dragging' : ''}`} role="grid" aria-label={props.title} aria-rowcount={events.length + 1} aria-colcount={days.length + 1}>
            <div className="CalendarView-tlGrid" ref={gridRef} style={{ gridTemplateColumns: columns }}>
                <div className="CalendarView-tlCorner" role="columnheader" style={at(1, 1)}>
                    {getString('CalendarView_TimelineEvents')}
                </div>

                {days.map((day, index) => {
                    const isToday = dayKey(day) === props.today;
                    const isSelected = dayKey(day) === props.selectedKey;
                    const isWeekend = weekday(day) === 0 || weekday(day) === 6;

                    return (
                        <div
                            key={dayKey(day)}
                            role="columnheader"
                            className={`CalendarView-tlHead${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}${isWeekend ? ' is-weekend' : ''}`}
                            data-day={dayKey(day)}
                            style={at(1, index + 2)}
                        >
                            <button
                                type="button"
                                className="CalendarView-dayNumber"
                                disabled={props.disabled}
                                aria-current={isToday ? 'date' : undefined}
                                aria-pressed={isSelected}
                                aria-label={`${dayName(props.names, weekday(day), false)} ${day.day} ${monthName(props.names, day.month)}`}
                                onClick={(): void => props.onSelectDay(day)}
                            >
                                {day.day}
                            </button>
                            <span className="CalendarView-tlWeekday" aria-hidden="true">
                                {dayName(props.names, weekday(day), true)}
                            </span>
                        </div>
                    );
                })}

                {events.length === 0 && !props.loading && (
                    <p className="CalendarView-message CalendarView-tlEmpty" style={at(2, 1, days.length + 1)}>
                        {getString('CalendarView_NoEvents')}
                    </p>
                )}

                {events.map((event, index) => {
                    const row = index + 2;
                    const busy = props.moving.indexOf(event.id) >= 0;
                    const live = drag && drag.id === event.id && drag.days !== 0
                        ? shifted(event, { start: drag.edge === 'end' ? 0 : drag.days, end: drag.edge === 'start' ? 0 : drag.days })
                        : event;
                    const bar = timelineBar(live, first, last);
                    // Text only on a bar wide enough to carry it: "S…" is not a title and "9:…" is not a time. The label
                    // column always has the title, and a bar too narrow for one is a bare chip, the way a Gantt draws a
                    // milestone. Below 48px nothing; the time joins the title from 120px.
                    const pixels = bar ? ((bar as Bar).endCol - (bar as Bar).startCol + 1) * dayWidth : 0;
                    const wide = Boolean(bar) && (dayWidth > 0 ? pixels >= 48 : (bar as Bar).endCol > (bar as Bar).startCol);
                    const roomForTime = wide && (dayWidth > 0 ? pixels >= 120 : true);
                    const time = roomForTime && !event.allDay && props.showTimes && !(bar as Bar).continued ? formatTime(event.start, props.names) : null;
                    const resizable = interactive && props.hasEnd && !busy;
                    const barClasses = ['CalendarView-tlBar'];

                    if (event.allDay) {
                        barClasses.push('is-allDay');
                    }

                    if (bar?.continued) {
                        barClasses.push('is-continued');
                    }

                    if (bar?.continuing) {
                        barClasses.push('is-continuing');
                    }

                    if (busy) {
                        barClasses.push('is-moving');
                    }

                    if (drag && drag.id === event.id) {
                        barClasses.push('is-held');
                    }

                    const adjustments: { key: string; label: string; act: () => void }[] = [
                        { key: 'earlier', label: getString('CalendarView_MoveEarlierDay'), act: (): void => props.onDrop(event.id, -1) },
                        { key: 'later', label: getString('CalendarView_MoveLaterDay'), act: (): void => props.onDrop(event.id, 1) },
                    ];

                    if (props.hasEnd) {
                        adjustments.push(
                            { key: 'start-earlier', label: getString('CalendarView_StartEarlier'), act: (): void => props.onResizeEdge(event.id, 'start', -1) },
                            { key: 'start-later', label: getString('CalendarView_StartLater'), act: (): void => props.onResizeEdge(event.id, 'start', 1) },
                            { key: 'end-earlier', label: getString('CalendarView_EndEarlier'), act: (): void => props.onResizeEdge(event.id, 'end', -1) },
                            { key: 'end-later', label: getString('CalendarView_EndLater'), act: (): void => props.onResizeEdge(event.id, 'end', 1) },
                        );
                    }

                    return (
                        <React.Fragment key={event.id}>
                            {/*
                                The row's accessible half. The bar below is a
                                picture of the same event for a pointer; every
                                keyboard path — open, move, resize — is here.
                            */}
                            <div className="CalendarView-tlLabel" role="rowheader" style={at(row, 1)}>
                                {props.openOnEventClick ? (
                                    <button type="button" className="CalendarView-eventTitle" disabled={props.disabled} title={event.title} onClick={(): void => props.onOpenRecord(event.id)}>
                                        {event.title}
                                    </button>
                                ) : (
                                    <span className="CalendarView-eventTitle" title={event.title}>
                                        {event.title}
                                    </span>
                                )}

                                {event.badge && <span className="CalendarView-eventBadge">{event.badge}</span>}

                                {props.canMove && (
                                    <Menu>
                                        <MenuTrigger disableButtonEnhancement>
                                            <Button
                                                appearance="subtle"
                                                size="small"
                                                className="CalendarView-eventMenu"
                                                disabled={props.disabled || busy}
                                                aria-label={getString('CalendarView_MoveEvent').replace('{0}', event.title)}
                                            >
                                                ⋯
                                            </Button>
                                        </MenuTrigger>
                                        <MenuPopover>
                                            <MenuList>
                                                {adjustments.map((option) => (
                                                    <MenuItem key={option.key} onClick={option.act}>
                                                        {option.label}
                                                    </MenuItem>
                                                ))}
                                            </MenuList>
                                        </MenuPopover>
                                    </Menu>
                                )}

                                {busy && <span className="CalendarView-eventBusy">{getString('CalendarView_Moving')}</span>}
                            </div>

                            {days.map((day, column) => (
                                <div
                                    key={dayKey(day)}
                                    role="gridcell"
                                    className={`CalendarView-tlCell${dayKey(day) === props.today ? ' is-today' : ''}${dayKey(day) === props.selectedKey ? ' is-selected' : ''}${weekday(day) === 0 || weekday(day) === 6 ? ' is-weekend' : ''}`}
                                    style={at(row, column + 2)}
                                />
                            ))}

                            {bar && (
                                <div
                                    className={barClasses.join(' ')}
                                    aria-hidden="true"
                                    data-event={event.id}
                                    data-from={bar.startCol}
                                    data-to={bar.endCol}
                                    style={{ ...at(row, bar.startCol + 2, bar.endCol - bar.startCol + 1), ...(event.color ? { borderInlineStartColor: event.color } : {}) }}
                                    onPointerDown={(pointer): void => begin(pointer, event, 'move', bar)}
                                    onPointerMove={during}
                                    onPointerUp={(pointer): void => finish(pointer, false)}
                                    onPointerCancel={(pointer): void => finish(pointer, true)}
                                    onClick={(): void => {
                                        // A drag that moved is not a click; a press that did not move is.
                                        if (dragged.current) {
                                            dragged.current = false;

                                            return;
                                        }

                                        if (props.openOnEventClick) {
                                            props.onOpenRecord(event.id);
                                        }
                                    }}
                                >
                                    {/*
                                        A handle takes only the press. The moves and the
                                        release bubble up to the bar's handlers, which is
                                        where every drag ends — a handle with its own
                                        `onPointerUp` committed the resize once itself and
                                        once more when the event reached the bar, whose
                                        closure still held the drag (found 2026-09-17 in
                                        the harness: one drag, two saves).
                                    */}
                                    {resizable && !bar.continued && (
                                        <span
                                            className="CalendarView-tlHandle is-start"
                                            onPointerDown={(pointer): void => {
                                                pointer.stopPropagation();
                                                begin(pointer, event, 'start', bar);
                                            }}
                                        />
                                    )}
                                    {/*
                                        No badge on the bar: a one-day bar is 32px wide, and
                                        the badge took all of it (the screenshot pass showed a
                                        month of "Mee" and "Ever"). It sits in the label cell,
                                        where the month view's chip keeps it too.
                                    */}
                                    {wide && (
                                        <span className="CalendarView-tlBarTitle">
                                            {time && <span className="CalendarView-eventTime">{time}</span>}
                                            {time && ' '}
                                            {event.title}
                                        </span>
                                    )}
                                    {resizable && !bar.continuing && (
                                        <span
                                            className="CalendarView-tlHandle is-end"
                                            onPointerDown={(pointer): void => {
                                                pointer.stopPropagation();
                                                begin(pointer, event, 'end', bar);
                                            }}
                                        />
                                    )}
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}
