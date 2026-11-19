import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { describe, expect, it } from 'vitest';

import { runtimeLabel } from './model';
import { episodeCount, orderSeasons, seasonLabel, seasonProgress } from './seriesEpisodesModel';

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
