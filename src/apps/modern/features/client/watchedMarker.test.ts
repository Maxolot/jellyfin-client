import { describe, expect, it } from 'vitest';

import { isWatchedCard } from './model';

describe('watched card marker', () => {
    it('recognizes watched films and completed series from Jellyfin user data', () => {
        expect(isWatchedCard({ Type: 'Movie', UserData: { Key: 'fixture', Played: true } })).toBe(true);
        expect(isWatchedCard({ Type: 'Series', UserData: { Key: 'fixture', Played: true, UnplayedItemCount: 0 } })).toBe(true);
    });

    it('keeps partially watched series, unwatched titles and other cards unmarked', () => {
        expect(isWatchedCard({ Type: 'Series', UserData: { Key: 'fixture', Played: true, UnplayedItemCount: 1 } })).toBe(false);
        expect(isWatchedCard({ Type: 'Series', UserData: { Key: 'fixture', Played: false, UnplayedItemCount: 0 } })).toBe(false);
        expect(isWatchedCard({ Type: 'Movie' })).toBe(false);
        expect(isWatchedCard({ Type: 'Episode', UserData: { Key: 'fixture', Played: true } })).toBe(false);
    });

    it('respects the preference and prioritizes an active resume position even without a runtime', () => {
        expect(isWatchedCard({ Type: 'Movie', UserData: { Key: 'fixture', Played: true, PlaybackPositionTicks: 10 } })).toBe(false);
        expect(isWatchedCard({ Type: 'Movie', UserData: { Key: 'fixture', Played: true } }, false)).toBe(false);
    });
});
