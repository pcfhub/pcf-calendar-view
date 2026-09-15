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
    };
});
