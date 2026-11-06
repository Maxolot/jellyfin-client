import { describe, expect, it } from 'vitest';

import { groupGallery, parseGallery } from './avatars';

const manifest = 'https://client.example.test/web/client-avatars/avatars.json';
const entries = [{ id: 'a', name: 'Éleven', collection: 'Stranger Things', file: 'a.webp' }, { id: 'b', name: 'Luffy', collection: 'One Piece', file: 'b.webp' }, { id: 'c', name: 'Dustin', collection: 'Stranger Things', file: 'c.webp' }];

describe('parseGallery', () => {
    it('places files next to the list', () => expect(parseGallery(entries, manifest)[0].url).toBe('https://client.example.test/web/client-avatars/a.webp'));
    it('refuses addresses and paths instead of file names', () => {
        const bad = ['https://evil.test/a.webp', '../secret.webp', '/a.webp', 'a.svg', 'a.html'].map((file, index) => ({ id: String(index), file }));
        expect(parseGallery(bad, manifest)).toEqual([]);
    });
    it('keeps each picture once', () => expect(parseGallery([entries[0], entries[0]], manifest)).toHaveLength(1));
    it('copes with a gallery that is not one', () => {
        expect(parseGallery({ nope: true }, manifest)).toEqual([]);
        expect(parseGallery([null, 3], manifest)).toEqual([]);
    });
});

describe('groupGallery', () => {
    const gallery = parseGallery(entries, manifest);
    it('keeps collections together, in order', () => expect(groupGallery(gallery, '').map(group => [group.collection, group.items.length])).toEqual([['Stranger Things', 2], ['One Piece', 1]]));
    it('searches names and collections, without accents', () => {
        expect(groupGallery(gallery, 'eleven')[0].items[0].id).toBe('a');
        expect(groupGallery(gallery, 'stranger dustin')[0].items.map(item => item.id)).toEqual(['c']);
    });
    it('says nothing matched', () => expect(groupGallery(gallery, 'zzz')).toEqual([]));
});
