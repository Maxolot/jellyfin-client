import { describe, expect, it } from 'vitest';

import { genreIds, matchesCatalogueGenre } from './genres';
import { catalogueItem } from './model';

const movie = [{ id: 35, name: 'Comedy' }, { id: 35, name: 'Comédie' }, { id: 28, name: 'Action' }];
const tv = [{ id: 10759, name: 'Action & Adventure' }, { id: 10765, name: 'Sci-Fi & Fantasy' }];
describe('shared local and external genres', () => {
    it('matches English/French names and accents without duplicating provider IDs', () => {
        expect(genreIds(movie, 'comedie')).toEqual([35]);
        expect(genreIds(movie, 'Comedy')).toEqual([35]);
        expect(genreIds(tv, 'Aventure')).toEqual([10759]);
    });
    it('uses typed external genre IDs for discovery results without genre names', () => {
        const item = catalogueItem({ id: 1, genreIds: [10759] }, 'tv', []);
        expect(matchesCatalogueGenre(item, 'Action', { movie, tv })).toBe(true);
        expect(matchesCatalogueGenre(item, 'Comedy', { movie, tv })).toBe(false);
    });
    it('keeps custom local genre tags valid without inventing an external mapping', () => {
        expect(matchesCatalogueGenre({ Genres: ['Mon genre'] }, 'Mon genre', { movie, tv })).toBe(true);
        expect(genreIds(movie, 'Mon genre')).toEqual([]);
    });
});
