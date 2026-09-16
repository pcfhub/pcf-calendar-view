/*
 * Drives the real built bundle outside a browser.
 *
 *     npm run build && npm run smoke
 *
 * What it does: installs the DOM and the platform globals, loads
 * `out/controls/CalendarView/bundle.js` the way a form would, binds it to a
 * twelve-record view with three pages in it, and asserts what the control did —
 * both what it rendered and what it asked the platform for.
 *
 * Why it exists alongside `npm start` and `dev/harness.html`: half of what a
 * dataset control does is ask the platform for things, and a rendered table
 * shows none of it. Whether a sort *replaced* the order or appended to it,
 * whether a page turn asked for page two or for "one more page", whether a page
 * size change settles or loops — those are decisions, they are what regresses,
 * and here they are assertions with an exit code.
 *
 * Why no test framework: there is none in this repository, and adding one to
 * run a handful of assertions against a bundle would be a dependency, a config
 * file and a second build pipeline for something `node` already does. It also
 * runs the **built bundle** rather than the TypeScript sources, which is the
 * part worth checking. CI runs it after the msbuild pack, so there it drives
 * the production bundle.
 *
 * **What passing here does NOT mean.** Every record below is supplied by this
 * file. It cannot tell you that a real view hands over what this fixture hands
 * over, that server-side sorting sorts the same way, that `openDatasetItem`
 * opens anything, or that the control looks right. Keep those in SPEC.md under
 * "Not verified".
 *
 * **The quirks default to the platform's observed misbehaviour, not to its
 * documentation**, and that is load-bearing. See the header of `dev/host.js`:
 * a harness modelling the platform as written down passes a control that cannot
 * page on a real form.
 *
 * ---
 *
 * **The assertions below the divider are a worked example. Replace them.**
 * Everything above the divider is plumbing that works for any dataset control;
 * the examples exercise the scaffolded table and are meant to be thrown away
 * with it.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const dom = require('./dom.js');
const host = require('./host.js');
const clock = require('./clock.js');
const fixture = require('./fixture.js');

const BUNDLE = path.join(root, 'out', 'controls', 'CalendarView', 'bundle.js');

if (!fs.existsSync(BUNDLE)) {
    console.error('\n  No bundle at out/controls/CalendarView. Run npm run build first.\n');
    process.exit(1);
}

/* ----------------------------------------------------------- the platform */

dom.install(global);

/*
 * Time, replaced with something the test drives.
 *
 * `vm.runInThisContext` below evaluates the bundle in *this* realm, so the
 * `Date`, `setInterval` and `setTimeout` the control closes over are the ones
 * installed here — no injectable clock parameter, and therefore no production
 * code bent to suit a harness.
 *
 * A dataset control is likelier to want a timer than a field control is: an
 * auto-refreshing view, a debounce around `dataset.refresh()`, a countdown in a
 * cell. A control with none is unaffected — nothing schedules and
 * `time.pending()` stays at zero — but the teardown assertion at the bottom of
 * this file is written against it either way.
 */
// Mid-September, so `today` lands in the month the fixture populates.
const time = clock.install(Date.UTC(2026, 8, 14, 12, 0, 0), global);

const registration = host.captureRegistration(global);

const source = fs.readFileSync(BUNDLE, 'utf8');

/*
 * The platform libraries, supplied under the names the bundle actually asks
 * for — read out of the bundle rather than written down here.
 *
 * A `<platform-library>` entry becomes a webpack external, and the global it
 * compiles to carries a version in its name. **That version is not the one the
 * manifest declares.** `pcf-scripts` maps a declared version onto the platform
 * build it supports, so Fluent `9.46.2` arrives as `FluentUIReactv940` and
 * React `16.14.0` as `Reactv16`. Hardcoding either is a trap that springs on
 * the next version bump, with a `ReferenceError` naming a global that appears
 * nowhere in the repository.
 *
 * A standard control has no externals at all, in which case both lists are
 * empty and nothing below runs.
 */
const reactGlobals = [...new Set(source.match(/\bReactv[\w]*\b/g) || [])];
const fluentGlobals = [...new Set(source.match(/\bFluentUIReact[\w]*\b/g) || [])];

let React = null;

if (reactGlobals.length > 0) {
    React = require(path.join(root, 'node_modules', 'react'));
    reactGlobals.forEach((name) => {
        global[name] = React;
    });
}

/*
 * Fluent is stubbed rather than loaded: every component resolves to its own
 * name as an element type, so the props the control passed survive for
 * inspection. These assertions are about the control's decisions, not about how
 * Fluent renders them — and Fluent 9 ships no UMD build to load anyway.
 */
/*
 * **A stand-in component per name, not the name as the element type.** React
 * lower-cases an unknown element, so `MenuItem` became `<menuitem>` — which
 * HTML treats as a void element, and `renderToStaticMarkup` throws rather
 * than give it children. Every capitalised export is therefore a function
 * component rendering a `<div data-fluent="Name">` with the string, number
 * and boolean props the control passed — className, aria-*, title, disabled
 * — so `renderDeep` can look for them; a lower-case export (`webLightTheme`,
 * `tokens`) is a plain object. Found by `pcf-calendar-view`, whose move menu
 * was the first `MenuItem` a suite tried to render.
 */
const standIns = new Map();

function fluentStandIn(name) {
    if (!standIns.has(name)) {
        const StandIn = (props) => {
            const passed = { 'data-fluent': name };

            Object.keys(props || {}).forEach((key) => {
                const value = props[key];

                if (key !== 'children' && ['string', 'number', 'boolean'].includes(typeof value)) {
                    passed[key] = value;
                }
            });

            return React.createElement('div', passed, props.children);
        };

        StandIn.displayName = name;
        standIns.set(name, StandIn);
    }

    return standIns.get(name);
}

const fluent = new Proxy({}, {
    get: (_target, name) => {
        if (typeof name !== 'string') {
            return undefined;
        }

        return /^[A-Z]/.test(name) ? fluentStandIn(name) : {};
    },
});

fluentGlobals.forEach((name) => {
    global[name] = fluent;
});

vm.runInThisContext(source, { filename: 'bundle.js' });

/**
 * Render what a virtual control returned, executing the component body.
 *
 * **`updateView` only *builds* an element.** A virtual control's component does
 * not run until something renders it, so an assertion that reads props alone
 * cannot see a crash inside the component — and half of what a React dataset
 * control does lives there. That is not hypothetical: the `dataset.sorting`
 * crash below is in the component, and a props-only suite passes against the
 * broken control.
 *
 * `react-dom/server` needs no DOM and no browser. Fluent is stubbed, so its
 * components render as their own names and the markup is meaningless — the
 * point is entirely whether rendering threw.
 *
 * Returns `null` for a standard control, which has no element and no react-dom.
 */
function renderDeep(element) {
    if (element === undefined || element === null || React === null) {
        return null;
    }

    let server = null;

    try {
        server = require(path.join(root, 'node_modules', 'react-dom', 'server'));
    } catch (error) {
        return null;
    }

    // React's development warnings about unknown element types would bury the
    // report; the assertions are about throwing, not about tag names.
    const warn = console.error;
    console.error = () => {};

    try {
        return server.renderToStaticMarkup(element);
    } finally {
        console.error = warn;
    }
}

/* ---------------------------------------------------------------- harness */

const results = [];

function check(label, ok, detail) {
    results.push({ ok, label, detail });
}

// `getString` returns a marked key rather than a real string, so an assertion
// can tell "read from the .resx" apart from "hardcoded in the source".
const marked = (key) => `resx:${key}`;

/**
 * Bind a fresh control to a fresh view and render until it settles.
 *
 * The returned handle exposes both halves: what was drawn (or, for a virtual
 * control, what was passed down), and what the platform was asked to do.
 */
/**
 * Every control bound and not yet destroyed.
 *
 * A suite that binds and walks away is testing something other than what it
 * says: an abandoned control keeps its interval and its `document` listeners,
 * so the next section's counts include them. That is the leak the teardown
 * assertion exists to catch, and asserting it from inside one proves nothing.
 */
const live = [];

function disposeAll() {
    while (live.length > 0) {
        live.pop().destroy();
    }
}

/*
 * The manifest's inputs at their declared defaults — what a maker who touched
 * nothing hands the control. No `pageSize`: that property carries no
 * `default-value`, so leaving it out is the state the adopt-the-host path
 * needs to be reachable at all.
 */
const INPUTS = {
    defaultView: 'month',
    weekStart: 'auto',
    initialDate: null,
    allowMove: true,
    allowCreate: true,
    openOnEventClick: true,
    showTimes: true,
};

function bind(options) {
    const settings = { ...options, inputs: { ...INPUTS, ...((options || {}).inputs || {}) } };
    const handle = host.createHost(fixture, { getString: marked, ...settings });
    const container = dom.createElement('div');
    const instance = new registration.ctor();

    let notifications = 0;

    instance.init(handle.context, () => {
        notifications += 1;
    }, {}, container);

    let driven = host.drive(instance, handle, 10);

    const view = {
        instance,
        container,
        handle,
        get driven() {
            return driven;
        },
        /** The props a virtual control passed down; `{}` for a standard one. */
        props: () => (driven.element && driven.element.props) || {},
        calls: () => handle.state.calls,
        /** How many times the control said its outputs changed. */
        notifications: () => notifications,
        outputs: () => (instance.getOutputs ? instance.getOutputs() : {}),
        find: (selector) => container.querySelector(selector),
        findAll: (selector) => container.querySelectorAll(selector),
        /** Let the platform catch up after something the control asked for. */
        settle: () => {
            driven = host.drive(instance, handle, 10);

            return driven;
        },
        /** Unmount, as the platform does when the form closes or navigates. */
        destroy: () => {
            instance.destroy();

            const at = live.indexOf(view);

            if (at !== -1) {
                live.splice(at, 1);
            }
        },
    };

    live.push(view);

    return view;
}

check('bundle registered a control', typeof registration.ctor === 'function');

if (typeof registration.ctor !== 'function') {
    report();
}

/* -------------------------------------------------------------- helpers */

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** A wall clock at midnight, the way the component hands days to the control. */
const W = (year, month, day) => ({ year, month: month - 1, day, hour: 0, minute: 0 });

const SEPTEMBER = { first: W(2026, 8, 30), last: W(2026, 10, 3) };

/** The rendered markup, or `''` where nothing rendered. */
const markup = (view) => renderDeep(view.driven.element) || '';

/** The inner HTML of one day cell. */
function cell(html, day) {
    const match = new RegExp(`<td[^>]*data-day="${day}"[^>]*>([\\s\\S]*?)</td>`).exec(html);

    return match ? match[1] : null;
}

/** The event titles drawn on one day, from the `title=` each chip carries. */
function titlesOn(html, day) {
    const inner = cell(html, day);

    if (inner === null) {
        return null;
    }

    return [...inner.matchAll(/class="CalendarView-eventTitle"[^>]*title="([^"]*)"/g)].map((hit) => hit[1]);
}

/** A local `Date` with these components — what `dateForWrite` hands `setValue`. */
const local = (year, month, day, hour, minute) => new Date(year, month - 1, day, hour, minute, 0, 0);

/* ----------------------------------------------------------- the basics */

const plain = bind({});

check(
    'settles instead of refreshing forever',
    !plain.driven.looping && plain.driven.passes === 1,
    `${plain.driven.passes} passes, calls: ${plain.calls().join(' ')}`,
);

check('finds the four roles by alias', plain.props().hasStart && plain.props().hasTitle && plain.props().hasEnd && plain.props().hasColor, JSON.stringify({
    start: plain.props().hasStart, title: plain.props().hasTitle, end: plain.props().hasEnd, color: plain.props().hasColor,
}));

check('and reads each role\'s format off its column', plain.props().startFormat === 'datetime' && plain.props().endFormat === 'datetime', `${plain.props().startFormat} / ${plain.props().endFormat}`);

check('hands the loaded rows over unread, one per record', plain.props().rows.length === 5 && typeof plain.props().rows[0].start === 'string', `${plain.props().rows.length} rows, start is a ${typeof (plain.props().rows[0] || {}).start}`);

check('does not fetch from updateView — the window comes from the component, from an effect', !plain.calls().some((call) => call.startsWith('filtering.setFilter')), plain.calls().join(' '));

const noStart = bind({ columns: fixture.columns.map((column) => (column.alias === 'startField' ? { ...column, alias: 'scheduledstart' } : column)) });

check('with no start role there is no calendar, and it says so', noStart.props().hasStart === false && markup(noStart).includes('resx:CalendarView_NoStart'), markup(noStart).slice(0, 200));

/* ------------------------------------------------------------ the window */

const windowed = bind({});

windowed.props().onRangeChange(SEPTEMBER.first, SEPTEMBER.last);

const setFilter = windowed.calls().find((call) => call.startsWith('filtering.setFilter'));
const filterOrder = ['filtering.setFilter', 'paging.reset', 'refresh'].map((name) => windowed.calls().findIndex((call) => call.startsWith(name)));

check('the visible range is asked for server-side: setFilter, then reset, then one refresh', Boolean(setFilter) && filterOrder[0] < filterOrder[1] && filterOrder[1] < filterOrder[2], windowed.calls().join(' '));

check('and exactly one refresh, because a second in flight is dropped', windowed.calls().filter((call) => call === 'refresh').length === 1, windowed.calls().join(' '));

const expression = windowed.handle.dataset.filtering.getFilter();

check(
    'as start ≤ last AND (end ≥ first OR end IS NULL), the Or nested as a child filter',
    Boolean(expression)
        && expression.filterOperator === 0
        && expression.conditions.length === 1
        && expression.conditions[0].attributeName === 'scheduledstart'
        && expression.conditions[0].conditionOperator === 26
        && expression.conditions[0].value === '2026-10-03'
        && Array.isArray(expression.filters)
        && expression.filters[0].filterOperator === 1
        && expression.filters[0].conditions.some((c) => c.attributeName === 'scheduledend' && c.conditionOperator === 27 && c.value === '2026-08-30')
        && expression.filters[0].conditions.some((c) => c.attributeName === 'scheduledend' && c.conditionOperator === 12),
    JSON.stringify(expression),
);

windowed.settle();

check('after which the rows are the ones in the window — the October and August events gone, the endless one kept', windowed.props().rows.every((row) => row.id !== 'e5' && row.id !== 'e12') && windowed.handle.dataset.paging.totalResultCount === 9, `${windowed.props().rows.map((row) => row.id).join(',')} of ${windowed.handle.dataset.paging.totalResultCount}`);

check('a month bigger than a page offers Load more', windowed.props().hasNextPage === true && windowed.props().loadedCount === 5, `hasNextPage ${windowed.props().hasNextPage}, ${windowed.props().loadedCount} loaded`);

windowed.props().onLoadMore();
windowed.settle();

check('which loads the rest without turning the page', windowed.props().rows.length === 9 && windowed.calls().some((call) => call === 'loadNextPage'), `${windowed.props().rows.length} rows`);

windowed.props().onRangeChange(SEPTEMBER.first, SEPTEMBER.last);

check('the same window again is not a second fetch', windowed.calls().filter((call) => call === 'refresh').length === 1, windowed.calls().join(' '));

const noEnd = bind({ columns: fixture.columns.map((column) => (column.alias === 'endField' ? { ...column, alias: 'scheduledend' } : column)) });

noEnd.props().onRangeChange(SEPTEMBER.first, SEPTEMBER.last);

const noEndExpression = noEnd.handle.dataset.filtering.getFilter();

check('without an end role the window is first ≤ start ≤ last, no child filter', Boolean(noEndExpression) && noEndExpression.conditions.length === 2 && !noEndExpression.filters, JSON.stringify(noEndExpression));

const unfilterable = bind({ quirks: { filteringAbsent: true } });

unfilterable.props().onRangeChange(SEPTEMBER.first, SEPTEMBER.last);

check('a host with no filtering is told, not fetched from', unfilterable.props().canFilter === false && !unfilterable.calls().some((call) => call === 'refresh') && markup(unfilterable).includes('resx:CalendarView_NoFilter'), unfilterable.calls().join(' '));

/* ---------------------------------------------------------- placement */

/*
 * The whole reason the rig has a user zone. 02:30Z on the 15th is the evening
 * of the 14th for a user at UTC-5 and lunchtime on the 15th at UTC+10, and
 * the browser running this suite is in neither — so a control reading the
 * browser's zone fails one of these two whatever machine it runs on.
 */
const west = bind({ userTimeZoneOffset: -300 });
const east = bind({ userTimeZoneOffset: 600 });

check('places a timed event by the day in the *user\'s* zone: UTC-5 puts the 02:30Z dinner on the 14th', (titlesOn(markup(west), '2026-09-14') || []).includes('Board dinner'), JSON.stringify(titlesOn(markup(west), '2026-09-14')));

check('and UTC+10 puts the same instant on the 15th', (titlesOn(markup(east), '2026-09-15') || []).includes('Board dinner') && !(titlesOn(markup(east), '2026-09-14') || []).includes('Board dinner'), JSON.stringify(titlesOn(markup(east), '2026-09-15')));

check('with its time formatted through the user\'s pattern, in that zone', cell(markup(west), '2026-09-14').includes('9:30 PM'), (cell(markup(west), '2026-09-14') || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200));

const european = bind({ userTimeZoneOffset: 120, dateFormattingInfo: { shortTimePattern: 'HH:mm', firstDayOfWeek: 1 } });
const europeanMarkup = markup(european);

check('a 24-hour pattern renders as one', cell(europeanMarkup, '2026-09-15').includes('04:30'), (cell(europeanMarkup, '2026-09-15') || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 120));

check('and the week starts on the user\'s own first day', /<th[^>]*>Mon<\/th>/.test(europeanMarkup.split('</tr>')[0]), europeanMarkup.split('</tr>')[0].slice(-200));

check('unless the maker fixed it', /<th[^>]*>Sun<\/th>/.test(markup(bind({ userTimeZoneOffset: 120, dateFormattingInfo: { firstDayOfWeek: 1 }, inputs: { weekStart: 'sunday' } })).split('</tr>')[0]), '');

check('a multi-day event appears on every day it covers', ['2026-09-16', '2026-09-17', '2026-09-18'].every((day) => (titlesOn(markup(west), day) || []).includes('Offsite')), ['2026-09-16', '2026-09-17', '2026-09-18'].map((day) => JSON.stringify(titlesOn(markup(west), day))).join(' '));

check('marked as continuing on the days it did not start', /is-continued[^>]*>[\s\S]*?title="Offsite"/.test(cell(markup(west), '2026-09-17') || ''), (cell(markup(west), '2026-09-17') || '').slice(0, 200));

check('an end before its start is drawn as a single day, not backwards', (titlesOn(markup(west), '2026-09-22') || []).includes('Backwards booking') && !(titlesOn(markup(west), '2026-09-21') || []).includes('Backwards booking'), '');

check('a record with no start is not an event', !markup(west).includes('Unscheduled call'), '');

check('today wears aria-current', /aria-current="date"/.test(cell(markup(plain), '2026-09-14') || ''), (cell(markup(plain), '2026-09-14') || '').slice(0, 160));

const noNames = bind({ dateFormattingInfo: false });

check('a host that publishes no dateFormattingInfo still gets English names and h:mm tt', /<th[^>]*>Sun<\/th>/.test(markup(noNames)) && markup(noNames).includes('September 2026'), markup(noNames).slice(0, 300));

/* ------------------------------------------------ a Date Only column */

const dueColumns = fixture.columns.map((column) => {
    if (column.alias === 'startField') {
        return { ...column, alias: 'scheduledstart' };
    }

    if (column.name === 'cll_dueon') {
        return { ...column, alias: 'startField', isHidden: false };
    }

    if (column.alias === 'endField') {
        return { ...column, alias: 'scheduledend' };
    }

    return column;
});

const dueWest = bind({ columns: dueColumns, userTimeZoneOffset: -300 });
const dueEast = bind({ columns: dueColumns, userTimeZoneOffset: 600 });

check('a Date Only column reads as whole days from the UTC components, the same day in every zone', (titlesOn(markup(dueWest), '2026-09-14') || []).includes('Board dinner') && (titlesOn(markup(dueEast), '2026-09-14') || []).includes('Board dinner'), `${JSON.stringify(titlesOn(markup(dueWest), '2026-09-14'))} / ${JSON.stringify(titlesOn(markup(dueEast), '2026-09-14'))}`);

check('drawn all-day, with no time', /is-allDay/.test(cell(markup(dueWest), '2026-09-14') || '') && !/CalendarView-eventTime/.test(cell(markup(dueWest), '2026-09-14') || ''), '');

check('and the format is read off the column', dueWest.props().startFormat === 'date', dueWest.props().startFormat);

/* -------------------------------------------------------- capabilities */

check('offers moves where the record can be written', plain.props().canMove === true, String(plain.props().canMove));

check('and where only the Web API can', bind({ quirks: { editableAbsent: true } }).props().canMove === true, '');

check('but not where neither can', bind({ webAPI: false, quirks: { editableAbsent: true } }).props().canMove === false, '');

check('nor when the maker turned moving off', bind({ inputs: { allowMove: false } }).props().canMove === false, '');

check('offers to create where the host has a form to open', plain.props().canCreate === true, '');

check('but not on canvas, which has no forms', bind({ host: 'canvas' }).props().canCreate === false, '');

check('a canvas host still gets a calendar, from what the view loaded', markup(bind({ host: 'canvas' })).includes('data-day="2026-09-14"') && bind({ host: 'canvas' }).props().loadMetadata === null, '');

check('the default view is passed down', bind({ inputs: { defaultView: 'week' } }).props().defaultView === 'week' && /CalendarView--week/.test(markup(bind({ inputs: { defaultView: 'week' } }))), '');

check('a week view shows seven days and no more', (markup(bind({ inputs: { defaultView: 'week' } })).match(/data-day=/g) || []).length === 7, String((markup(bind({ inputs: { defaultView: 'week' } })).match(/data-day=/g) || []).length));

check('a month view shows whole weeks — five for September 2026, not a padded six', (markup(plain).match(/data-day=/g) || []).length === 35, String((markup(plain).match(/data-day=/g) || []).length));

check('opens on the initialDate the maker set', markup(bind({ inputs: { initialDate: '2026-03-10' } })).includes('March 2026') && (markup(bind({ inputs: { initialDate: '2026-03-10' } })).match(/data-day=/g) || []).length === 35, '');

check('and on today when it is empty or unreadable', markup(bind({ inputs: { initialDate: 'next tuesday' } })).includes('September 2026'), '');

check('hidden when the host says so', markup(bind({ visible: false })) === '', markup(bind({ visible: false })).slice(0, 80));

check('an error from the platform is shown as one', bind({ error: true }).props().error === true && /role="alert"/.test(markup(bind({ error: true }))), '');

/* --------------------------------------------------------- selection */

const selecting = bind({});

selecting.props().onSelectDay(W(2026, 9, 20));

check('selecting a day notifies and outputs it as yyyy-MM-dd', selecting.notifications() === 1 && selecting.outputs().selectedDate === '2026-09-20', JSON.stringify(selecting.outputs()));

selecting.props().onSelectDay(W(2026, 9, 20));

check('the same day again is not a second notification', selecting.notifications() === 1, String(selecting.notifications()));

const opening = bind({});

opening.props().onOpenRecord('e3');

check('opening an event goes through openDatasetItem with the named reference, and reports the id', opening.calls().some((call) => call.startsWith('openDatasetItem')) && opening.outputs().openedRecordId === 'e3', opening.calls().join(' '));

/* ------------------------------------------------------- creating */

/* ---------------------------------------------------------- moving */

(async () => {
    const creating = bind({ contextInfo: { entityTypeName: 'account', entityId: 'p-1', entityRecordName: 'Fabrikam' }, openFormReturns: { savedEntityReference: [{ id: '{9B2F3C4D-0000-4000-8000-000000000042}', entityType: 'appointment' }] } });

    creating.props().onCreate(W(2026, 9, 20));
        await flush();

    const opened = creating.calls().find((call) => call.startsWith('navigation.openForm'));

    check('creating on a day opens the quick create with the day as a form parameter in the short date pattern of the user — never the ISO day, which a form reads as UTC midnight (measured 2026-09-16: 9/19 6:00 PM)', Boolean(opened) && opened.includes('"useQuickCreateForm":true') && opened.includes('"parameters":{"scheduledstart":"9/20/2026"}'), opened || 'no openForm');

    const european = bind({ dateFormattingInfo: { shortDatePattern: 'dd.MM.yyyy' } });

    european.props().onCreate(W(2026, 9, 5));
    await flush();

    check('in whatever short date pattern the user has', european.calls().some((call) => call.includes('"parameters":{"scheduledstart":"05.09.2026"}')), european.calls().filter((c) => c.startsWith('navigation.openForm')).join(' '));

    check('seeded from the parent record on a form subgrid', Boolean(opened) && opened.includes('"createFromEntity":{"entityType":"account","id":"p-1"}'), opened || '');

    check('and selects the day', creating.outputs().selectedDate === '2026-09-20', JSON.stringify(creating.outputs()));


    const moved = bind({ userTimeZoneOffset: -300 });

    moved.props().onMove('e1', 1);

    check('a move repaints immediately rather than waiting for the server', moved.notifications() >= 1 && moved.outputs().movedRecordId === 'e1', JSON.stringify(moved.outputs()));

    check('and selects the day the event landed on', moved.outputs().selectedDate === '2026-09-15', moved.outputs().selectedDate);

    moved.settle();

    check('placing the event on its new day before the write resolves', (titlesOn(markup(moved), '2026-09-15') || []).includes('Board dinner') && !(titlesOn(markup(moved), '2026-09-14') || []).includes('Board dinner'), JSON.stringify(titlesOn(markup(moved), '2026-09-15')));

    check('shown as busy', moved.props().moving.includes('e1'), JSON.stringify(moved.props().moving));

    await flush();

    const staged = moved.calls().filter((call) => call.startsWith('record.setValue'));

    // 21:30 on the 14th for a UTC-5 user, a day later: 21:30 on the 15th, as a
    // Date whose *local* components say so.
    const expectStart = local(2026, 9, 15, 21, 30).toISOString();
    const expectEnd = local(2026, 9, 15, 23, 30).toISOString();

    check(
        'writing the start through the record, a day later with the time of day kept',
        staged.some((call) => call === `record.setValue("scheduledstart=\\"${expectStart}\\"")`),
        staged.join(' ') || 'no record.setValue',
    );

    check('and the end, shifted by the same days so the duration holds', staged.some((call) => call === `record.setValue("scheduledend=\\"${expectEnd}\\"")`), staged.join(' '));

    check('then one save', moved.calls().filter((call) => call.startsWith('record.save')).length === 1, moved.calls().join(' '));

    check('and not the Web API, which this record did not need', !moved.calls().some((call) => call.startsWith('webAPI.updateRecord')), '');

    check('then refreshing, so the override retires against real data', moved.calls().some((call) => call === 'refresh'), '');

    moved.settle();

    check('after which the event is placed from the record with no override left', (titlesOn(markup(moved), '2026-09-15') || []).includes('Board dinner') && !moved.props().moving.includes('e1'), '');

    /*
     * The Web API route, and the shape it wants. The control has not read
     * metadata here, so behaviour is unknown and the value is an instant —
     * the same instant a User Local column stores: the user's 21:30 on the
     * 15th at UTC-5 is 02:30Z on the 16th.
     */
    const readOnly = bind({ userTimeZoneOffset: -300, quirks: { readOnlyColumns: ['scheduledstart'] } });

    readOnly.props().onMove('e1', 1);
    await flush();

    const viaApi = readOnly.calls().find((call) => call.startsWith('webAPI.updateRecord'));

    check(
        'a column the record refuses to edit is written through the Web API instead, both columns in one call',
        Boolean(viaApi) && viaApi.includes('"scheduledstart":"2026-09-16T02:30:00.000Z"') && viaApi.includes('"scheduledend":"2026-09-16T04:30:00.000Z"'),
        viaApi || 'no updateRecord',
    );

    check('with nothing staged on the record', !readOnly.calls().some((call) => call.startsWith('record.setValue')), '');

    /*
     * A date-*formatted* column whose behaviour is unknown goes to the Web
     * API as an instant at the user's noon, never as a bare day: measured
     * 2026-09-16, a bare day into a User Local column formatted as Date Only
     * displayed the previous day. Only metadata saying Date Only earns the
     * bare day (the check below this one).
     */
    const dueUnknown = bind({ columns: dueColumns, userTimeZoneOffset: -300, quirks: { editableAbsent: true } });

    dueUnknown.props().onMove('e1', 2);
    await flush();

    const dueUnknownCall = dueUnknown.calls().find((call) => call.startsWith('webAPI.updateRecord'));

    check('a date-formatted column of unknown behaviour is written to the Web API as an instant at noon in the zone of the user, not a bare day', Boolean(dueUnknownCall) && dueUnknownCall.includes('"cll_dueon":"2026-09-16T17:00:00.000Z"'), dueUnknownCall || 'no updateRecord');

    /*
     * With metadata read, a Date Only column goes to the Web API as a bare
     * day — and a User Local one as the instant in the user's zone.
     */
    const dueApi = bind({ columns: dueColumns, userTimeZoneOffset: 600, quirks: { editableAbsent: true } });

    const metadata = await dueApi.props().loadMetadata();

    check('reads the start column\'s Behavior off the metadata node', metadata.startBehavior === 'dateonly', metadata.startBehavior);

    dueApi.props().onMove('e1', 2);
    await flush();

    const dueCall = dueApi.calls().find((call) => call.startsWith('webAPI.updateRecord'));

    check('and writes a Date Only column to the Web API as a bare day', Boolean(dueCall) && dueCall.includes('"cll_dueon":"2026-09-16"'), dueCall || 'no updateRecord');

    const viaRecordDue = bind({ columns: dueColumns, userTimeZoneOffset: 600 });

    viaRecordDue.props().onMove('e1', 2);
    await flush();

    const dueStaged = viaRecordDue.calls().find((call) => call.startsWith('record.setValue'));

    check('and through the record as a local Date anchored at midday', Boolean(dueStaged) && dueStaged.includes(local(2026, 9, 16, 12, 0).toISOString()), dueStaged || 'no setValue');

    const refused = bind({ userTimeZoneOffset: -300, quirks: { saveRejects: true } });

    refused.props().onMove('e1', 1);
    refused.settle();
    await flush();
    refused.settle();

    check('a refused save puts the event back and says so', (titlesOn(markup(refused), '2026-09-14') || []).includes('Board dinner') && refused.props().moveError !== null && refused.props().moveError.startsWith('resx:CalendarView_MoveFailed'), `${JSON.stringify(titlesOn(markup(refused), '2026-09-14'))} / ${refused.props().moveError}`);

    const zeroMove = bind({});

    zeroMove.props().onMove('e1', 0);
    await flush();

    check('dropping an event back on its own day is not a write', !zeroMove.calls().some((call) => call.startsWith('record.setValue')), zeroMove.calls().join(' '));

    /* ------------------------------------------------------ metadata */

    const withMeta = bind({});
    const read = await withMeta.props().loadMetadata();

    check('asks getEntityMetadata for the three bound columns at once', withMeta.calls().some((call) => call.includes('utils.getEntityMetadata') && call.includes('"scheduledstart","scheduledend","prioritycode"')), withMeta.calls().join(' '));

    check('reads a User Local behaviour', read.startBehavior === 'userlocal' && read.endBehavior === 'userlocal', `${read.startBehavior} / ${read.endBehavior}`);

    check('and the option colours off the descriptor array, skipping the option with none', read.colors.get(2) === '#D13438' && read.colors.get(0) === '#8A8886' && !read.colors.has(1), JSON.stringify([...read.colors]));

    check('a host with no utils has nothing to load', bind({ utils: false }).props().loadMetadata === null, '');

    // The control warns on this path, by design; the suite's output is not the place to read it.
    const rejects = bind({ quirks: { metadataRejects: true } });
    const warn = console.warn;

    console.warn = () => {};

    const fallback = await rejects.props().loadMetadata();

    console.warn = warn;

    check('a rejected metadata read falls back to placing by shape rather than failing', fallback.startBehavior === 'unknown' && fallback.colors.size === 0, JSON.stringify(fallback));

    /* ------------------------------------------------------ teardown */

    disposeAll();

    const timersBefore = time.pending();
    const listeners = () => Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0);
    const listenersBefore = listeners();

    bind({}).destroy();

    check('destroy() releases every timer the control took', time.pending() === timersBefore, `${timersBefore} → ${time.pending()}`);
    check('and every document-level listener', listeners() === listenersBefore, `${listenersBefore} → ${listeners()}`);

    const rerendered = bind({});
    const afterFirst = time.pending();

    rerendered.settle();
    rerendered.settle();

    check('and re-rendering does not add another one', time.pending() === afterFirst, `${afterFirst} → ${time.pending()}`);

    disposeAll();
    report();
})().catch((error) => {
    check('the asynchronous checks ran at all', false, String((error && error.stack) || error));
    report();
});

function report() {
    const failed = results.filter((result) => !result.ok);

    for (const result of results) {
        const detail = result.detail ? `  — ${result.detail}` : '';

        console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${detail}`);
    }

    console.log(
        failed.length > 0
            ? `\n  ${failed.length} of ${results.length} failed\n`
            : `\n  ${results.length} passed — the control's own decisions only; see SPEC.md for what a real view still has to confirm\n`,
    );

    process.exit(failed.length > 0 ? 1 : 0);
}
