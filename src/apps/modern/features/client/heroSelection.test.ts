import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { describe, expect, it } from 'vitest';

import { familyKey, pickHeroes, tasteProfile, type HeroPool } from './heroSelection';

const now = Date.parse('2026-11-19T12:00:00Z');
const film = (id: string, extra: Partial<BaseItemDto> = {}): BaseItemDto => ({ Id: id, Name: id, Type: 'Movie', CommunityRating: 6,
    DateCreated: '2025-01-01T00:00:00Z', BackdropImageTags: ['b'], Genres: [`genre-${id}`], UserData: { Played: false, Key: '' }, ...extra });
const pool = (items: BaseItemDto[], history: BaseItemDto[] = []): HeroPool => ({ recent: items, rated: [], history });

describe('pickHeroes', () => {
    it('ignores the alphabetical order and leaves out watched titles or titles without backdrop', () => {
        const picked = pickHeroes(pool([film('10 Things'), film('Seen', { UserData: { Played: true, Key: '' } }), film('Bare', { BackdropImageTags: [] }),
            film('Zodiac', { CommunityRating: 9.5 })]), 'films', now);
        expect(picked.map(item => item.Id)).not.toContain('Seen');
        expect(picked.map(item => item.Id)).not.toContain('Bare');
        expect(picked[0].Id).toBe('Zodiac');
    });

    it('favours fresh additions, « Ma liste » and the genres watched most', () => {
        const history = Array.from({ length: 5 }, (_, index) => film(`h${index}`, { Genres: ['Thriller'] }));
        const picked = pickHeroes(pool([film('Old'), film('Fresh', { DateCreated: '2026-11-18T00:00:00Z' }), film('Liked', { UserData: { Played: false, IsFavorite: true, Key: '' } }),
            film('Thriller', { Genres: ['Thriller'] })], history), 'films', now, 3);
        expect(picked.map(item => item.Id)).toEqual(expect.arrayContaining(['Fresh', 'Liked', 'Thriller']));
    });

    it('keeps one title per saga and varies genres', () => {
        const picked = pickHeroes(pool([film('Dune', { Name: 'Dune', CommunityRating: 9 }), film('Dune 2', { Name: 'Dune: Part Two', CommunityRating: 9 }),
            film('A', { Genres: ['Drama'] }), film('B', { Genres: ['Drama'] }), film('C', { Genres: ['Comedy'] })]), 'films', now, 3);
        expect(picked.filter(item => familyKey(item) === 'dune')).toHaveLength(1);
        expect(new Set(picked.map(item => item.Genres?.[0])).size).toBe(3);
    });

    it('mixes films and series on the home banner, only series on Séries', () => {
        const items = [...Array.from({ length: 6 }, (_, index) => film(`f${index}`, { CommunityRating: 9 })),
            ...Array.from({ length: 3 }, (_, index) => film(`s${index}`, { Type: 'Series', CommunityRating: 5 }))];
        const home = pickHeroes(pool(items), 'home', now);
        expect(home.filter(item => item.Type === 'Series')).toHaveLength(2);
        expect(pickHeroes(pool(items), 'series', now).every(item => item.Type === 'Series')).toBe(true);
    });

    it('changes from one day to the next but not within a day', () => {
        const items = Array.from({ length: 30 }, (_, index) => film(`t${index}`));
        const ids = (time: number) => pickHeroes(pool(items), 'films', time).map(item => item.Id).join();
        expect(ids(now)).toBe(ids(now + 3600_000));
        expect(ids(now)).not.toBe(ids(now + 86_400_000));
    });

    it('builds a genre profile from recent viewing', () => {
        expect(tasteProfile([film('a', { Genres: ['Drama'] }), film('b', { Genres: ['Drama', 'Crime'] })]).get('Crime')).toBe(0.5);
    });
});
