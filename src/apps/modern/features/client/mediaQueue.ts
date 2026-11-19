import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

import { uniqueItems } from './model';
import { isExternal } from './seerr/model';

export type QueueSource = BaseItemDto[] | 'favorites';
export type PlayQueue = (source: QueueSource, shuffled: boolean) => Promise<void>;

function available(item: BaseItemDto) {
    return !!item.Id && !isExternal(item) && item.LocationType !== 'Virtual' && !item.IsPlaceHolder;
}

export function isQueuedVideo(item: BaseItemDto) {
    return available(item) && (item.Type === 'Movie' || item.Type === 'Episode');
}

function shuffle(items: BaseItemDto[], random: () => number) {
    for (let index = items.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));
        [items[index], items[other]] = [items[other], items[index]];
    }
    return items;
}

export async function buildMediaQueue(titles: BaseItemDto[], getEpisodes: (seriesId: string) => Promise<BaseItemDto[]>, shuffled: boolean, random = Math.random) {
    const queue: BaseItemDto[] = [];
    const candidates = uniqueItems(titles).filter(available);
    // Limit simultaneous series queries while keeping the order of the original list.
    for (let start = 0; start < candidates.length; start += 6) {
        const batch = await Promise.all(candidates.slice(start, start + 6).map(title => title.Type === 'Series' ? getEpisodes(title.Id!) : [title]));
        queue.push(...batch.flat().filter(isQueuedVideo));
    }
    const distinct = uniqueItems(queue);
    return shuffled ? shuffle(distinct, random) : distinct;
}
