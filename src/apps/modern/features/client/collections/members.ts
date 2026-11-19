import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

import type { orderedFolderItems } from '../folders/model';
import { providerKey } from '../seerr/model';

export function mergeCollectionMembers(native: BaseItemDto[], followed: ReturnType<typeof orderedFolderItems>) {
    const localIds = new Set(native.map(item => item.Id));
    const localProviders = new Set(native.map(providerKey).filter(Boolean));
    const entries = native.flatMap(item => item.Id ? [{ item, key: item.Id, itemId: item.Id,
        type: item.Type === 'Series' ? 'tv' as const : 'movie' as const, tmdbId: null }] : []);
    const additions = followed.filter(entry => !localIds.has(entry.item.Id) && !localProviders.has(`${entry.type}:${entry.tmdbId}`));
    return { entries: [...entries, ...additions], additions };
}
