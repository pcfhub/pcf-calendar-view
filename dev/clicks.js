/*
 * The hour grid's pointer paths, pressed with a real mouse inside the hub's
 * own demo harness — what `dev/smoke.js` cannot reach.
 *
 *     npm run harness -- --no-open --port 8094     # this repository
 *     npm run dev:demo-harness                     # in ../pcfhub, port 4174
 *     npm run clicks
 *
 * **Why it exists.** The suite renders the control without a browser, so it
 * runs no pointer events at all, and two defects in one day lived exactly
 * there (2026-10-05, both found on the form):
 *
 *   - the ⋯ menu's items did nothing — Fluent draws the menu in a portal,
 *     React bubbles a portal's `pointerdown` through the component tree to
 *     the block, and the block took pointer capture, which swallowed the
 *     item's click (0.3.1);
 *   - an event's title, a link, did not open the record — a press on it
 *     started the block's drag, the block took pointer capture at once, and
 *     Chrome sends the click to the capturing element, not to the link
 *     (0.3.2: capture waits for the pointer to move).
 *
 * Each check here is a real `Input.dispatchMouseEvent` at an element's
 * place on the page, through `dev/cdp.js`, and reads the answer from the
 * harness's own messages (`openedRecordId`, `movedRecordId`) or the frame.
 * A synthetic `dispatchEvent` would not have caught either defect: it does
 * not run the browser's hit-testing, capture retargeting or click synthesis.
 */

'use strict';

const { launch, sleep } = require('./cdp');

const PORT = process.env.PORT || 8094;
const HARNESS = 'localhost:4174';
const results = [];

function check(label, ok, detail) {
    results.push({ label, ok, detail });
}

(async () => {
    try {
        await fetch(`http://localhost:${PORT}/dev/hub-demo.html`);
    } catch {
        console.error(`\n  Nothing at http://localhost:${PORT}. Run npm run harness -- --no-open --port ${PORT}, and npm run dev:demo-harness in ../pcfhub.\n`);
        process.exit(1);
    }

    const chrome = await launch({ width: 1100, height: 1000 });

    /** An element's centre on the page: its place in the frame plus the frame's place on the page. */
    const centre = async (selector, nth = 0) => {
        const frame = await chrome.evaluate("(() => { const r = document.getElementById('frame').getBoundingClientRect(); return { x: r.left + 1, y: r.top + 1 }; })()");
        const box = await chrome.inFrame(HARNESS, `(() => {
            const el = document.querySelectorAll(${JSON.stringify(selector)})[${nth}];
            if (!el) return null;
            el.scrollIntoView({ block: 'center', inline: 'center' });
            const r = el.getBoundingClientRect();
            return { x: r.left + Math.min(r.width / 2, 24), y: r.top + Math.min(r.height / 2, 8) };
        })()`);

        return box ? { x: frame.x + box.x, y: frame.y + box.y } : null;
    };

    const mouse = (type, at, buttons) => chrome.send('Input.dispatchMouseEvent', {
        type, x: at.x, y: at.y, button: 'left', buttons, clickCount: 1, pointerType: 'mouse',
    });

    const press = async (at, to = at) => {
        await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y, buttons: 0, pointerType: 'mouse' });
        await sleep(120);
        await mouse('mousePressed', at, 1);

        if (to !== at) {
            for (let step = 1; step <= 6; step += 1) {
                await chrome.send('Input.dispatchMouseEvent', {
                    type: 'mouseMoved',
                    x: at.x + ((to.x - at.x) * step) / 6,
                    y: at.y + ((to.y - at.y) * step) / 6,
                    buttons: 1,
                    pointerType: 'mouse',
                });
                await sleep(40);
            }
        }

        await sleep(60);
        await mouse('mouseReleased', to, 0);
        await sleep(900);
    };

    const outputs = (name) => chrome.evaluate(`(window.__messages || []).filter((m) => m.type === 'harness:outputChanged').map((m) => m.outputs.${name}).filter(Boolean)`);
    const open = (preset) => chrome.navigate(`http://localhost:${PORT}/dev/hub-demo.html?preset=${preset}&width=900&height=900`, 9000);

    try {
        for (const preset of ['week-hours', 'day']) {
            await open(preset);

            // 1. A title opens its record.
            const id = await chrome.inFrame(HARNESS, "document.querySelector('.CalendarView-hoursEvent').dataset.event");
            const title = await centre(`.CalendarView-hoursEvent[data-event="${id}"] .CalendarView-eventTitle`);

            await press(title);
            check(`${preset}: pressing an event's title opens its record`, (await outputs('openedRecordId')).includes(id), JSON.stringify(await outputs('openedRecordId')));
        }

        await open('week-hours');

        // 2. A drag still drags, and a drag is not an open.
        const dragged = await chrome.inFrame(HARNESS, "(() => { const b = document.querySelector('.CalendarView-hoursEvent'); return [b.dataset.event, Number(b.dataset.start)]; })()");
        const from = await centre(`.CalendarView-hoursEvent[data-event="${dragged[0]}"]`);

        await press(from, { x: from.x, y: from.y + 48 });

        const landed = await chrome.inFrame(HARNESS, `Number(document.querySelector('.CalendarView-hoursEvent[data-event="${dragged[0]}"]').dataset.start)`);

        check('dragging a block an hour down moves it an hour', landed === dragged[1] + 60, `${dragged[1]} → ${landed}`);
        check('and the drag does not open the record', !(await outputs('openedRecordId')).includes(dragged[0]), JSON.stringify(await outputs('openedRecordId')));

        // 3. The ⋯ menu's items act.
        const menuFor = await chrome.inFrame(HARNESS, "(() => { const b = document.querySelector('.CalendarView-hoursEvent'); return [b.dataset.event, Number(b.dataset.start)]; })()");

        await press(await centre(`.CalendarView-hoursEvent[data-event="${menuFor[0]}"] .CalendarView-eventMenu`));

        const item = await chrome.inFrame(HARNESS, "[...document.querySelectorAll('[role=menuitem]')].findIndex((n) => /minutes later/.test(n.textContent))");

        if (item === -1) {
            check('the ⋯ menu opens with its items', false, 'no "minutes later" item');
        } else {
            await press(await centre('[role=menuitem]', item));

            const after = await chrome.inFrame(HARNESS, `Number(document.querySelector('.CalendarView-hoursEvent[data-event="${menuFor[0]}"]').dataset.start)`);

            check('the ⋯ menu\'s "30 minutes later" moves the event', after === menuFor[1] + 30, `${menuFor[1]} → ${after}`);
            check('and opens nothing', !(await outputs('openedRecordId')).includes(menuFor[0]), '');
        }

        // 4. The all-day row's title opens its record — the Offsite, a week earlier.
        await press(await centre('.CalendarView-navArrow', 0));
        await sleep(800);

        const lane = await chrome.inFrame(HARNESS, "(() => { const b = document.querySelector('.CalendarView-allDayBar'); return b ? b.dataset.event : null; })()");

        if (!lane) {
            check('the all-day row has the Offsite a week earlier', false, 'no all-day bar');
        } else {
            await press(await centre(`.CalendarView-allDayBar[data-event="${lane}"] .CalendarView-eventTitle`));
            check('pressing an all-day bar\'s title opens its record', (await outputs('openedRecordId')).includes(lane), JSON.stringify(await outputs('openedRecordId')));
        }

        // 5. A free slot opens the quick create — on the third day's 2:00 PM line, scrolled into view.
        const frame = await chrome.evaluate("(() => { const r = document.getElementById('frame').getBoundingClientRect(); return { x: r.left + 1, y: r.top + 1 }; })()");
        const spot = await chrome.inFrame(HARNESS, `(() => {
            const label = [...document.querySelectorAll('.CalendarView-hoursLabel')].find((n) => /^2:00/.test(n.textContent.trim()));
            label.scrollIntoView({ block: 'center' });
            const column = document.querySelectorAll('.CalendarView-hoursDay')[2].getBoundingClientRect();
            const line = label.getBoundingClientRect();
            return { x: column.left + column.width / 2, y: line.top + line.height / 2 + 12 };
        })()`);

        await press({ x: frame.x + spot.x, y: frame.y + spot.y });

        const dialog = await chrome.inFrame(HARNESS, "Boolean(document.querySelector('[role=dialog]'))");

        check('pressing a free slot opens the quick create', dialog, '');
    } finally {
        await chrome.close();
    }

    let failed = 0;

    for (const result of results) {
        failed += result.ok ? 0 : 1;
        console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${result.detail ? `  — ${result.detail}` : ''}`);
    }

    console.log(`\n  ${results.length - failed} of ${results.length} passed — real mouse input in the hub's harness\n`);
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
