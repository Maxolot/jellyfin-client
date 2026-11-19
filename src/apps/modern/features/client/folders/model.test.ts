import { describe, expect, it } from 'vitest';

import { canEditFolder, canFile, followedMember, folderMemberPath, moveFolderItem, orderedFolderItems } from './model';

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

    it('recognizes only followed external titles and preserves their keys after they appear on disk', () => {
        const external = { Id: 'seerr-movie-42', Name: 'Crépuscule', Type: 'Movie' as const };
        const saved = { itemId: null, tmdbId: 42, type: 'movie' as const, followed: true };
        const local = { Id: 'film', Name: 'Crépuscule', Type: 'Movie' as const };
        expect(followedMember(external, [])).toBeUndefined();
        expect(followedMember(external, [{ type: 'movie', id: 42, title: 'Crépuscule' }])).toEqual({ type: 'movie', id: 42 });
        expect(orderedFolderItems([saved], [external])).toMatchObject([{ key: 'seerr-movie-42', item: external }]);
        const linked = { ...saved, itemId: 'film' };
        expect(orderedFolderItems([linked], [external, local])).toMatchObject([{ key: 'seerr-movie-42', item: local }]);
        expect(folderMemberPath(linked)).toBe('/Followed/movie/42');
        expect(moveFolderItem([linked, { itemId: 'other', type: 'tv', tmdbId: null }], 'seerr-movie-42', 1))
            .toEqual(['other', 'seerr-movie-42']);
    });

    it('limits edits to owners and editors', () => {
        const folder = { id: 'folder', name: 'Films', ownerId: 'account' };
        expect(canEditFolder({ ...folder, access: 'owner' })).toBe(true);
        expect(canEditFolder({ ...folder, access: 'editor' })).toBe(true);
        expect(canEditFolder({ ...folder, access: 'viewer' })).toBe(false);
    });
});
