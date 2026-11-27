export type Layout = 'best' | 'list' | 'posters' | 'wide' | 'chips' | 'more';
export type NavGroup = { layout: Layout; size: number };
export type Move = 'down' | 'up' | 'right' | 'left' | 'next' | 'previous';

/** Rows of posters and pastilles are crossed with left and right; lists with up and down. */
export const isHorizontal = (layout: Layout) => layout === 'posters' || layout === 'wide' || layout === 'chips';

function starts(groups: NavGroup[]) {
    const result: number[] = [];
    let sum = 0;
    for (const group of groups) {
        result.push(sum);
        sum += group.size;
    }
    return result;
}

function locate(groups: NavGroup[], active: number) {
    const first = starts(groups);
    const group = first.findIndex((start, index) => active >= start && active < start + groups[index].size);
    return { group, first, offset: group >= 0 ? active - first[group] : -1 };
}

function jump(groups: NavGroup[], active: number, delta: number) {
    const { group, first, offset } = locate(groups, active);
    let next = group + delta;
    while (next >= 0 && next < groups.length && !groups[next].size) next += delta;
    if (next < 0 || next >= groups.length) return null;
    // Moving between two rows keeps the column, as on a television remote.
    const keep = group >= 0 && isHorizontal(groups[group].layout) && isHorizontal(groups[next].layout);
    return first[next] + (keep ? Math.min(offset, groups[next].size - 1) : 0);
}

function sideways(groups: NavGroup[], active: number, delta: number) {
    const { group, first } = locate(groups, active);
    if (group < 0) return 0;
    return Math.max(first[group], Math.min(first[group] + groups[group].size - 1, active + delta));
}

function vertical(groups: NavGroup[], active: number, delta: number, total: number) {
    if (active < 0) return delta > 0 ? 0 : total - 1;
    const { group } = locate(groups, active);
    if (group >= 0 && isHorizontal(groups[group].layout)) return jump(groups, active, delta);
    return Math.max(0, Math.min(total - 1, active + delta));
}

/**
 * The option a key leads to, or null when the key keeps its usual meaning
 * (the caret moves in the text, Tab leaves the last group).
 */
export function moveActive(groups: NavGroup[], active: number, move: Move, typing: boolean): number | null {
    const total = groups.reduce((sum, group) => sum + group.size, 0);
    if (!total) return null;
    const { group } = locate(groups, active);
    const inRow = group >= 0 && isHorizontal(groups[group].layout);
    switch (move) {
        case 'down': return vertical(groups, active, 1, total);
        case 'up': return vertical(groups, active, -1, total);
        case 'right':
        case 'left':
            // Within a typed query the arrows move the caret, except on a row of posters or pastilles.
            if (typing && !inRow) return null;
            return sideways(groups, active, move === 'right' ? 1 : -1);
        case 'next': return jump(groups, active, 1);
        case 'previous': return active < 0 ? null : jump(groups, active, -1);
    }
}
