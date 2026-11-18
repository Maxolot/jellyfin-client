import { describe, expect, it } from 'vitest';

import { moveActive, type NavGroup } from './navigation';

const results: NavGroup[] = [{ layout: 'best', size: 1 }, { layout: 'list', size: 3 }, { layout: 'chips', size: 2 }, { layout: 'more', size: 1 }];
const opening: NavGroup[] = [{ layout: 'wide', size: 2 }, { layout: 'chips', size: 0 }, { layout: 'posters', size: 6 }, { layout: 'chips', size: 4 }];

describe('moveActive', () => {
    it('walks through lists with up and down', () => {
        expect(moveActive(results, -1, 'down', true)).toBe(0);
        expect(moveActive(results, 0, 'down', true)).toBe(1);
        expect(moveActive(results, 3, 'down', true)).toBe(4);
        expect(moveActive(results, 0, 'up', true)).toBe(0);
        expect(moveActive(results, -1, 'up', true)).toBe(6);
    });

    it('leaves left and right to the caret in a list while typing', () => {
        expect(moveActive(results, 1, 'right', true)).toBeNull();
        expect(moveActive(results, 4, 'right', true)).toBe(5);
        expect(moveActive(results, 5, 'right', true)).toBe(5);
    });

    it('moves between rows of posters keeping the column, skipping empty rows', () => {
        expect(moveActive(opening, 1, 'down', false)).toBe(3);
        expect(moveActive(opening, 6, 'down', false)).toBe(11);
        expect(moveActive(opening, 11, 'up', false)).toBe(5);
        expect(moveActive(opening, 10, 'down', false)).toBeNull();
    });

    it('crosses a row sideways without leaving it', () => {
        expect(moveActive(opening, 2, 'right', false)).toBe(3);
        expect(moveActive(opening, 7, 'right', false)).toBe(7);
        expect(moveActive(opening, 2, 'left', false)).toBe(2);
    });

    it('jumps to the next or previous group with Tab', () => {
        expect(moveActive(results, -1, 'next', true)).toBe(0);
        expect(moveActive(results, 2, 'next', true)).toBe(4);
        expect(moveActive(results, 4, 'previous', true)).toBe(1);
        expect(moveActive(results, 6, 'next', true)).toBeNull();
        expect(moveActive(results, -1, 'previous', true)).toBeNull();
    });

    it('does nothing without options', () => {
        expect(moveActive([{ layout: 'list', size: 0 }], -1, 'down', false)).toBeNull();
    });
});
