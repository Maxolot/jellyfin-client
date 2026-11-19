import { describe, expect, it } from 'vitest';

import { canEditFolder, canFile, orderedFolderItems } from './model';

describe('personal folders', () => {
    it('offers folder actions only for whole local titles', () => {
        expect(canFile({ Id: 'film', Type: 'Movie' })).toBe(true);
        expect(canFile({ Id: 'serie', Type: 'Series' })).toBe(true);
        expect(canFile({ Id: 'episode', Type: 'Episode' })).toBe(false);
        expect(canFile({ Id: 'seerr-movie-123', Type: 'Movie' })).toBe(false);
        expect(canFile({ Type: 'Movie' })).toBe(false);
    });

    it('keeps API order across Jellyfin metadata requests and ignores titles no longer visible', () => {
        const first = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
        const second = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        const entries = [first, 'missing', second].map(itemId => ({ itemId, type: 'movie' as const, tmdbId: null }));
        expect(orderedFolderItems(entries, [
            { Id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', Name: 'Deuxième' },
            { Id: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', Name: 'Premier' }
        ]).map(({ item }) => item.Name)).toEqual(['Premier', 'Deuxième']);
    });

    it('limits edits to owners and editors', () => {
        const folder = { id: 'folder', name: 'Films', ownerId: 'account' };
        expect(canEditFolder({ ...folder, access: 'owner' })).toBe(true);
        expect(canEditFolder({ ...folder, access: 'editor' })).toBe(true);
        expect(canEditFolder({ ...folder, access: 'viewer' })).toBe(false);
    });
});
