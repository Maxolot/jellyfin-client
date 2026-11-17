import { describe, expect, it } from 'vitest';

import { exactSearchFirst, groupSearchResults, matchesSearchTitle } from './searchResults';

describe('search provenance', () => {
    it('keeps Jellyfin copies and saved titles out of the requestable group', () => {
        const local = { Id: 'jellyfin-film', Name: 'Dune', Type: 'Movie', ProviderIds: { Tmdb: '100' } } as const;
        const saved = { Id: 'seerr-tv-200', Name: 'Dune : Prophétie', Type: 'Series' } as const;
        const result = groupSearchResults([local], [saved], [
            { Id: 'seerr-movie-100', Name: 'Dune' },
            { ...saved },
            { Id: 'seerr-movie-300', Name: 'Dune : Deuxième partie' }
        ]);
        expect(result.own.map(item => item.Id)).toEqual(['jellyfin-film']);
        expect(result.saved.map(item => item.Id)).toEqual(['seerr-tv-200']);
        expect(result.suggestion.map(item => item.Id)).toEqual(['seerr-movie-300']);
    });

    it('puts a remote title matched to an actual Jellyfin copy in the library', () => {
        const matched = { Id: 'jellyfin-match', Name: 'Dune', Type: 'Movie' } as const;
        expect(groupSearchResults([], [], [matched])).toEqual({ own: [matched], saved: [], suggestion: [] });
    });

    it('matches accents and prioritizes exact titles', () => {
        const almost = { Name: 'L’Été dernier' };
        const exact = { Name: 'Été' };
        expect(matchesSearchTitle(almost.Name, 'ete dernier')).toBe(true);
        expect(matchesSearchTitle(exact.Name, ' ')).toBe(false);
        expect(exactSearchFirst([almost, exact], ' ete ')).toEqual([exact, almost]);
    });
});
