import { beforeEach, describe, expect, it } from 'vitest';

import { clearSearches, forgetSearch, readRecentSearches, recentSearchesKey, rememberSearch } from './recentSearches';

const key = recentSearchesKey('https://media.example.test', 'user-a');

describe('recent searches', () => {
    beforeEach(() => localStorage.clear());

    it('keeps the latest search first without duplicates, whatever the case', () => {
        rememberSearch(key, 'Dune');
        rememberSearch(key, 'Interstellar');
        expect(rememberSearch(key, 'dune')).toEqual(['dune', 'Interstellar']);
    });

    it('keeps at most eight searches and ignores blank ones', () => {
        for (let index = 0; index < 10; index++) rememberSearch(key, `titre ${index}`);
        expect(rememberSearch(key, '   ')).toHaveLength(8);
        expect(readRecentSearches(key)[0]).toBe('titre 9');
    });

    it('is separate for each profile', () => {
        rememberSearch(key, 'Dune');
        expect(readRecentSearches(recentSearchesKey('https://media.example.test', 'user-b'))).toEqual([]);
    });

    it('forgets one search or all of them', () => {
        rememberSearch(key, 'Dune');
        rememberSearch(key, 'Up');
        expect(forgetSearch(key, 'Up')).toEqual(['Dune']);
        expect(clearSearches(key)).toEqual([]);
        expect(localStorage.getItem(key)).toBeNull();
    });

    it('survives damaged storage', () => {
        localStorage.setItem(key, '{oops');
        expect(readRecentSearches(key)).toEqual([]);
    });
});
