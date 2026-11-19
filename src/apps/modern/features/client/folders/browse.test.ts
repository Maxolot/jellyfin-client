import { describe, expect, it } from 'vitest';

import { filterFolderItems, folderDuration, moveFolderItem, orderedFolderItems, type FolderItem } from './model';

const entries: FolderItem[] = [
    { itemId: 'one', type: 'movie', tmdbId: null },
    { itemId: 'unavailable', type: 'tv', tmdbId: null },
    { itemId: 'two', type: 'tv', tmdbId: null },
    { itemId: 'three', type: 'movie', tmdbId: null }
];

describe('folder browsing', () => {
    it('applies title type, watched state and sorting to the saved contents', () => {
        const items = orderedFolderItems(entries, [
            { Id: 'one', Type: 'Movie', Name: 'Zéphyr', ProductionYear: 2021, UserData: { Key: 'one', Played: true } },
            { Id: 'two', Type: 'Series', Name: 'Atlas', ProductionYear: 2024, UserData: { Key: 'two', Played: false } },
            { Id: 'three', Type: 'Movie', Name: 'Brume', ProductionYear: 2025 }
        ]);
        expect(filterFolderItems(items, { type: '', viewed: '', sort: 'name' }).map(entry => entry.itemId)).toEqual(['two', 'three', 'one']);
        expect(filterFolderItems(items, { type: 'movie', viewed: 'unseen', sort: 'year' }).map(entry => entry.itemId)).toEqual(['three']);
        expect(filterFolderItems(items, { type: '', viewed: 'seen', sort: '' }).map(entry => entry.itemId)).toEqual(['one']);
    });

    it('reorders the complete server list, preserving items without local metadata', () => {
        expect(moveFolderItem(entries, 'two', -1)).toEqual(['one', 'two', 'unavailable', 'three']);
        expect(moveFolderItem(entries, 'one', -1)).toBeUndefined();
        expect(moveFolderItem(entries, 'three', 1)).toBeUndefined();
        expect(moveFolderItem(entries, 'unknown', 1)).toBeUndefined();
    });

    it('formats a total duration in French', () => {
        expect(folderDuration(6e8 * 142)).toBe('2 h 22');
        expect(folderDuration(6e8 * 51)).toBe('51 min');
    });
});
