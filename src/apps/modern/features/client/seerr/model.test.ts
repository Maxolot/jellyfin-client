import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { describe, expect, it } from 'vitest';

import { withLocalAvailability, canRequest, catalogueItem, externalIdentity, imageUrl, mixCatalogue, requestableSeasons } from './model';

const local: BaseItemDto[] = [{ Id: 'local-film', Name: 'Même titre', Type: 'Movie', ProviderIds: { Tmdb: '42' } },
    { Id: 'local-series', Name: 'Autre titre', Type: 'Series', ProviderIds: { Tmdb: '42' } }];
describe('optional Seerr catalogue and request rules', () => {
    it('matches provider IDs and type rather than equal names', () => {
        expect(catalogueItem({ id: 42, title: 'Titre traduit' }, 'movie', local).Id).toBe('local-film');
        expect(catalogueItem({ id: 42, name: 'Titre traduit' }, 'tv', local).Id).toBe('local-series');
        expect(catalogueItem({ id: 43, title: 'Même titre' }, 'movie', local).Id).toBe('seerr-movie-43');
    });
    it('does not duplicate provider matches or allow arbitrary artwork hosts', () => {
        const matched = catalogueItem({ id: 42 }, 'movie', local);
        const other = catalogueItem({ id: 43 }, 'movie', local);
        expect(mixCatalogue(local, [matched, other, other])).toHaveLength(3);
        expect(imageUrl('//evil.example/img.jpg')).toBe('');
        expect(imageUrl('/poster.jpg')).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
    });
    it('keeps movie, series and 4K permissions separate with deny-by-default', () => {
        expect(canRequest(0, 'movie')).toBe(false);
        expect(canRequest(262144, 'movie')).toBe(true);
        expect(canRequest(262144, 'tv')).toBe(false);
        expect(canRequest(32, 'movie', true)).toBe(false);
        expect(canRequest(4096, 'tv', true)).toBe(true);
        expect(canRequest(2, 'tv', true)).toBe(true);
    });
    it('only offers missing seasons and excludes specials and active requests', () => {
        expect(requestableSeasons({ id: 1, seasons: [0, 1, 2, 3, 4].map(seasonNumber => ({ id: seasonNumber, seasonNumber, name: String(seasonNumber) })),
            mediaInfo: { seasons: [{ seasonNumber: 1, status: 5 }, { seasonNumber: 2, status: 4 }], requests: [{ id: 3, status: 2, is4k: false, media: {}, seasons: [{ seasonNumber: 3, status: 2 }] }] } }).map(s => s.seasonNumber)).toEqual([4]);
    });
    it('prevents requesting an already local movie when the external scanner is stale', () => {
        const detail = withLocalAvailability({ id: 42, mediaInfo: { status: 1, status4k: 1 } }, local[0]);
        expect(detail.mediaInfo).toMatchObject({ status: 5, status4k: 1 });
    });
    it('compares actual local episode counts before offering missing seasons', () => {
        const detail = withLocalAvailability({ id: 42, seasons: [1, 2, 3].map(seasonNumber => ({ id: seasonNumber, seasonNumber, name: '', episodeCount: 8 })) }, local[1],
            [{ IndexNumber: 1, ChildCount: 8 }, { IndexNumber: 2, ChildCount: 3 }]);
        expect(detail.mediaInfo?.seasons).toEqual([{ seasonNumber: 1, status: 5 }, { seasonNumber: 2, status: 4 }]);
        expect(requestableSeasons(detail).map(season => season.seasonNumber)).toEqual([3]);
    });
    it('does not treat unrelated item IDs or invalid provider IDs as request identities', () => {
        expect(externalIdentity({ Id: 'seerr-movie-12' })).toEqual({ type: 'movie', id: 12 });
        expect(externalIdentity({ Type: 'Movie', ProviderIds: { Tmdb: 'NaN' } })).toBeUndefined();
        expect(externalIdentity({ Type: 'Episode', ProviderIds: { Tmdb: '42' } })).toBeUndefined();
    });
});
