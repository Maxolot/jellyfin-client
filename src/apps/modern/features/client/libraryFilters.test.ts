import { describe, expect, it } from 'vitest';

import { countLibraryFilters, libraryFilterQuery, readLibraryFilters } from './libraryFilters';

const studio = 'c11b1097027e410ca195a97f0a6ac944';

describe('advanced library filters', () => {
    it('parses a shared link and combines the five native filters', () => {
        const params = new URLSearchParams({ mode: 'library', year: '2024', minRating: '7.5', studio, tag: 'À revoir', watched: 'unplayed' });
        const filters = readLibraryFilters('films', params);
        expect(countLibraryFilters(filters)).toBe(5);
        expect(libraryFilterQuery(filters)).toEqual({
            years: [2024], minCommunityRating: 7.5, studioIds: [studio], tags: ['À revoir'], isPlayed: false
        });
    });

    it('ignores invalid values while preserving a valid watched criterion', () => {
        const params = new URLSearchParams({ mode: 'library', year: '99999', minRating: '11', studio: 'other', tag: ' ', watched: 'played' });
        const filters = readLibraryFilters('series', params);
        expect(countLibraryFilters(filters)).toBe(1);
        expect(libraryFilterQuery(filters)).toEqual({
            years: undefined, minCommunityRating: undefined, studioIds: undefined, tags: undefined, isPlayed: true
        });
    });

    it('keeps the criteria out of discovery, search and the missing-only catalogue', () => {
        const params = new URLSearchParams({ mode: 'library', availability: 'missing', year: '2024' });
        expect(readLibraryFilters('films', params)).toEqual({});
        params.delete('availability');
        expect(readLibraryFilters('search', params)).toEqual({});
        params.set('mode', 'discover');
        expect(readLibraryFilters('films', params)).toEqual({});
    });
});
