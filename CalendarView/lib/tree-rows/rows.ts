/*
 * _template/variants/lib/tree-rows — rows of a tree, from a flat list
 *
 * SHARED. Copied into a control as <Control>/lib/tree-rows/ and kept
 * current by `node ../_template/scripts/sync-rig.mjs --into .`. Edit the
 * template's copy and sync, never this one: an edited copy stops syncing.
 * Lifted on 2026-10-31 from pcf-calendar-view 0.4.1's `planRows`, which nests
 * a timeline's rows by a Parent lookup (its light Gantt, walked on the form
 * 27 Oct 2026).
 */

/**
 * A flat list — a page of a view, a run of fetched records — drawn as a tree
 * by a lookup each item carries to its parent.
 *
 * Pure: no DOM, no dataset, no dates. A control hands over its items, says
 * how to read an item's key and its parent, and gets back the rows to draw,
 * in order, each with its `aria-level`. What a row *shows* stays the
 * control's: Calendar View adds a bracket over a header row's dates from
 * `descendantsOf`, which is why that helper exists.
 *
 * The rules, each one Calendar View's before it was lifted:
 *
 * - **The given order is kept.** A top row stands where its first item would
 *   have been; children keep their order under their parent. Sort the items
 *   before, not after.
 * - **A parent that is not in the list is a header row**, `header:<id>`,
 *   named from the lookup, standing where its first child would. A page of a
 *   view rarely holds every parent, and dropping the children to the top
 *   level would lose the one thing the user asked to see.
 * - **A loop is cut at its earliest item** (A under B under A): that item
 *   becomes a top row. An item that names itself is a top row.
 * - **`collapsed` hides descendants, not the row**: a collapsed row is drawn
 *   with `expanded` false and nothing under it.
 *
 * The keys are compared as given, so hand over ids in one form — a dataset
 * record's id and a lookup's `id.guid` agree bare and lower-case, a braced
 * GUID does not.
 */

/** What an item's parent lookup must carry: its id. A name, a table — whatever the header row should show — rides along. */
export interface TreeParent {
    id: string;
}

/** The tree, before it is flattened: who is under whom. */
export interface Forest<P extends TreeParent> {
    /** Each item's key, in the order the items came. */
    keys: string[];
    /** Top rows in order: an item's key, or `header:` and a parent's id. */
    roots: string[];
    /** The keys under each key, in item order. */
    children: Map<string, string[]>;
    /** A header row's key, and the parent it stands for. */
    headers: Map<string, P>;
    /** An item's position in the list, by its key. */
    index: Map<string, number>;
}

/** One row to draw, in order. */
export interface TreeRow<P extends TreeParent> {
    /** The item's key — or `header:` and the parent's id, for a parent that is not in the list. */
    key: string;
    /** The item's position in the list; `null` on a header row. */
    index: number | null;
    /** On a header row, the parent it stands for; `null` otherwise. */
    header: P | null;
    /** 1 for a top row and one more per level under it: the row's `aria-level`. */
    level: number;
    hasChildren: boolean;
    /** Whether its children are drawn; `false` on a row with none. */
    expanded: boolean;
}

/** The key a header row takes for a parent that is not in the list. */
export function headerKey(parentId: string): string {
    return `header:${parentId}`;
}

/** Who is under whom. `parentOf` returns `null` or `undefined` for an item with no parent. */
export function buildForest<T, P extends TreeParent>(
    items: readonly T[],
    keyOf: (item: T) => string,
    parentOf: (item: T) => P | null | undefined,
): Forest<P> {
    const keys = items.map(keyOf);
    const index = new Map(keys.map((key, at) => [key, at] as [string, number]));
    const parentKey = new Map<string, string>();

    items.forEach((item, at) => {
        const parent = parentOf(item)?.id;

        if (parent && parent !== keys[at] && index.has(parent)) {
            parentKey.set(keys[at], parent);
        }
    });

    // A loop, found by walking up from each item: cut it at its earliest member.
    for (const key of keys) {
        const seen = new Set<string>([key]);
        let at = parentKey.get(key);

        while (at !== undefined && !seen.has(at)) {
            seen.add(at);
            at = parentKey.get(at);
        }

        if (at !== undefined) {
            const loop: string[] = [];
            let member = at;

            do {
                loop.push(member);
                member = parentKey.get(member) as string;
            } while (member !== at);

            loop.sort((a, b) => (index.get(a) as number) - (index.get(b) as number));
            parentKey.delete(loop[0]);
        }
    }

    const children = new Map<string, string[]>();
    const headers = new Map<string, P>();
    const roots: string[] = [];
    const under = (key: string, child: string): void => {
        children.set(key, [...(children.get(key) ?? []), child]);
    };

    items.forEach((item, at) => {
        const key = keys[at];
        const loaded = parentKey.get(key);

        if (loaded !== undefined) {
            under(loaded, key);

            return;
        }

        const lookup = parentOf(item);
        const parent = lookup && lookup.id !== key && !index.has(lookup.id) ? lookup : null;

        if (!parent) {
            roots.push(key);

            return;
        }

        const header = headerKey(parent.id);

        if (!headers.has(header)) {
            headers.set(header, parent);
            roots.push(header);
        }

        under(header, key);
    });

    return { keys, roots, children, headers, index };
}

/** The rows to draw, depth first, with the children of `collapsed` keys left out. */
export function treeRows<P extends TreeParent>(
    forest: Forest<P>,
    collapsed: ReadonlySet<string> = new Set(),
): TreeRow<P>[] {
    const rows: TreeRow<P>[] = [];
    const emit = (key: string, level: number): void => {
        const kids = forest.children.get(key) ?? [];
        const header = forest.headers.get(key) ?? null;
        const expanded = kids.length > 0 && !collapsed.has(key);

        rows.push({
            key,
            index: header ? null : (forest.index.get(key) as number),
            header,
            level,
            hasChildren: kids.length > 0,
            expanded,
        });

        if (expanded) {
            for (const kid of kids) {
                emit(kid, level + 1);
            }
        }
    };

    for (const key of forest.roots) {
        emit(key, 1);
    }

    return rows;
}

/**
 * The positions of every item under `key`, at any depth, depth first —
 * collapsed or not, since a summary of a subtree (a header's date bracket, a
 * count) is about what is there, not what is drawn.
 */
export function descendantsOf<P extends TreeParent>(forest: Forest<P>, key: string): number[] {
    return (forest.children.get(key) ?? []).flatMap((kid) => [forest.index.get(kid) as number, ...descendantsOf(forest, kid)]);
}
