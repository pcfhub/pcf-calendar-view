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
    Behavior,
    CalendarEvent,
    DateNames,
    Format,
    View,
    Wall,
    compareWall,
    dayKey,
    dayName,
    daysBetween,
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
    visibleRange,
    wallFromKey,
    wallOf,
    weekDays,
    weekday,
} from './calendar';

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
    onMove: (recordId: string, days: number) => void;
    onSelectDay: (day: Wall) => void;
    onCreate: (day: Wall) => void;
    onOpenRecord: (id: string) => void;
    onLoadMore: () => void;
}

const NO_METADATA: Metadata = { startBehavior: 'unknown', endBehavior: 'unknown', colors: new Map() };

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
): [Record<string, number>, (id: string, days: number) => void] {
    const [overlay, setOverlay] = React.useState<Record<string, number>>({});
    const key = eventsKey(events);

    React.useEffect(() => {
        setOverlay({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const place = React.useCallback((id: string, days: number): void => {
        setOverlay((current) => ({ ...current, [id]: (current[id] ?? 0) + days }));
    }, []);

    return [overlay, place];
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
        () =>
            events.map((event) =>
                event.id in overlay
                    ? {
                        ...event,
                        start: shiftDays(event.start, overlay[event.id]),
                        end: event.end ? shiftDays(event.end, overlay[event.id]) : null,
                    }
                    : event,
            ),
        [events, overlay],
    );

    const move = (id: string, days: number): void => {
        if (days === 0) {
            return;
        }

        place(id, days);
        props.onMove(id, days);
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
                className={`CalendarView CalendarView--${view}`}
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
        view === 'month'
            ? `${monthName(props.names, anchor.month)} ${anchor.year}`
            : `${range.first.day} ${monthName(props.names, range.first.month)} – ${range.last.day} ${monthName(props.names, range.last.month)} ${range.last.year}`;

    const days = view === 'month' ? monthGrid(anchor.year, anchor.month, firstDay) : [weekDays(anchor, firstDay)];

    return frame(
        <>
            {props.moveError !== null && (
                <p className="CalendarView-error" role="alert">
                    {props.moveError}
                </p>
            )}

            <div className="CalendarView-toolbar">
                <div className="CalendarView-nav">
                    <Button appearance="subtle" size="small" aria-label={getString('CalendarView_Previous')} disabled={props.disabled} onClick={(): void => step(-1)}>
                        {props.isRTL ? '›' : '‹'}
                    </Button>
                    <Button appearance="secondary" size="small" disabled={props.disabled} onClick={goToday}>
                        {getString('CalendarView_Today')}
                    </Button>
                    <Button appearance="subtle" size="small" aria-label={getString('CalendarView_Next')} disabled={props.disabled} onClick={(): void => step(1)}>
                        {props.isRTL ? '‹' : '›'}
                    </Button>
                </div>

                {/* aria-live so a screen reader hears the month change as the arrows are pressed. */}
                <h2 className="CalendarView-heading" aria-live="polite">
                    {heading}
                </h2>

                <div className="CalendarView-views" role="group" aria-label={getString('CalendarView_ViewLabel')}>
                    <Button appearance={view === 'month' ? 'primary' : 'secondary'} size="small" aria-pressed={view === 'month'} disabled={props.disabled} onClick={(): void => setView('month')}>
                        {getString('View_Month')}
                    </Button>
                    <Button appearance={view === 'week' ? 'primary' : 'secondary'} size="small" aria-pressed={view === 'week'} disabled={props.disabled} onClick={(): void => setView('week')}>
                        {getString('View_Week')}
                    </Button>
                </div>
            </div>

            {props.loading && placed.length === 0 && <p className="CalendarView-message">{getString('CalendarView_Loading')}</p>}

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
                                    events={eventsOn(placed, day)}
                                    onDrop={move}
                                />
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>

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
                        +
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
