import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { describe, expect, it } from 'vitest';

import { editDistance, normalizeText, parseQuery, rankItems, rankNames, titleScore } from './searchIndex';

const library: BaseItemDto[] = [
    { Id: 'interstellar', Name: 'Interstellar', Type: 'Movie', ProductionYear: 2014 },
    { Id: 'odyssey', Name: 'L’Odyssée', OriginalTitle: 'The Odyssey', Type: 'Movie', ProductionYear: 2026 },
    { Id: 'dune-1984', Name: 'Dune', Type: 'Movie', ProductionYear: 1984 },
    { Id: 'dune-2021', Name: 'Dune', Type: 'Movie', ProductionYear: 2021 },
    { Id: 'dune-prophecy', Name: 'Dune : Prophecy', Type: 'Series', ProductionYear: 2024 },
    { Id: 'amelie', Name: 'Le Fabuleux Destin d’Amélie Poulain', Type: 'Movie', ProductionYear: 2001 },
    { Id: 'got', Name: 'Game of Thrones', Type: 'Series', ProductionYear: 2011 },
    { Id: 'up', Name: 'Là-haut', OriginalTitle: 'Up', Type: 'Movie', ProductionYear: 2009 }
];
const ids = (query: string, filter?: Parameters<typeof rankItems>[2]) => rankItems(library, query, filter).map(entry => entry.item.Id);

describe('normalizeText', () => {
    it('ignores accents, case and punctuation', () => {
        expect(normalizeText('L’Odyssée')).toBe('l odyssee');
        expect(normalizeText('Fast & Furious')).toBe('fast et furious');
    });
});

describe('editDistance', () => {
    it('counts a swap of two letters once', () => {
        expect(editDistance('interstlelar', 'interstellar', 2)).toBe(1);
        expect(editDistance('abc', 'xyz', 1)).toBe(2);
    });
});

describe('parseQuery', () => {
    it('reads a year as a filter only next to other words', () => {
        expect(parseQuery('dune 2021')).toEqual({ text: 'dune', words: ['dune'], year: 2021 });
        expect(parseQuery('1917')).toEqual({ text: '1917', words: ['1917'] });
    });
});

describe('rankItems', () => {
    it('tolerates typos and missing accents', () => {
        expect(ids('interstelar')[0]).toBe('interstellar');
        expect(ids('odyssee')[0]).toBe('odyssey');
        expect(ids('amelie')[0]).toBe('amelie');
    });

    it('finds a title by its original name', () => {
        expect(ids('the odyssey')[0]).toBe('odyssey');
        expect(ids('up')[0]).toBe('up');
    });

    it('uses the year to choose between remakes', () => {
        expect(ids('dune 2021')[0]).toBe('dune-2021');
        expect(ids('dune 1984')[0]).toBe('dune-1984');
    });

    it('ranks exact titles before longer ones and the newest first among equals', () => {
        expect(ids('dune')).toEqual(['dune-2021', 'dune-1984', 'dune-prophecy']);
    });

    it('matches the word being typed', () => {
        expect(ids('game of thr')[0]).toBe('got');
        expect(ids('inters')[0]).toBe('interstellar');
    });

    it('applies the type filter', () => {
        expect(ids('dune', 'series')).toEqual(['dune-prophecy']);
        expect(ids('dune', 'films')).not.toContain('dune-prophecy');
    });

    it('does not turn short words into other titles', () => {
        expect(ids('uo')).toEqual([]);
        expect(ids('')).toEqual([]);
    });
});

describe('rankNames', () => {
    it('matches people and sagas tolerantly', () => {
        const people = [{ name: 'Christopher Nolan' }, { name: 'Morgan Freeman' }];
        expect(rankNames(people, entry => entry.name, 'nolan')).toEqual([people[0]]);
        expect(rankNames(people, entry => entry.name, 'morgan freman')).toEqual([people[1]]);
        expect(titleScore('Harry Potter - Saga', parseQuery('harry poter'))).toBeGreaterThan(45);
    });
});
