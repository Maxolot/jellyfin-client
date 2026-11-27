import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { describe, expect, it } from 'vitest';

import { browseFilmography, filmography, filmographyCounts, personPath, personTmdbId, uniquePersonResults, type Credit } from './model';

const available: BaseItemDto = { Id: 'visible', Name: 'Réel', Type: 'Movie', ProviderIds: { Tmdb: '1' } };
const virtual: BaseItemDto = { Id: 'virtual', Name: 'Absent', Type: 'Movie', ProviderIds: { Tmdb: '2' }, LocationType: 'Virtual' };
const series: BaseItemDto = { Id: 'partial', Name: 'Partielle', Type: 'Series', ProviderIds: { Tmdb: '3' } };
const film = (id: number, fields: Partial<Credit> = {}): Credit => ({ id, mediaType: 'movie', title: `Titre ${id}`, ...fields });
const initial = { includeAppearances: false, local: [], library: [], shared: [] };

describe('global filmography', () => {
    it('deduplicates one title with several roles and keeps the actual local title for playback', () => {
        const entries = filmography({ ...initial, library: [available], credits: {
            cast: [film(1, { character: 'Tess' }), film(1, { character: 'Tess' }), film(1, { character: 'Tess jeune' })],
            crew: [film(1, { department: 'Directing', job: 'Director' })]
        } });
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ item: available, status: 'available', roles: { acting: ['Tess', 'Tess jeune'], directing: ['Réalisation'] } });
        expect(browseFilmography(entries, 'movie', 'directing', 'date')).toEqual(entries);
    });

    it('classifies by real visibility, not by Seerr’s standalone available flag', () => {
        const entries = filmography({ ...initial, library: [available, virtual, series], credits: { cast: [
            film(1), film(2), film(3, { mediaType: 'tv', mediaInfo: { status: 4, seasons: [{ seasonNumber: 2, status: 5 }] } }),
            film(4, { mediaInfo: { status: 5 } }), film(5, { mediaInfo: { status: 3 } })
        ] } });
        expect(entries.map(entry => [entry.item.Id, entry.status])).toEqual([
            ['visible', 'available'], ['seerr-movie-2', 'requestable'], ['seerr-tv-3', 'tracked'], ['seerr-movie-4', 'tracked'], ['seerr-movie-5', 'tracked']
        ]);
        expect(entries[2].label).toBe('Partiellement disponible · Saisons 2');
    });

    it('retains followed artwork and leaves configurable self and talk-show exclusions', () => {
        const input = { ...initial, credits: { cast: [
            film(1, { character: 'Self - Guest' }), film(2, { genreIds: [10767] }), film(6, { character: 'Jo' }),
            film(8, { popularity: 15, releaseDate: '2000-10-10' }), film(9, { popularity: 1, releaseDate: '2024-11-17' })
        ] }, shared: [{ type: 'movie' as const, id: 6, title: 'Jo', posterPath: '/archive.jpg' }] };
        const entries = filmography(input);
        expect(entries).toHaveLength(3);
        expect(entries[0]).toMatchObject({ status: 'tracked', item: { Seerr: { posterPath: '/archive.jpg' } } });
        expect(browseFilmography(entries, '', '', 'popular')[0].item.Id).toBe('seerr-movie-8');
        expect(browseFilmography(entries, '', '', 'date')[0].item.Id).toBe('seerr-movie-9');
        expect(filmography({ ...input, includeAppearances: true })).toHaveLength(5);
    });

    it('shows local filmography when Seerr yielded no credits', () => {
        const local = { ...available, People: [{ Id: 'person', Type: 'Director' as const }] };
        expect(filmography({ ...initial, local: [local], personId: 'person' }))
            .toMatchObject([{ item: local, status: 'available', roles: { directing: ['Réalisation'] } }]);
    });

    it('uses French agreement in the availability counter', () => {
        expect(filmographyCounts(0, 2)).toBe('0 disponible · 2 à demander');
        expect(filmographyCounts(1, 1)).toBe('1 disponible · 1 à demander');
        expect(filmographyCounts(2)).toBe('2 disponibles');
    });

    it('routes to a local or TMDb profile and prefers the local search duplicate', () => {
        expect(personPath('tmdb-123', 'Élodie')).toBe('/client/person/tmdb-123?name=%C3%89lodie');
        expect(personTmdbId('tmdb-123')).toBe(123);
        expect(personTmdbId('0')).toBeUndefined();
        const local = { Id: 'e', Name: 'Élodie Martin' };
        expect(uniquePersonResults([local], [{ Id: 'tmdb-1', Name: 'Elodie Martin' }, { Id: 'tmdb-2', Name: 'Autre' }]))
            .toEqual([local, { Id: 'tmdb-2', Name: 'Autre' }]);
    });
});
