/*
 * The view the dev harness binds: appointments, chosen for the edges.
 *
 * **This is not `demo/records.json`.** That one is the hub's demo fixture — it
 * exists to look like a working calendar on a public page. This one exists to
 * break one:
 *
 *   - **an evening appointment that is one day in UTC and another in the
 *     user's zone** (`e1`), because a calendar is the control where the zone
 *     shows: an event lands on a day, and the wrong zone lands it on the
 *     wrong one silently.
 *   - **a multi-day event** (`e2`) that has to appear on every day it covers,
 *     and **one with no end** (`e3`), which a window filter that requires an
 *     end would drop.
 *   - **an end before its start** (`e4`) — data the platform allows and a
 *     calendar must not draw backwards.
 *   - **an event outside the month** (`e5`), so a window filter that filters
 *     nothing is caught by a count.
 *   - **a Date Only column** (`cll_dueon`) beside the User Local pair, so a
 *     suite can rebind `startField` to it and see whole days placed from the
 *     UTC components rather than the browser's.
 *   - **a null start** (`e7`), which is not an event at all.
 *   - **twelve records at a page size of five**, so a month has more than a
 *     page and Load more is reachable.
 *
 * Loaded by `harness.html` in a browser and by `smoke.js` in Node, so it
 * assigns both ways and depends on neither.
 */

(function (root, factory) {
    'use strict';

    var fixture = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = fixture;
    }

    if (root) {
        root.__pcfFixture = fixture;
    }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    return {
        targetEntityType: 'appointment',
        entitySetName: 'appointments',
        title: 'My Appointments',

        /*
         * What `utils.getEntityMetadata('appointment', [column]).Attributes
         * .get(column)` carries for each bound column.
         *
         * A datetime node carries `Behavior` (1 User Local, 2 Date Only,
         * 3 Time Zone Independent) and `Format` ('date' | 'dateandtime') on
         * the node itself. A choice node's colours are on the descriptor
         * array only — `attributeDescriptor.OptionSet[].Color` — and one
         * option here has none, which is what an uncoloured option looks
         * like.
         */
        metadata: {
            scheduledstart: { behavior: 1, format: 'dateandtime' },
            scheduledend: { behavior: 1, format: 'dateandtime' },
            cll_dueon: { behavior: 2, format: 'date' },
            prioritycode: {
                shape: 'descriptor',
                options: [
                    { value: 0, label: 'Low', color: '#8A8886' },
                    { value: 1, label: 'Normal' },
                    { value: 2, label: 'High', color: '#D13438' },
                ],
            },
        },

        relationships: [],
        related: {},

        columns: [
            {
                name: 'subject',
                displayName: 'Subject',
                dataType: 'SingleLine.Text',
                alias: 'titleField',
                order: 0,
                visualSizeFactor: 200,
                isPrimary: true,
            },
            {
                name: 'scheduledstart',
                displayName: 'Start Time',
                dataType: 'DateAndTime.DateAndTime',
                alias: 'startField',
                order: 1,
                visualSizeFactor: 130,
            },
            {
                name: 'scheduledend',
                displayName: 'End Time',
                dataType: 'DateAndTime.DateAndTime',
                alias: 'endField',
                order: 2,
                visualSizeFactor: 130,
            },
            {
                name: 'prioritycode',
                displayName: 'Priority',
                dataType: 'OptionSet',
                alias: 'colorField',
                order: 3,
                visualSizeFactor: 90,
            },
            /*
             * A Date Only column in the view but bound to no role; a suite
             * rebinds `startField` here to see whole days placed. Its values
             * are held as the platform hands them over — the day at UTC
             * midnight — so a reader taking local components sees the
             * previous day west of Greenwich, here as on a form.
             */
            {
                name: 'cll_dueon',
                displayName: 'Due on',
                dataType: 'DateAndTime.DateOnly',
                alias: 'cll_dueon',
                order: 4,
                visualSizeFactor: 110,
                isHidden: true,
            },
        ],

        /*
         * Values as the platform hands them over: a date is an ISO **string**
         * (a User Local one the true instant; a Date Only one its day at UTC
         * midnight), a choice its integer.
         */
        records: [
            // 02:30Z on the 15th is 21:30 on the 14th for a UTC-5 user and 12:30 on the 15th for UTC+10.
            { id: 'e1', values: { subject: 'Board dinner', scheduledstart: '2026-09-15T02:30:00Z', scheduledend: '2026-09-15T04:30:00Z', prioritycode: 2, cll_dueon: '2026-09-14T00:00:00.000Z' } },
            // Three days, 16th to 18th, at any zone within twelve hours of Greenwich.
            { id: 'e2', values: { subject: 'Offsite', scheduledstart: '2026-09-16T14:00:00Z', scheduledend: '2026-09-18T16:00:00Z', prioritycode: 1, cll_dueon: '2026-09-16T00:00:00.000Z' } },
            // No end at all.
            { id: 'e3', values: { subject: 'Dentist', scheduledstart: '2026-09-21T15:00:00Z', scheduledend: null, prioritycode: 0, cll_dueon: '2026-09-21T00:00:00.000Z' } },
            // An end before its start.
            { id: 'e4', values: { subject: 'Backwards booking', scheduledstart: '2026-09-22T15:00:00Z', scheduledend: '2026-09-20T15:00:00Z', prioritycode: 1, cll_dueon: '2026-09-22T00:00:00.000Z' } },
            // October: outside a September window.
            { id: 'e5', values: { subject: 'Quarterly review', scheduledstart: '2026-10-06T13:00:00Z', scheduledend: '2026-10-06T14:00:00Z', prioritycode: 2, cll_dueon: '2026-10-06T00:00:00.000Z' } },
            { id: 'e6', values: { subject: 'Site visit', scheduledstart: '2026-09-24T13:00:00Z', scheduledend: '2026-09-24T17:00:00Z', prioritycode: 1, cll_dueon: '2026-09-20T00:00:00.000Z' } },
            // No start: not an event.
            { id: 'e7', values: { subject: 'Unscheduled call', scheduledstart: null, scheduledend: null, prioritycode: 0, cll_dueon: null } },
            { id: 'e8', values: { subject: 'Sprint planning', scheduledstart: '2026-09-14T14:00:00Z', scheduledend: '2026-09-14T15:00:00Z', prioritycode: 1, cll_dueon: '2026-09-14T00:00:00.000Z' } },
            { id: 'e9', values: { subject: 'Interview — Priya Raman', scheduledstart: '2026-09-14T16:30:00Z', scheduledend: '2026-09-14T17:15:00Z', prioritycode: 2, cll_dueon: '2026-09-14T00:00:00.000Z' } },
            { id: 'e10', values: { subject: 'Consolidated Messenger Intercontinental kickoff, with the whole account team', scheduledstart: '2026-09-25T09:00:00Z', scheduledend: '2026-09-25T10:00:00Z', prioritycode: 0, cll_dueon: '2026-09-25T00:00:00.000Z' } },
            // A choice value the option set does not carry: no colour, label as given.
            { id: 'e11', values: { subject: 'Audit prep', scheduledstart: '2026-09-28T13:00:00Z', scheduledend: '2026-09-28T14:00:00Z', prioritycode: 9, cll_dueon: '2026-09-28T00:00:00.000Z' } },
            // August: outside the window the other way.
            { id: 'e12', values: { subject: 'Summer party', scheduledstart: '2026-08-21T20:00:00Z', scheduledend: '2026-08-21T23:00:00Z', prioritycode: 0, cll_dueon: '2026-08-21T00:00:00.000Z' } },
        ],

        /*
         * The other tables a control reads through `webAPI.retrieveMultipleRecords`.
         * `usersettings` is the user's own row, as the form answered it
         * (SPEC.md H5, 2026-10-04): the working day as `"HH:mm"` strings. A
         * 09:00–18:00 day rather than the form's 08:00–17:00, so a control that
         * ignored the row and drew its own default would be caught.
         */
        tables: {
            usersettings: [
                { systemuserid: '00000000-0000-0000-0000-0000000000aa', workdaystarttime: '09:00', workdaystoptime: '18:00', timeformatstring: 'h:mm tt', timezonecode: 20 },
            ],
        },

        /*
         * 0.4.0's plan, bound on its own (`columns: fixture.columns.concat(
         * fixture.plan.columns), records: fixture.plan.records`) so the
         * September suite's counts are untouched. The October quarter, for a
         * UTC-5 user. A lookup is the `EntityReference` a dataset record hands
         * over — `{ etn, id: { guid }, name }`, the name there even where the
         * row it points at is not loaded (SPEC.md G2). Chosen for the edges:
         *
         *   - **three levels** (Launch › Design › Wireframes) and a chain of
         *     dependencies under one parent;
         *   - **a parent that is not loaded** (Training, January) whose two
         *     tasks sit under a header row named from the lookup;
         *   - **a conflict** (Pilot starts before Write course ends), and
         *     **the boundary** (Handover starts the minute Test ends, which is
         *     no conflict);
         *   - **a loop** both ways (Loop A and Loop B are each other's parent
         *     and predecessor) and **an event that names itself**, neither of
         *     which may hang the render.
         */
        plan: {
            columns: [
                { name: 'cll_parent', displayName: 'Parent', dataType: 'Lookup.Simple', alias: 'parentField', order: -1, visualSizeFactor: 150 },
                { name: 'cll_after', displayName: 'Depends on', dataType: 'Lookup.Simple', alias: 'dependsOnField', order: -1, visualSizeFactor: 150 },
            ],
            records: (function () {
                var names = {
                    t1: 'Launch', t2: 'Design', t3: 'Wireframes', t4: 'Build', t5: 'Test', t6: 'Training',
                    t7: 'Write course', t8: 'Pilot', t9: 'Loop A', t10: 'Loop B', t11: 'Self', t12: 'Handover',
                };
                var ref = function (id) {
                    return id ? { etn: 'appointment', id: { guid: id }, name: names[id] } : null;
                };
                var row = function (id, start, end, parent, after) {
                    return { id: id, values: { subject: names[id], scheduledstart: start, scheduledend: end, prioritycode: 1, cll_dueon: null, cll_parent: ref(parent), cll_after: ref(after) } };
                };

                return [
                    row('t1', '2026-10-05T14:00:00Z', '2026-11-20T22:00:00Z', null, null),
                    row('t2', '2026-10-05T14:00:00Z', '2026-10-16T21:00:00Z', 't1', null),
                    row('t3', '2026-10-05T14:00:00Z', '2026-10-08T21:00:00Z', 't2', null),
                    row('t4', '2026-10-19T14:00:00Z', '2026-11-06T22:00:00Z', 't1', 't2'),
                    row('t5', '2026-11-09T14:00:00Z', '2026-11-13T22:00:00Z', 't1', 't4'),
                    // January: outside the October quarter, never loaded with it.
                    row('t6', '2027-01-11T14:00:00Z', '2027-01-29T22:00:00Z', null, null),
                    row('t7', '2026-11-02T14:00:00Z', '2026-11-20T22:00:00Z', 't6', null),
                    row('t8', '2026-11-18T14:00:00Z', '2026-11-18T22:00:00Z', 't6', 't7'),
                    row('t9', '2026-12-01T14:00:00Z', '2026-12-01T22:00:00Z', 't10', 't10'),
                    row('t10', '2026-12-02T14:00:00Z', '2026-12-02T22:00:00Z', 't9', 't9'),
                    row('t11', '2026-12-07T14:00:00Z', '2026-12-07T22:00:00Z', 't11', 't11'),
                    // The minute Test ends, under no parent.
                    row('t12', '2026-11-13T22:00:00Z', '2026-11-13T23:00:00Z', null, 't5'),
                ];
            })(),
        },
    };
});
