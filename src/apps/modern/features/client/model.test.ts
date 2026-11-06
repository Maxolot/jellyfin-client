import { describe, expect, it } from 'vitest';

import { episodeLabel, progressPercent, releaseDateLabel, uniqueItems } from './model';

describe('Client media composition', () => {
    it('keeps the episode identity in the playback label', () => {
        expect(episodeLabel({ Type: 'Episode', ParentIndexNumber: 3, IndexNumber: 1 })).toBe('S3:E1');
        expect(episodeLabel({ Type: 'Episode', ParentIndexNumber: 0, IndexNumber: 2 })).toBe('S0:E2');
        expect(episodeLabel({ Type: 'Movie' })).toBe('Lecture');
    });
    it('excludes repeated and already displayed media without discarding order', () => {
        expect(uniqueItems([{ Id: 'b' }, { Id: 'a' }, { Id: 'b' }, {}, { Id: 'c' }], [{ Id: 'a' }]))
            .toEqual([{ Id: 'b' }, { Id: 'c' }]);
    });
    it('handles absent durations and clamps invalid progress', () => {
        expect(progressPercent({})).toBe(0);
        expect(progressPercent({ RunTimeTicks: 100, UserData: { Key: 'test', PlaybackPositionTicks: 75 } })).toBe(75);
        expect(progressPercent({ RunTimeTicks: 100, UserData: { Key: 'test', PlaybackPositionTicks: 200 } })).toBe(100);
    });
});

describe('release date', () => {
    it('formats a full date independently of the browser time zone', () => {
        expect(releaseDateLabel('2026-11-04T00:00:00.000Z')).toBe('4 novembre 2026');
        expect(releaseDateLabel('2026-11-04')).toBe('4 novembre 2026');
    });
    it('falls back to year or an explicit unknown date', () => {
        expect(releaseDateLabel(undefined, 2026)).toBe('2026');
        expect(releaseDateLabel('2026-02-31')).toBe('date inconnue');
        expect(releaseDateLabel()).toBe('date inconnue');
    });
});
