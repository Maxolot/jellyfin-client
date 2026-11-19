import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { describe, expect, it } from 'vitest';

import { runtimeLabel } from './model';
import type { ExternalMedia } from './seerr/model';
import { episodeCount, orderSeasons, partialSeason, remoteSeasonChoices, seasonChoices, seasonLabel, seasonProgress, seasonSummary } from './seriesEpisodesModel';

const season: BaseItemDto = { Id: 'season', IndexNumber: 2, ChildCount: 8, UserData: { Key: 'season', UnplayedItemCount: 6 } };

describe('series season and episode cards', () => {
    it('places specials after numbered seasons and gives them a French label', () => {
        const specials = { IndexNumber: 0 };
        const first = { IndexNumber: 1 };
        expect(orderSeasons([specials, season, first])).toEqual([first, season, specials]);
        expect(seasonLabel(specials)).toBe('Épisodes spéciaux');
        expect(seasonLabel(season)).toBe('Saison 2');
    });

    it('uses Jellyfin’s season counts and the selected season’s available episodes', () => {
        expect(seasonProgress(season)).toEqual({ total: 8, seen: 2 });
        expect(seasonProgress(season, [{ UserData: { Key: 'watched', Played: true } }, {}])).toEqual({ total: 2, seen: 1 });
        expect(seasonProgress(season, [])).toEqual({ total: 0, seen: 0 });
        expect(episodeCount(1)).toBe('1 épisode');
    });

    it('hides absent and rounded zero runtimes', () => {
        expect(runtimeLabel(null)).toBe('');
        expect(runtimeLabel(1e7)).toBe('');
        expect(runtimeLabel(42 * 6e8)).toBe('42 min');
    });
});

describe('remote season choices', () => {
    const local: BaseItemDto = { Id: 'one', IndexNumber: 1, ChildCount: 4 };
    const specials: BaseItemDto = { Id: 'specials', IndexNumber: 0 };
    const detail: ExternalMedia = { id: 123, seasons: [
        { id: 3, seasonNumber: 3, name: 'Three', episodeCount: 8 },
        { id: 1, seasonNumber: 1, name: 'One', episodeCount: 8 },
        { id: 2, seasonNumber: 2, name: 'Two', episodeCount: 8, posterPath: '/season2.jpg' }
    ], mediaInfo: { seasons: [{ seasonNumber: 3, status: 3 }],
        downloadStatus: [
            { downloadId: 'same', status: 'downloading', size: 100, sizeLeft: 55, episode: { seasonNumber: 3 } },
            { downloadId: 'same', status: 'downloading', size: 100, sizeLeft: 55, episode: { seasonNumber: 3 } },
            { status: 'downloading', size: 100, sizeLeft: 1, episode: { seasonNumber: 1 } }
        ]
    } };

    it('merges and orders real seasons and remote posters and preserves accurate progress', () => {
        const missing = remoteSeasonChoices([local, specials], detail, true, false);
        expect(seasonChoices([local, specials], missing).map(choice => choice.key)).toEqual(['one', 'remote-2', 'remote-3', 'specials']);
        expect(seasonSummary([local, specials], missing)).toBe('1 saison disponible sur 3');
        expect(missing).toEqual([
            { number: 3, poster: '', status: 'En téléchargement 45 %', quality: undefined },
            { number: 2, poster: 'https://image.tmdb.org/t/p/w500/season2.jpg', status: 'À demander', quality: 'standard' }
        ]);
        expect(partialSeason(local, detail)).toBe(true);
    });

    it('supports read-only and 4K-only accounts and falls back to real seasons without Seerr', () => {
        expect(remoteSeasonChoices([local], undefined, true, true)).toEqual([]);
        expect(remoteSeasonChoices([local], detail, false, false)[1]).toMatchObject({ quality: undefined, status: 'Non disponible' });
        expect(remoteSeasonChoices([local], detail, false, true)[1]).toMatchObject({ quality: '4k', status: 'À demander' });
        const pending = { ...detail, mediaInfo: { seasons: [{ seasonNumber: 3, status: 2 }] } };
        expect(remoteSeasonChoices([local], pending, true, false)[0]).toMatchObject({ quality: undefined, status: 'Demandée' });
    });
});
