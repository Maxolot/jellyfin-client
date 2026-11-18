export type LibraryFilters = {
    year?: number;
    minRating?: number;
    studio?: string;
    tag?: string;
    watched?: 'played' | 'unplayed';
};

export const libraryFilterKeys = ['year', 'minRating', 'studio', 'tag', 'watched'] as const;

export function isFullLibrary(view: string, mode: string | null) {
    return (view === 'films' || view === 'series') && mode === 'library';
}

function parseYear(value: string | null) {
    if (!value || !/^\d{4}$/.test(value)) return undefined;
    const year = Number(value);
    return year >= 1000 ? year : undefined;
}

function parseRating(value: string | null) {
    if (!value || !/^\d{1,2}(\.\d{1,2})?$/.test(value)) return undefined;
    const rating = Number(value);
    return rating > 0 && rating <= 10 ? rating : undefined;
}

export function readLibraryFilters(view: string, params: URLSearchParams): LibraryFilters {
    if (!isFullLibrary(view, params.get('mode')) || params.get('availability') === 'missing') return {};
    const studio = params.get('studio') || '';
    const watched = params.get('watched');
    const tag = params.get('tag')?.trim();
    return {
        year: parseYear(params.get('year')),
        minRating: parseRating(params.get('minRating')),
        studio: /^(?:[\da-f]{32}|[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})$/i.test(studio) ? studio : undefined,
        tag: tag && tag.length <= 200 ? tag : undefined,
        watched: watched === 'played' || watched === 'unplayed' ? watched : undefined
    };
}

export function countLibraryFilters(filters: LibraryFilters) {
    return libraryFilterKeys.filter(key => filters[key] !== undefined).length;
}

export function libraryFilterQuery(filters: LibraryFilters) {
    return {
        years: filters.year === undefined ? undefined : [filters.year],
        minCommunityRating: filters.minRating,
        studioIds: filters.studio ? [filters.studio] : undefined,
        tags: filters.tag ? [filters.tag] : undefined,
        isPlayed: filters.watched === undefined ? undefined : filters.watched === 'played'
    };
}
