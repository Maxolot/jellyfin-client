import type { Api } from '@jellyfin/sdk';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadRatedItems, personalStars, ratedItems, savePersonalStars } from './ratings';

const endpoints = vi.hoisted(() => ({ updateItemUserData: vi.fn(), deleteUserItemRating: vi.fn(), getItems: vi.fn() }));
vi.mock('@jellyfin/sdk/lib/utils/api/user-data-api', () => ({ getUserDataApi: () => endpoints }));
vi.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({ getLibraryApi: () => endpoints }));
const api = {} as Api;
beforeEach(() => vi.resetAllMocks());

describe('native personal scores', () => {
    it('preserves zero and fractional native values while excluding absent or invalid scores', () => {
        for (const value of [0, 1, 8, 10]) expect(personalStars({ UserData: { Key: 'fixture', Rating: value } })).toBe(value / 2);
        for (const value of [undefined, null, NaN, Infinity, -1, 11]) expect(personalStars({ UserData: { Key: 'fixture', Rating: value } })).toBeNull();
        expect(personalStars({ CommunityRating: 9 })).toBeNull();
    });
    it('uses the numeric endpoint without touching favorite or playback fields', async () => {
        endpoints.updateItemUserData.mockResolvedValue({ data: { Rating: 8 } });
        expect(await savePersonalStars(api, 'user-a', 'movie-a', 4)).toEqual({ Rating: 8 });
        expect(endpoints.updateItemUserData).toHaveBeenCalledWith({ userId: 'user-a', itemId: 'movie-a', updateUserItemDataDto: { Rating: 8 } });
        expect(endpoints.deleteUserItemRating).not.toHaveBeenCalled();
    });
    it('clears through the rating-only delete endpoint', async () => {
        endpoints.deleteUserItemRating.mockResolvedValue({ data: { Rating: null } });
        await savePersonalStars(api, 'user-a', 'series-a', null);
        expect(endpoints.deleteUserItemRating).toHaveBeenCalledWith({ userId: 'user-a', itemId: 'series-a' });
        expect(endpoints.updateItemUserData).not.toHaveBeenCalled();
    });
    it('rejects invalid writes before contacting Jellyfin', async () => {
        for (const value of [0, -1, 2.5, 6, NaN]) await expect(savePersonalStars(api, 'user-a', 'movie-a', value)).rejects.toThrow();
        expect(endpoints.updateItemUserData).not.toHaveBeenCalled();
    });
    it('filters by personal score and orders by score then name, without mutating its input', () => {
        const items: BaseItemDto[] = [{ Id: 'unrated', CommunityRating: 10 }, { Id: 'zero', UserData: { Key: 'fixture', Rating: 0 } },
            { Id: 'z', Name: 'Z', UserData: { Key: 'fixture', Rating: 8 } }, { Id: 'a', Name: 'A', UserData: { Key: 'fixture', Rating: 8 } }];
        expect(ratedItems(items).map(item => item.Id)).toEqual(['a', 'z', 'zero']);
        expect(items[0].Id).toBe('unrated');
    });
    it('includes rated titles beyond the first page, deduplicates and forwards cancellation and user scope', async () => {
        const first = Array.from({ length: 200 }, (_, index) => ({ Id: `item-${index}` }));
        // eslint-disable-next-line compat/compat -- This test uses the native controller supplied by Node/jsdom.
        const signal = new AbortController().signal;
        endpoints.getItems.mockResolvedValueOnce({ data: { Items: first, TotalRecordCount: 202 } })
            .mockResolvedValueOnce({ data: { Items: [{ Id: 'item-0', UserData: { Key: 'fixture', Rating: 0 } }, { Id: 'last', UserData: { Key: 'fixture', Rating: 10 } }], TotalRecordCount: 202 } });
        expect((await loadRatedItems(api, 'user-a', signal)).map(item => item.Id)).toEqual(['last', 'item-0']);
        expect(endpoints.getItems.mock.calls[1]).toEqual([expect.objectContaining({ userId: 'user-a', startIndex: 200, enableUserData: true }), { signal }]);
    });
    it('reports a server repeating pages instead of silently claiming a complete personal library', async () => {
        endpoints.getItems.mockResolvedValue({ data: { Items: Array.from({ length: 200 }, (_, index) => ({ Id: `${index}` })), TotalRecordCount: 400 } });
        await expect(loadRatedItems(api, 'user-a')).rejects.toThrow('Repeated library page');
    });
});
