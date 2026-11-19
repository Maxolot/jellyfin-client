import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { describe, expect, it } from 'vitest';

import { isProtectedEpisode } from './spoilers';

describe('episode spoiler protection', () => {
    const episode: BaseItemDto = { Id: 'episode', Type: 'Episode' };

    it('protects only unplayed episodes when the preference is enabled', () => {
        expect(isProtectedEpisode(true, episode)).toBe(true);
        expect(isProtectedEpisode(false, episode)).toBe(false);
        expect(isProtectedEpisode(true, { ...episode, Type: 'Movie' })).toBe(false);
        expect(isProtectedEpisode(true, { ...episode, UserData: { Key: 'episode', Played: true } })).toBe(false);
    });

    it('keeps resumed and explicitly next episodes visible', () => {
        expect(isProtectedEpisode(true, { ...episode, UserData: { Key: 'episode', Played: false, PlaybackPositionTicks: 800 } })).toBe(false);
        expect(isProtectedEpisode(true, episode, ['other', 'episode'])).toBe(false);
        expect(isProtectedEpisode(true, episode, ['other', null])).toBe(true);
    });
});
