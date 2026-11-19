import { describe, expect, it } from 'vitest';

import { latestFollowed, othersRecent } from './sharedRecent';

const entry = (id: number, addedBy?: string) => ({ type: 'movie' as const, id, title: `Titre ${id}`, addedBy });

describe('othersRecent', () => {
    it('keeps the titles followed by the other accounts, newest first', () => {
        const result = othersRecent([entry(3, 'BBBB'), entry(2, 'aaaa'), entry(1, 'cccc')], 'AAAA');
        expect(result).toEqual({ entries: [entry(3, 'BBBB'), entry(1, 'cccc')], byOthers: true });
    });

    it('falls back to the latest titles when the catalogue does not know who added them', () => {
        const entries = Array.from({ length: 10 }, (_, index) => entry(index));
        expect(othersRecent(entries, 'aaaa')).toEqual({ entries: entries.slice(0, 8), byOthers: false });
    });

    it('compares account identifiers with or without dashes', () => {
        expect(othersRecent([entry(1, '1234abcd-0000')], '1234ABCD0000').entries).toEqual([]);
    });
});

describe('latestFollowed', () => {
    it('sorts dated entries newest first without changing tie and legacy order', () => {
        const server = [entry(1), { ...entry(2), addedAt: '2026-11-17T12:00:00Z' },
            { ...entry(3), addedAt: 'inconnue' }, { ...entry(4), addedAt: '2026-11-19T12:00:00Z' },
            { ...entry(5), addedAt: '2026-11-19T12:00:00Z' }];
        expect(latestFollowed(server).map(item => item.id)).toEqual([4, 5, 2, 1, 3]);
        expect(server.map(item => item.id)).toEqual([1, 2, 3, 4, 5]);
        expect(latestFollowed([entry(9), entry(7), entry(8)]).map(item => item.id)).toEqual([9, 7, 8]);
    });
});
