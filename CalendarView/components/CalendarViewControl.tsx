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
    allDayRow,
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
    layoutDay,
    minuteOfDay,
    monthGrid,
    monthName,
    optionValue,
    sameDay,
    shiftDays,
    shiftMinutes,
    snapMinutes,
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

/**
 * How a move or resize ended, as the entry point reports it — so the calendar
 * can put a refused event back without a platform render (0.2.4).
 */
export interface MoveOutcome {
    ok: boolean;
    /** The sentence to show when it was refused, or `null`. */
    message: string | null;
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
    /** Day and Week drawn against the hours (0.3.0). Off unless the maker turned it on. */
    hourGrid: boolean;
    /** The hour grid's step in minutes — what a drag snaps to and what a slot creates: 15, 30 or 60. */
    slotMinutes: number;
    /** The host's height where it gives one (canvas, full screen); `null` on a form, which never does (SPEC.md H7). */
    allocatedHeight: number | null;
    /** Reads the user's working day for the hour grid, or `null` where there is nobody to ask. */
    loadWorkHours: (() => Promise<{ start: number; end: number }>) | null;
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
    /** Write a move; resolves with how it ended, never rejects. */
    onMove: (recordId: string, days: number) => Promise<MoveOutcome>;
    /** Move one end of it by days, the other held — the timeline's resize. Only offered with an end role bound. */
    onResize: (recordId: string, edge: Edge, days: number) => Promise<MoveOutcome>;
    /** Move one or both ends by minutes — the hour grid's drag and menu. Resolves with how it ended, never rejects. */
    onShiftTime: (recordId: string, startMinutes: number, endMinutes: number) => Promise<MoveOutcome>;
    onSelectDay: (day: Wall) => void;
    onCreate: (day: Wall) => void;
    /** Open the quick create at a time with an end — the hour grid's slot and its day **+**. */
    onCreateAt: (start: Wall, end: Wall) => void;
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

/** A day in minutes. Every shift is in minutes since 0.3.0; a whole-day move is 1,440 of them. */
const DAY = 1440;

/** The hour grid's height for one hour, in pixels. */
const HOUR_PX = 48;

/** How far each end of an event has been shifted, in minutes. A move shifts both by the same amount; a resize shifts one. */
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
): [Record<string, Shift>, (id: string, startMinutes: number, endMinutes: number) => void] {
    const [overlay, setOverlay] = React.useState<Record<string, Shift>>({});
    const key = eventsKey(events);

    React.useEffect(() => {
        setOverlay({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const place = React.useCallback((id: string, startMinutes: number, endMinutes: number): void => {
        setOverlay((current) => {
            const before = current[id] ?? { start: 0, end: 0 };

            return { ...current, [id]: { start: before.start + startMinutes, end: before.end + endMinutes } };
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
    const by = (wall: Wall, minutes: number): Wall => (minutes % DAY === 0 ? shiftDays(wall, minutes / DAY) : shiftMinutes(wall, minutes));
    const start = by(event.start, shift.start);
    const end = event.end
        ? by(event.end, shift.end)
        : shift.end !== shift.start
            ? by(event.start, shift.end)
            : null;

    return { ...event, start, end };
}

/**
 * The user's working day, once it arrives — held in React for the reason
 * `useMetadata` gives. 08:00–17:00 until then, and where nobody can say.
 */
function useWorkHours(enabled: boolean, load: (() => Promise<{ start: number; end: number }>) | null): { start: number; end: number } {
    const [hours, setHours] = React.useState({ start: 8 * 60, end: 17 * 60 });

    React.useEffect(() => {
        if (!enabled || !load) {
            return undefined;
        }

        let alive = true;

        void load().then((answer) => {
            if (alive) {
                setHours(answer);
            }
        });

        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    return hours;
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

    /*
     * Events with a write in flight, and the last refusal — the calendar's
     * own since 0.2.4: the write no longer ends with a refresh, and a refusal
     * changes no output, so no render from the host would put the event back.
     */
    const [busy, setBusy] = React.useState<string[]>([]);
    const [refusal, setRefusal] = React.useState<string | null>(null);

    const settle = (id: string, startMinutes: number, endMinutes: number, sent: Promise<MoveOutcome>): void => {
        place(id, startMinutes, endMinutes);
        setRefusal(null);
        setBusy((current) => [...current, id]);

        void sent.then((outcome) => {
            setBusy((current) => current.filter((each) => each !== id));

            if (!outcome.ok) {
                // The overlay adds shifts, so the opposite one puts it back.
                place(id, -startMinutes, -endMinutes);
                setRefusal(outcome.message);
            }
        });
    };

    const move = (id: string, days: number): void => {
        if (days === 0) {
            return;
        }

        settle(id, days * DAY, days * DAY, props.onMove(id, days));
    };

    const resize = (id: string, edge: Edge, days: number): void => {
        if (days === 0 || !props.hasEnd) {
            return;
        }

        settle(id, edge === 'start' ? days * DAY : 0, edge === 'end' ? days * DAY : 0, props.onResize(id, edge, days));
    };

    /** The hour grid's move or resize, in minutes; a refused one comes back the same way a day move does. */
    const shiftTime = (id: string, startMinutes: number, endMinutes: number): void => {
        if (startMinutes === 0 && endMinutes === 0) {
            return;
        }

        settle(id, startMinutes, endMinutes, props.onShiftTime(id, startMinutes, endMinutes));
    };

    const workHours = useWorkHours(props.hourGrid, props.loadWorkHours);

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
        view === 'day'
            ? `${dayName(props.names, weekday(anchor), false)} ${anchor.day} ${monthName(props.names, anchor.month)} ${anchor.year}`
            : view === 'week'
                ? `${range.first.day} ${monthName(props.names, range.first.month)} – ${range.last.day} ${monthName(props.names, range.last.month)} ${range.last.year}`
                : `${monthName(props.names, anchor.month)} ${anchor.year}`;
    const hours = props.hourGrid && (view === 'week' || view === 'day');

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
            {(refusal ?? props.moveError) !== null && (
                <p className="CalendarView-error" role="alert">
                    {refusal ?? props.moveError}
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
                    {props.hourGrid && viewButton('day', getString('View_Day'))}
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

            {hours ? (
                <HourGrid
                    {...props}
                    moving={[...props.moving, ...busy]}
                    days={view === 'day' ? [{ ...anchor, hour: 0, minute: 0 }] : weekDays(anchor, firstDay)}
                    first={range.first}
                    last={range.last}
                    events={eventsInRange(placed, range.first, range.last)}
                    selectedKey={selected ? dayKey(selected) : ''}
                    workHours={workHours}
                    onSelectDay={selectDay}
                    onDrop={move}
                    onShift={shiftTime}
                />
            ) : view === 'timeline' ? (
                <Timeline
                    {...props}
                    moving={[...props.moving, ...busy]}
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
                                    moving={[...props.moving, ...busy]}
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
                        ? shifted(event, { start: drag.edge === 'end' ? 0 : drag.days * DAY, end: drag.edge === 'start' ? 0 : drag.days * DAY })
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

/* ------------------------------------------------------------ hour grid */

interface IHourGridProps extends IProps {
    /** One day (Day) or seven (Week). */
    days: Wall[];
    first: Wall;
    last: Wall;
    /** The events touching the days shown — the timed ones go in the hours, the rest in the all-day row. */
    events: CalendarEvent[];
    selectedKey: string;
    /** The user's working day in minutes: where the grid opens, and what is not shaded. */
    workHours: { start: number; end: number };
    onDrop: (id: string, days: number) => void;
    onShift: (id: string, startMinutes: number, endMinutes: number) => void;
}

/** A drag in the hour grid: a block moving, its end resizing, or an all-day bar moving by days. */
interface HourDrag {
    id: string;
    mode: 'move' | 'end' | 'lane';
    originX: number;
    originY: number;
    dayWidth: number;
    /** The column the event sat in, 0-based, so a move cannot leave the days shown. */
    column: number;
    /** The block's drawn start and end in minutes from midnight; what a resize is clamped against. */
    start: number;
    end: number;
    /** Whether the record has an end at all — an endless event's resize is measured from its start. */
    hasEnd: boolean;
    days: number;
    minutes: number;
}

/** The shift a drag means, in minutes for each end — what the overlay draws and what is written. */
function dragShift(drag: HourDrag): Shift {
    if (drag.mode === 'end') {
        // An endless event is drawn `end - start` long and has no end to move: its new end is measured from its start.
        return { start: 0, end: (drag.hasEnd ? 0 : drag.end - drag.start) + drag.minutes };
    }

    const total = drag.days * DAY + drag.minutes;

    return { start: total, end: total };
}

/** The user's wall clock now, read the way every stored instant is. */
function wallNow(userOffset: (date: Date) => number): Wall {
    const now = new Date();
    const shiftedNow = new Date(now.getTime() + userOffset(now) * 60_000);

    return {
        year: shiftedNow.getUTCFullYear(),
        month: shiftedNow.getUTCMonth(),
        day: shiftedNow.getUTCDate(),
        hour: shiftedNow.getUTCHours(),
        minute: shiftedNow.getUTCMinutes(),
    };
}

/**
 * Day or Week drawn against the hours of the day (0.3.0).
 *
 * One scrolling box — not the root, which a form section sizes from the
 * control (0.1.3's collapse) — holding a CSS grid: the day heads and the
 * all-day row are sticky at its top, the hour labels sticky at its start,
 * and each day is a column 24 hours tall with its events positioned in it.
 * **The box decides its own height**, because a subgrid allocates none
 * (measured 2026-10-04, SPEC.md H7): the user's working day plus an hour,
 * eight to twelve hours of it, scrolled to open at the start of that day.
 * A host that does allocate a height (canvas, full screen) gets it used.
 *
 * Events whose start and end fall on one day are drawn in the hours, side
 * by side where they overlap (`layoutDay`); whole-day events and timed ones
 * that cross midnight go in the all-day row (`allDayRow`).
 *
 * **Dragging is pointer capture**, as on the timeline and for the same
 * reasons: a block moves by the distance dragged, in steps of the maker's
 * `slotMinutes` down the day and whole days across it, and its bottom edge
 * resizes the end alone. A handle takes only the press; the moves and the
 * release reach the block. A press that never moved opens the record. The
 * keyboard path is each block's menu: earlier or later by one step or one
 * day, and the end alone by one step.
 *
 * **A free slot creates.** A press on the empty part of a day opens the
 * quick create with that slot's start and end, both as
 * `yyyy-MM-ddTHH:mm:00` — measured on the form to arrive as the user's
 * wall clock (SPEC.md H3). The **+** in a day's head does the same at the
 * start of the working day, which is the keyboard's way in.
 */
function HourGrid(props: IHourGridProps): React.ReactElement {
    const { getString, days, first, last, events, workHours } = props;
    const step = props.slotMinutes;
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const [drag, setDrag] = React.useState<HourDrag | null>(null);
    const dragged = React.useRef(false);
    const interactive = !props.disabled && props.canMove;
    const creatable = !props.disabled && props.canCreate;
    const rangeKey = `${dayKey(first)}|${dayKey(last)}`;

    /*
     * The now line moves with the clock. An interval from an effect, cleared
     * on unmount — the platform unmounts a virtual control's tree, so
     * `destroy` owes nothing for it.
     */
    const [now, setNow] = React.useState<Wall>(() => wallNow(props.userOffset));
    const { userOffset } = props;

    React.useEffect(() => {
        const timer = setInterval(() => setNow(wallNow(userOffset)), 60_000);

        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /*
     * Open on the working day: half an hour above its start sits just under
     * the sticky rows, whatever their height, because sticky elements keep
     * their place in the flow. Again when the range or the working day
     * changes — a new week starts at the top of the day too.
     */
    React.useEffect(() => {
        const box = scrollRef.current;

        if (box) {
            box.scrollTop = Math.max(0, (workHours.start / 60 - 0.5) * HOUR_PX);
        }
    }, [rangeKey, workHours.start]);

    const live = drag && (drag.days !== 0 || drag.minutes !== 0)
        ? events.map((event) => (event.id === drag.id ? shifted(event, dragShift(drag)) : event))
        : events;
    const lane = allDayRow(live, first, last);
    const laneRows = lane.reduce((most, bar) => Math.max(most, bar.row + 1), 0);
    const visibleHours = Math.min(12, Math.max(8, Math.ceil((workHours.end - workHours.start) / 60) + 1));
    const boxHeight = props.allocatedHeight !== null
        ? Math.max(240, props.allocatedHeight - 56)
        : 44 + Math.max(1, laneRows) * 24 + 8 + visibleHours * HOUR_PX;
    const columns = `var(--CalendarView-hoursAxis, 56px) repeat(${days.length}, minmax(var(--CalendarView-hoursDay, ${days.length === 1 ? 160 : 72}px), 1fr))`;
    const at = (row: number, column: number, span = 1): React.CSSProperties => ({
        gridRow: row,
        gridColumn: span > 1 ? `${column} / span ${span}` : column,
    });
    const dayAt = (day: Wall, minutes: number): Wall => shiftMinutes({ ...day, hour: 0, minute: 0 }, minutes);
    const dayLabel = (day: Wall): string => `${dayName(props.names, weekday(day), false)} ${day.day} ${monthName(props.names, day.month)}`;
    const createAt = (day: Wall, minutes: number): void => {
        const from = Math.min(Math.max(0, minutes), DAY - step);

        props.onCreateAt(dayAt(day, from), dayAt(day, from + step));
    };

    const begin = (
        pointer: React.PointerEvent<HTMLElement>,
        event: CalendarEvent,
        mode: HourDrag['mode'],
        column: number,
        start: number,
        end: number,
        width: number,
    ): void => {
        if (!interactive || pointer.button !== 0 || width <= 0) {
            return;
        }

        // Capture can refuse a pointer the browser is not tracking; the drag still works while the pointer stays on the block.
        try {
            pointer.currentTarget.setPointerCapture(pointer.pointerId);
        } catch (error) {
            // no capture
        }

        dragged.current = false;
        setDrag({ id: event.id, mode, originX: pointer.clientX, originY: pointer.clientY, dayWidth: width, column, start, end, hasEnd: event.end !== null, days: 0, minutes: 0 });
    };

    const during = (pointer: React.PointerEvent<HTMLElement>): void => {
        if (!drag) {
            return;
        }

        let minutes = 0;
        let moved = 0;

        if (drag.mode !== 'lane') {
            minutes = snapMinutes(((pointer.clientY - drag.originY) / HOUR_PX) * 60, step);
        }

        if (drag.mode === 'move') {
            // Within the day: the start not before midnight, the drawn end not past the next one.
            minutes = Math.min(Math.max(minutes, -drag.start), DAY - drag.end);
        } else if (drag.mode === 'end') {
            // An end never above its start plus one step, never past midnight.
            minutes = Math.min(Math.max(minutes, drag.start + step - drag.end), DAY - drag.end);
        }

        if (drag.mode !== 'end') {
            moved = Math.round((pointer.clientX - drag.originX) / drag.dayWidth) * (props.isRTL ? -1 : 1);
            moved = Math.min(Math.max(moved, -drag.column), days.length - 1 - drag.column);
        }

        if (minutes !== drag.minutes || moved !== drag.days) {
            dragged.current = dragged.current || minutes !== 0 || moved !== 0;
            setDrag({ ...drag, minutes, days: moved });
        }
    };

    const finish = (pointer: React.PointerEvent<HTMLElement>, cancelled: boolean): void => {
        if (!drag) {
            return;
        }

        const captor = pointer.target as HTMLElement;

        if (typeof captor.hasPointerCapture === 'function' && captor.hasPointerCapture(pointer.pointerId)) {
            captor.releasePointerCapture(pointer.pointerId);
        }

        if (!cancelled && (drag.days !== 0 || drag.minutes !== 0)) {
            if (drag.mode === 'lane') {
                props.onDrop(drag.id, drag.days);
            } else {
                const shift = dragShift(drag);

                props.onShift(drag.id, shift.start, shift.end);
            }
        }

        setDrag(null);
    };

    /** Open the record — unless the press was the end of a drag. */
    const open = (id: string): void => {
        if (dragged.current) {
            dragged.current = false;

            return;
        }

        if (props.openOnEventClick) {
            props.onOpenRecord(id);
        }
    };

    const menu = (event: CalendarEvent, drawnLength: number, busy: boolean, timed: boolean): React.ReactElement | null => {
        if (!props.canMove) {
            return null;
        }

        const endBase = event.end ? 0 : drawnLength;
        const options: { key: string; label: string; act: () => void }[] = [];

        if (timed) {
            options.push(
                { key: 'earlier', label: getString('CalendarView_MoveEarlierMinutes').replace('{0}', String(step)), act: (): void => props.onShift(event.id, -step, -step) },
                { key: 'later', label: getString('CalendarView_MoveLaterMinutes').replace('{0}', String(step)), act: (): void => props.onShift(event.id, step, step) },
            );

            if (props.hasEnd) {
                options.push(
                    { key: 'end-earlier', label: getString('CalendarView_EndEarlierMinutes').replace('{0}', String(step)), act: (): void => props.onShift(event.id, 0, endBase - step) },
                    { key: 'end-later', label: getString('CalendarView_EndLaterMinutes').replace('{0}', String(step)), act: (): void => props.onShift(event.id, 0, endBase + step) },
                );
            }
        }

        options.push(
            { key: 'day-earlier', label: getString('CalendarView_MoveEarlierDay'), act: (): void => props.onDrop(event.id, -1) },
            { key: 'day-later', label: getString('CalendarView_MoveLaterDay'), act: (): void => props.onDrop(event.id, 1) },
        );

        return (
            <Menu>
                <MenuTrigger disableButtonEnhancement>
                    <Button
                        appearance="subtle"
                        size="small"
                        className="CalendarView-eventMenu"
                        disabled={props.disabled || busy}
                        aria-label={getString('CalendarView_MoveEvent').replace('{0}', event.title)}
                        onPointerDown={(pointer): void => pointer.stopPropagation()}
                    >
                        ⋯
                    </Button>
                </MenuTrigger>
                <MenuPopover>
                    <MenuList>
                        {options.map((option) => (
                            <MenuItem key={option.key} onClick={option.act}>
                                {option.label}
                            </MenuItem>
                        ))}
                    </MenuList>
                </MenuPopover>
            </Menu>
        );
    };

    const title = (event: CalendarEvent, prefix: string | null): React.ReactElement =>
        props.openOnEventClick ? (
            <button type="button" className="CalendarView-eventTitle" disabled={props.disabled} title={event.title} onClick={(): void => open(event.id)}>
                {prefix && <span className="CalendarView-eventTime">{prefix}</span>}
                {prefix && ' '}
                {event.title}
            </button>
        ) : (
            <span className="CalendarView-eventTitle" title={event.title}>
                {prefix && <span className="CalendarView-eventTime">{prefix}</span>}
                {prefix && ' '}
                {event.title}
            </span>
        );

    return (
        <div className={`CalendarView-hours${drag ? ' is-dragging' : ''}`} role="grid" aria-label={props.title} aria-colcount={days.length + 1}>
            <div className="CalendarView-hoursScroll" ref={scrollRef} style={{ height: `${boxHeight}px` }}>
                <div className="CalendarView-hoursGrid" style={{ gridTemplateColumns: columns }}>
                    <div className="CalendarView-hoursCorner" role="columnheader" style={at(1, 1)} />

                    {days.map((day, index) => {
                        const isToday = dayKey(day) === props.today;
                        const isSelected = dayKey(day) === props.selectedKey;

                        return (
                            <div
                                key={dayKey(day)}
                                role="columnheader"
                                className={`CalendarView-hoursHead${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`}
                                data-day={dayKey(day)}
                                style={at(1, index + 2)}
                            >
                                <span className="CalendarView-hoursWeekday" aria-hidden="true">
                                    {dayName(props.names, weekday(day), true)}
                                </span>
                                <button
                                    type="button"
                                    className="CalendarView-dayNumber"
                                    disabled={props.disabled}
                                    aria-current={isToday ? 'date' : undefined}
                                    aria-pressed={isSelected}
                                    aria-label={dayLabel(day)}
                                    onClick={(): void => props.onSelectDay(day)}
                                >
                                    {day.day}
                                </button>
                                {creatable && (
                                    <Button
                                        appearance="subtle"
                                        size="small"
                                        className="CalendarView-dayAdd"
                                        aria-label={getString('CalendarView_AddEvent').replace('{0}', dayLabel(day))}
                                        onClick={(): void => createAt(day, workHours.start)}
                                    >
                                        <Icon path={ICONS.add} size={16} />
                                    </Button>
                                )}
                            </div>
                        );
                    })}

                    <div className="CalendarView-allDayLabel" style={at(2, 1)}>
                        {getString('CalendarView_AllDay')}
                    </div>

                    <div
                        className="CalendarView-allDay"
                        role="row"
                        style={{ ...at(2, 2, days.length), gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
                    >
                        {lane.map(({ event, bar, row }) => {
                            const busy = props.moving.indexOf(event.id) >= 0;
                            const classes = ['CalendarView-allDayBar'];

                            if (event.allDay) {
                                classes.push('is-allDay');
                            }

                            if (bar.continued) {
                                classes.push('is-continued');
                            }

                            if (bar.continuing) {
                                classes.push('is-continuing');
                            }

                            if (busy) {
                                classes.push('is-moving');
                            }

                            if (drag && drag.id === event.id) {
                                classes.push('is-held');
                            }

                            return (
                                <div
                                    key={event.id}
                                    className={classes.join(' ')}
                                    role="gridcell"
                                    data-event={event.id}
                                    data-from={bar.startCol}
                                    data-to={bar.endCol}
                                    style={{
                                        gridColumn: `${bar.startCol + 1} / span ${bar.endCol - bar.startCol + 1}`,
                                        gridRow: row + 1,
                                        ...(event.color ? { borderInlineStartColor: event.color } : {}),
                                    }}
                                    onPointerDown={(pointer): void => {
                                        const row = pointer.currentTarget.parentElement;

                                        begin(pointer, event, 'lane', bar.startCol, 0, 0, row ? row.getBoundingClientRect().width / days.length : 0);
                                    }}
                                    onPointerMove={during}
                                    onPointerUp={(pointer): void => finish(pointer, false)}
                                    onPointerCancel={(pointer): void => finish(pointer, true)}
                                >
                                    {title(event, null)}
                                    {menu(event, 0, busy, false)}
                                </div>
                            );
                        })}
                    </div>

                    <div className="CalendarView-hoursAxis" aria-hidden="true" style={{ ...at(3, 1), height: `${24 * HOUR_PX}px` }}>
                        {Array.from({ length: 23 }, (_, index) => index + 1).map((hour) => (
                            <span key={hour} className="CalendarView-hoursLabel" style={{ top: `${hour * HOUR_PX}px` }}>
                                {formatTime({ year: 2026, month: 0, day: 1, hour, minute: 0 }, props.names)}
                            </span>
                        ))}
                    </div>

                    {days.map((day, column) => {
                        const blocks = layoutDay(live, day, step);
                        const isToday = dayKey(day) === props.today;
                        const showNow = sameDay(now, day);

                        return (
                            <div
                                key={dayKey(day)}
                                role="gridcell"
                                className={`CalendarView-hoursDay${isToday ? ' is-today' : ''}${dayKey(day) === props.selectedKey ? ' is-selected' : ''}`}
                                aria-label={`${dayLabel(day)}, ${getString('CalendarView_EventCount').replace('{0}', String(blocks.length))}`}
                                data-day={dayKey(day)}
                                style={{ ...at(3, column + 2), height: `${24 * HOUR_PX}px` }}
                            >
                                <div className="CalendarView-hoursOff" style={{ top: 0, height: `${(workHours.start / 60) * HOUR_PX}px` }} />
                                <div className="CalendarView-hoursOff" style={{ top: `${(workHours.end / 60) * HOUR_PX}px`, bottom: 0 }} />

                                {/* The free part of the day: a press here creates at that slot. Below the blocks, so a press on one never lands here. */}
                                <div
                                    className={`CalendarView-hoursSlots${creatable ? ' is-creatable' : ''}`}
                                    onClick={(click): void => {
                                        if (!creatable) {
                                            return;
                                        }

                                        const box = click.currentTarget.getBoundingClientRect();
                                        const minutes = Math.floor((((click.clientY - box.top) / HOUR_PX) * 60) / step) * step;

                                        createAt(day, minutes);
                                    }}
                                />

                                {showNow && <div className="CalendarView-hoursNow" aria-hidden="true" style={{ top: `${(minuteOfDay(now) / 60) * HOUR_PX}px` }} />}

                                {blocks.map((block) => {
                                    const { event } = block;
                                    const busy = props.moving.indexOf(event.id) >= 0;
                                    const height = Math.max(((block.end - block.start) / 60) * HOUR_PX - 2, 18);
                                    const roomy = height >= 40;
                                    const time = props.showTimes
                                        ? roomy && event.end
                                            ? `${formatTime(event.start, props.names)} – ${formatTime(event.end, props.names)}`
                                            : formatTime(event.start, props.names)
                                        : null;
                                    const classes = ['CalendarView-hoursEvent'];

                                    if (roomy) {
                                        classes.push('is-roomy');
                                    }

                                    if (busy) {
                                        classes.push('is-moving');
                                    }

                                    if (drag && drag.id === event.id) {
                                        classes.push('is-held');
                                    }

                                    return (
                                        <div
                                            key={event.id}
                                            className={classes.join(' ')}
                                            data-event={event.id}
                                            data-start={block.start}
                                            data-end={block.end}
                                            data-lane={`${block.lane}/${block.lanes}`}
                                            style={{
                                                top: `${(block.start / 60) * HOUR_PX + 1}px`,
                                                height: `${height}px`,
                                                insetInlineStart: `calc(${(block.lane / block.lanes) * 100}% + 1px)`,
                                                width: `calc(${100 / block.lanes}% - 3px)`,
                                                ...(event.color ? { borderInlineStartColor: event.color } : {}),
                                            }}
                                            onPointerDown={(pointer): void => {
                                                const cell = pointer.currentTarget.parentElement;

                                                begin(pointer, event, 'move', column, block.start, block.end, cell ? cell.getBoundingClientRect().width : 0);
                                            }}
                                            onPointerMove={during}
                                            onPointerUp={(pointer): void => finish(pointer, false)}
                                            onPointerCancel={(pointer): void => finish(pointer, true)}
                                        >
                                            {title(event, time)}
                                            {event.badge && roomy && <span className="CalendarView-eventBadge">{event.badge}</span>}
                                            {menu(event, block.end - block.start, busy, true)}
                                            {busy && <span className="CalendarView-eventBusy">{getString('CalendarView_Moving')}</span>}
                                            {/* The bottom edge resizes the end. A handle takes only the press — see the timeline's. */}
                                            {interactive && props.hasEnd && !busy && (
                                                <span
                                                    className="CalendarView-hoursHandle"
                                                    onPointerDown={(pointer): void => {
                                                        pointer.stopPropagation();

                                                        const cell = pointer.currentTarget.parentElement?.parentElement;

                                                        begin(pointer, event, 'end', column, block.start, block.end, cell ? cell.getBoundingClientRect().width : 0);
                                                    }}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
