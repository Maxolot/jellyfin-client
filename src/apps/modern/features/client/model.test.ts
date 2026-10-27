import { describe, expect, it } from 'vitest';

import { episodeLabel, progressPercent, uniqueItems } from './model';

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
