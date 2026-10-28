import type { Api } from '@jellyfin/sdk';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getUserDataApi } from '@jellyfin/sdk/lib/utils/api/user-data-api';

/** Jellyfin stores personal scores on0–10; zero is a score, not an absent value. */
export function personalStars(item: BaseItemDto): number | null {
    const rating = item.UserData?.Rating;
    return typeof rating === 'number' && Number.isFinite(rating) && rating >= 0 && rating <= 10 ? rating / 2 : null;
}

export function ratedItems(items: BaseItemDto[]) {
    return items.filter(item => personalStars(item) !== null)
        .sort((a, b) => personalStars(b)! - personalStars(a)! || (a.Name || '').localeCompare(b.Name || ''));
}

/** Filters named Likes/Dislikes do not reliably exclude unrated items on Jellyfin12. */
export async function loadRatedItems(api: Api, userId: string, signal?: AbortSignal) {
    const found = new Map<string, BaseItemDto>();
    const seen = new Set<string>();
    let startIndex = 0;
    while (true) {
        const { data } = await getLibraryApi(api).getItems({ userId, recursive: true,
            includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series], sortBy: [ItemSortBy.SortName],
            enableUserData: true, imageTypeLimit: 1, limit: 200, startIndex }, { signal });
        const items = data.Items || [];
        const previousSize = seen.size;
        for (const item of items) {
            if (!item.Id) continue;
            seen.add(item.Id);
            if (personalStars(item) !== null) found.set(item.Id, item);
        }
        startIndex += items.length;
        if (items.length && seen.size === previousSize) throw new Error('Repeated library page');
        if (!items.length || startIndex >= (data.TotalRecordCount ?? Infinity) || items.length < 200) break;
    }
    return ratedItems([...found.values()]);
}

/** Do not use updateUserItemRating: that endpoint accepts a boolean thumbs-up. */
export async function savePersonalStars(api: Api, userId: string, itemId: string, stars: number | null) {
    if (stars !== null && (!Number.isInteger(stars) || stars < 1 || stars > 5)) throw new Error('Invalid personal score');
    const request = { userId, itemId };
    const endpoint = getUserDataApi(api);
    const result = stars === null ? await endpoint.deleteUserItemRating(request) :
        await endpoint.updateItemUserData({ ...request, updateUserItemDataDto: { Rating: stars * 2 } });
    return result.data;
}
