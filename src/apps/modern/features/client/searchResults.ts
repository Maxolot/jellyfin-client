import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

import { isExternal, mixCatalogue } from './seerr/model';

export function normalizedTitle(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s.,:;'"!?()\-–—]+/g, ' ').trim();
}

export function matchesSearchTitle(value: string | null | undefined, search: string) {
    const words = normalizedTitle(search).split(' ').filter(Boolean);
    const title = normalizedTitle(value || '');
    return words.length > 0 && words.every(word => title.includes(word));
}

export function groupSearchResults(local: BaseItemDto[], tracked: BaseItemDto[], remote: BaseItemDto[]) {
    const own = mixCatalogue([], [...local, ...tracked.filter(item => !isExternal(item)), ...remote.filter(item => !isExternal(item))]);
    const saved = mixCatalogue(own, tracked.filter(isExternal)).slice(own.length);
    const suggestion = mixCatalogue([...own, ...saved], remote.filter(isExternal)).slice(own.length + saved.length);
    return { own, saved, suggestion };
}

export function searchMode(view: string, selectors: string[], search: string) {
    const standaloneSearch = view === 'search' && !selectors.some(Boolean);
    return { standaloneSearch, blankSearch: standaloneSearch && !search.trim() };
}

export function exactSearchFirst(items: BaseItemDto[], query: string) {
    const title = normalizedTitle(query);
    const exact = items.filter(item => normalizedTitle(item.Name || '') === title);
    if (!exact.length) return items;
    return [...exact, ...items.filter(item => !exact.includes(item))];
}
