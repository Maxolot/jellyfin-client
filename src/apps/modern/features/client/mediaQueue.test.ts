import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { describe, expect, it, vi } from 'vitest';

import { buildMediaQueue, isQueuedVideo } from './mediaQueue';

const film: BaseItemDto = { Id: 'film', Type: 'Movie' };
const show: BaseItemDto = { Id: 'show', Type: 'Series' };
const episode: BaseItemDto = { Id: 'episode', Type: 'Episode', SeriesId: 'show' };
const second: BaseItemDto = { Id: 'second', Type: 'Episode', SeriesId: 'show' };
const missing: BaseItemDto = { Id: 'missing', Type: 'Episode', LocationType: 'Virtual' };

describe('video queues', () => {
    it('expands series where they appear in the source list, discarding duplicates and virtual entries', async () => {
        const loadEpisodes = vi.fn(async () => [episode, missing, second]);
        const queue = await buildMediaQueue([film, show, episode, show, { Id: 'seerr-movie-1', Type: 'Movie' }], loadEpisodes, false);
        expect(queue.map(item => item.Id)).toEqual(['film', 'episode', 'second']);
        expect(loadEpisodes).toHaveBeenCalledExactlyOnceWith('show');
    });

    it('shuffles the full list of playable videos after expanding series', async () => {
        const source = [film, show];
        const queue = await buildMediaQueue(source, async () => [episode, second], true, () => 0);
        expect(queue.map(item => item.Id)).toEqual(['episode', 'second', 'film']);
        expect(source).toEqual([film, show]);
    });

    it('keeps a single episode as a single-item queue and rejects unavailable and non-video items', async () => {
        expect(await buildMediaQueue([missing, episode], async () => [], true)).toEqual([episode]);
        expect(isQueuedVideo({ ...film, IsPlaceHolder: true })).toBe(false);
        expect(isQueuedVideo({ Id: 'song', Type: 'Audio' })).toBe(false);
        expect(isQueuedVideo({ Type: 'Movie' })).toBe(false);
    });
});
