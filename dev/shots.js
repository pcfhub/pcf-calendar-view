/*
 * Retake every screenshot in `media/` from `dev/preview.html`.
 *
 *     npm run harness -- --no-open --port 8094     # in one shell
 *     npm run shots                                # in another
 *     npm run shots -- hours                       # only the recipes whose name contains "hours"
 *
 * **The recipes live here, not in SPEC.md's prose.** They were a paragraph of
 * Chrome flags until 0.3.0; this is the same set — the demo fixture on the
 * week of 14 September 2026 at UTC−5, 760px — through the template's engine
 * (`dev/cdp.js`), plus the hour grid's two.
 *
 * **New names on every retake that changes a picture.** The hub mirrors
 * `media/` by path and never fetches a path again; the run says when a
 * published name changed.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { shoot, sleep } = require('./cdp');

const root = path.join(__dirname, '..');
const BASE = 'fixture=demo&date=2026-09-14&zone=-300&width=760';

const RECIPES = [
    {
        name: 'screenshot-month-v2.png',
        purpose: 'the month, the demo fixture',
        page: 'dev/preview.html',
        query: `${BASE}&view=month`,
        width: 792,
        frame: '.CalendarView',
    },
    {
        name: 'screenshot-week-v2.png',
        purpose: 'the week as a list — the hour grid off',
        page: 'dev/preview.html',
        query: `${BASE}&view=week`,
        width: 792,
        frame: '.CalendarView',
    },
    {
        name: 'screenshot-timeline-selected.png',
        purpose: 'the timeline with a day pressed',
        page: 'dev/preview.html',
        query: `${BASE}&view=timeline&select=2026-09-09`,
        width: 792,
        frame: '.CalendarView',
    },
    {
        name: 'screenshot-hours-week.png',
        purpose: 'the week against the hours, opened on the working day',
        page: 'dev/preview.html',
        query: `${BASE}&view=week&hours=1`,
        width: 792,
        frame: '.CalendarView',
    },
    {
        name: 'screenshot-hours-day.png',
        purpose: 'one day against its hours',
        page: 'dev/preview.html',
        query: `${BASE}&view=day&hours=1`,
        width: 792,
        frame: '.CalendarView',
    },
    {
        name: 'screenshot-hours-narrow.png',
        purpose: 'the hour grid in a 373px column: the days scroll sideways inside the box',
        page: 'dev/preview.html',
        query: 'fixture=demo&date=2026-09-14&zone=-300&width=373&view=week&hours=1',
        width: 405,
        frame: '.CalendarView',
    },
];

(async () => {
    const published = new Set(((JSON.parse(fs.readFileSync(path.join(root, 'pcfhub.json'), 'utf8')).media || {}).screenshots || [])
        .map((file) => path.basename(file)));
    const before = new Map(RECIPES.map((recipe) => {
        const file = path.join(root, 'media', recipe.name);

        return [recipe.name, fs.existsSync(file) ? fs.readFileSync(file) : null];
    }));

    // The preview renders three times as the fetch lands (0, 50, 300 ms) and presses a day at 400.
    await sleep(0);

    const failed = await shoot(RECIPES, {
        root,
        port: process.env.PORT || 8094,
        wait: 1800,
        only: process.argv.slice(2),
    });

    for (const [name, old] of before) {
        const file = path.join(root, 'media', name);

        if (old && published.has(name) && fs.existsSync(file) && !old.equals(fs.readFileSync(file))) {
            console.log(`\n  ${name} changed under a name pcfhub.json already publishes — the hub keeps serving the old`
                + '\n  picture. Give the new one a new name and repoint pcfhub.json and the docs.');
        }
    }

    if (failed > 0) {
        console.log(`\n  ${failed} of ${RECIPES.length} failed`);
        process.exit(1);
    }
})().catch((error) => {
    console.error(`\n  ${error.message}\n`);
    process.exit(1);
});
