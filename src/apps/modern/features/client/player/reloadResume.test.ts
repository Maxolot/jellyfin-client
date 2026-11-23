import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {} }));

import { forgetPlayback, readPlayback, rememberPlayback, resumeOptions } from './reloadResume';

const entry = { itemId: 'film', serverId: 'server', positionTicks: 600_000_000, runtimeTicks: 6_000_000_000, audioStreamIndex: 2, savedAt: 1000 };

afterEach(() => forgetPlayback());

describe('reload resume', () => {
    it('keeps the playing title for the tab and resumes slightly earlier with the same tracks', () => {
        rememberPlayback(entry);
        expect(readPlayback(2000)).toEqual(entry);
        expect(resumeOptions(entry)).toMatchObject({ ids: ['film'], serverId: 'server', startPositionTicks: 580_000_000, audioStreamIndex: 2 });
    });

    it('ignores stale entries and titles watched to their end', () => {
        rememberPlayback(entry);
        expect(readPlayback(1000 + 7 * 60 * 60 * 1000)).toBeUndefined();
        rememberPlayback({ ...entry, positionTicks: 5_900_000_000 });
        expect(readPlayback(2000)).toBeUndefined();
    });

    it('forgets the title when the player is quit', () => {
        rememberPlayback(entry);
        forgetPlayback();
        expect(readPlayback(2000)).toBeUndefined();
    });
});
