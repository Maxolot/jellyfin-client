import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { describe, expect, it } from 'vitest';

import { tonightCandidates } from './TonightPage';

const movies: BaseItemDto[] = Array.from({ length: 10 }, (_, n) => ({ Id: String(n), Type: 'Movie', Name: `Film ${n}`, Genres: ['Adventure'], RunTimeTicks: (80 + n * 10) * 6e8 }));
describe('three-card evening draw', () => {
    it('respects available duration and exclusions', () => {
        const picks = tonightCandidates(movies, 'Évasion', 100, '', ['0'], [], 1);
        expect(picks.every(item => item.RunTimeTicks! <= 100 * 6e8 && item.Id !== '0')).toBe(true);
    });
    it('replaces all three previous cards when enough candidates remain', () => {
        const first = tonightCandidates(movies, 'Évasion', 0, '', [], [], 1).map(item => item.Id!);
        const second = tonightCandidates(movies, 'Évasion', 0, '', [], first, 2);
        expect(second).toHaveLength(3);
        expect(second.every(item => !first.includes(item.Id!))).toBe(true);
    });
    it('returns fewer cards for a short list and never mutates the library', () => {
        expect(tonightCandidates(movies.slice(0, 1), 'Surprise', 0, '', [], [], 3)).toHaveLength(1);
        expect(movies.map(item => item.Id)).toEqual(Array.from({ length: 10 }, (_, n) => String(n)));
    });
});
