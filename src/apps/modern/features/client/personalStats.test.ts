import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { describe, expect, it } from 'vitest';

import { distinctHistory, formatHours, genreShares, summarizeViewing } from './personalStats';

const hour = 36e9;
const now = Date.parse('2026-11-03T12:00:00Z');

describe('personal viewing statistics', () => {
    it('counts plays, series, recent activity and repeated viewings', () => {
        const movies = [
            { Id: 'm1', RunTimeTicks: 2 * hour, Genres: ['Drame'], UserData: { Key: 'k', PlayCount: 2, LastPlayedDate: '2026-10-30T20:00:00Z' } },
            { Id: 'm2', RunTimeTicks: hour, Genres: ['Drame', 'Comédie'], UserData: { Key: 'k', PlayCount: 0, LastPlayedDate: '2025-01-01T20:00:00Z' } }
        ] as BaseItemDto[];
        const episodes = [
            { Id: 'e1', SeriesId: 's1', RunTimeTicks: hour / 2, UserData: { Key: 'k', PlayCount: 1, LastPlayedDate: '2026-11-01T20:00:00Z' } },
            { Id: 'e2', SeriesId: 's1', RunTimeTicks: hour / 2, UserData: { Key: 'k', PlayCount: 1 } },
            { Id: 'e3', SeriesId: 's2', RunTimeTicks: hour, UserData: { Key: 'k', PlayCount: 1 } }
        ] as BaseItemDto[];
        const series = [{ Id: 's1', Genres: ['Comédie'], UserData: { Key: 'k', Played: true } }, { Id: 's2', Genres: ['Drame'], UserData: { Key: 'k', Played: false } }] as BaseItemDto[];
        const stats = summarizeViewing(movies, episodes, series, now);
        expect(stats).toMatchObject({ movies: 2, episodes: 3, series: 2, finishedSeries: 1, hours: 7, recent: 2 });
        expect(stats.genres.map(genre => [genre.name, genre.count])).toEqual([['Drame', 3], ['Comédie', 2]]);
        expect(stats.genres[1].share).toBeCloseTo(2 / 3);
    });

    it('limits genres and ignores duplicates inside one title', () => {
        expect(genreShares([{ Genres: ['A', 'A', 'B'] }, { Genres: ['B'] }], 1)).toEqual([{ name: 'B', count: 2, share: 1 }]);
    });

    it('keeps the latest entry of each series in history', () => {
        const items = [{ Id: 'e2', SeriesId: 's1' }, { Id: 'm1' }, { Id: 'e1', SeriesId: 's1' }, { Id: '' }];
        expect(distinctHistory(items).map(item => item.Id)).toEqual(['e2', 'm1']);
    });

    it('formats short and long durations', () => {
        expect(formatHours(0.5)).toBe('30 min');
        expect(formatHours(1234.4)).toMatch(/^1\s234 h$/);
    });
});
