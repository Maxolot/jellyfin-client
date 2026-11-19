import { describe, expect, it, vi } from 'vitest';

import { cataloguePaths, hasCompleteArtwork, resolveCatalogueArtwork } from './catalogArtwork';

const identity = { type: 'tv', id: 192 } as const;

describe('shared catalogue artwork', () => {
    it('only accepts plugin-compatible TMDb filenames', () => {
        expect(cataloguePaths({ posterPath: 'https://host.test/image.jpg', backdropPath: '/something-safe.jpg' }))
            .toEqual({ posterPath: undefined, backdropPath: '/something-safe.jpg' });
        expect(cataloguePaths({ posterPath: '/path/image.jpg' }).posterPath).toBeUndefined();
    });

    it('resolves missing imagery while preserving previously saved paths', async () => {
        const lookup = vi.fn(async () => ({ posterPath: '/alternate.jpg', backdropPath: '/landscape.jpg' }));
        expect(await resolveCatalogueArtwork(identity, { posterPath: '/original.jpg' }, lookup))
            .toEqual({ posterPath: '/original.jpg', backdropPath: '/landscape.jpg' });
        expect(lookup).toHaveBeenCalledExactlyOnceWith(identity);
    });

    it('uses offline metadata and skips a remote lookup when artwork is already complete', async () => {
        const complete = { posterPath: '/poster.jpg', backdropPath: '/landscape.jpg' };
        const lookup = vi.fn(async () => Promise.reject(new Error('offline')));
        expect(hasCompleteArtwork(complete)).toBe(true);
        expect(await resolveCatalogueArtwork(identity, complete, lookup)).toEqual(complete);
        expect(lookup).not.toHaveBeenCalled();
        expect(await resolveCatalogueArtwork(identity, { posterPath: '/poster.jpg' }, lookup)).toEqual({ posterPath: '/poster.jpg', backdropPath: undefined });
    });
});
