import { describe, expect, it } from 'vitest';

import { episodeDateLabel, episodesForSeries, followedSeries, premiereDay } from './personalUpcoming';

describe('personal upcoming episodes', () => {
    it('recognizes favorite series, favorite episodes and resumable episodes', () => {
        expect(followedSeries([
            { Type: 'Series', Id: 'AA-AA' }, { Type: 'Episode', Id: 'ep', SeriesId: 'BBBB' }, { Type: 'Movie', Id: 'film' }
        ], [{ Type: 'Episode', Id: 'other', SeriesId: 'bb-bb' }, { Type: 'Episode', SeriesId: 'cccc' }])).toEqual(['aaaa', 'bbbb', 'cccc']);
    });

    it('filters by series and premiere day and ignores invalid releases', () => {
        const episodes = [
            { Id: 'past', SeriesId: 'AAAA', PremiereDate: '2024-11-18T23:00:00Z' },
            { Id: 'wanted', SeriesId: 'AA-AA', PremiereDate: '2024-11-19T00:00:00Z' },
            { Id: 'other', SeriesId: 'BBBB', PremiereDate: '2024-11-20T00:00:00Z' },
            { Id: 'invalid', SeriesId: 'AAAA', PremiereDate: '2024-11-31' }
        ];
        expect(episodesForSeries(episodes, new Set(['aaaa']), '2024-11-19').map(item => item.Id)).toEqual(['wanted']);
        expect(premiereDay('2024-11-31')).toBeUndefined();
    });

    it('formats the calendar day in French without shifting a UTC premiere', () => {
        const now = new Date(2024, 10, 19, 23, 55);
        expect(episodeDateLabel('2024-11-19T00:00:00Z', now)).toBe('Aujourd’hui');
        expect(episodeDateLabel('2024-11-20T00:00:00Z', now)).toBe('Demain');
        expect(episodeDateLabel('2024-11-21T00:00:00Z', now)).toBe('Jeudi 21 nov.');
        expect(episodeDateLabel('2025-01-01', new Date(2024, 11, 31, 23))).toBe('Demain');
    });
});
