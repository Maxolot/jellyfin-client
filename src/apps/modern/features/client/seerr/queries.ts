import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

import { genreIds, matchesCatalogueGenre, type Genre } from './genres';
import { catalogueItem, externalIdentity, requestableSeasons, withLocalAvailability, type ExternalMedia, type MediaType, type Results } from './model';
import { useSeerr } from './SeerrContext';

export function useLocalIdentities(enabled: boolean) {
    const { api, user } = useApi();
    const { root } = useSeerr();
    return useQuery({ queryKey: [...root, 'LocalIdentities'], enabled: enabled && !!api && !!user?.Id,
        staleTime: 120000, retry: false, queryFn: async ({ signal }) => {
            const items: BaseItemDto[] = [];
            let total = 1;
            while (items.length < total) {
                const result = await getLibraryApi(api!).getItems({ userId: user!.Id, recursive: true,
                    includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series], fields: [ItemFields.ProviderIds],
                    imageTypeLimit: 1, limit: 200, startIndex: items.length }, { signal });
                const batch = result.data.Items || [];
                total = result.data.TotalRecordCount || 0;
                items.push(...batch);
                if (!batch.length) break;
            }
            return items;
        } });
}
function useGenreList(type: MediaType, enabled: boolean) {
    const seerr = useSeerr();
    return useQuery({ queryKey: [...seerr.root, 'Genres', type], enabled: enabled && seerr.connected,
        retry: false, staleTime: 86400000, queryFn: async ({ signal }) => {
            const results = await Promise.all(['en', 'fr'].map(language => seerr.call<Genre[]>(`Api/genres/${type}?language=${language}`, signal)));
            return results.flat();
        } });
}
// TMDB genres left out of discovery rows: TV movies, news, reality, soaps and talk shows.
const UNWANTED_GENRES = new Set([10770, 10763, 10764, 10766, 10767]);
/** Discovery rows skip daily TV programmes, TV movies and titles almost nobody rated. Search keeps everything. */
export function isRecommendable(entry: ExternalMedia) {
    if ((entry.genreIds || entry.genres?.map(genre => genre.id) || []).some(id => UNWANTED_GENRES.has(id))) return false;
    return entry.voteCount === undefined || entry.voteCount >= 30;
}
function catalogueEndpoint(view: string, search: string, ids: number[]) {
    let category = 'trending';
    if (view === 'films') category = 'movies';
    if (view === 'series') category = 'tv';
    let endpoint = `discover/${category}?language=fr`;
    if (ids.length && ['films', 'series'].includes(view)) endpoint += `&genre=${ids[0]}`;
    if (view === 'search' && search) endpoint = `search?query=${encodeURIComponent(search)}`;
    return endpoint;
}
/** Prepares the first page of discoveries a tab will show, under the key that tab reads. */
export function prepareCatalogue(cache: QueryClient, seerr: ReturnType<typeof useSeerr>, view: string) {
    const endpoint = catalogueEndpoint(view, '', []);
    return cache.prefetchInfiniteQuery({ queryKey: [...seerr.root, 'Catalogue', endpoint, ''], initialPageParam: 1, staleTime: 60000, retry: false, pages: 1,
        queryFn: ({ signal, pageParam }) => seerr.call<Results<ExternalMedia>>(`Api/${endpoint}&page=${pageParam}`, signal),
        getNextPageParam: (last: Results<ExternalMedia>) => (last.page || 1) < (last.totalPages || 1) ? (last.page || 1) + 1 : undefined });
}

export function useSeerrCatalogue(view: string, search: string, enabled: boolean, genre = '') {
    const seerr = useSeerr();
    const local = useLocalIdentities(enabled && seerr.connected);
    const needsGenres = !!genre || ['films', 'series'].includes(view);
    const movieGenres = useGenreList('movie', enabled && needsGenres && view !== 'series');
    const tvGenres = useGenreList('tv', enabled && needsGenres && view !== 'films');
    const lists = { movie: movieGenres.data || [], tv: tvGenres.data || [] };
    const selected = genreIds(view === 'series' ? lists.tv : lists.movie, genre);
    const anyGenre = selected.length > 0 || genreIds(lists.tv, genre).length > 0;
    const ready = enabled && seerr.connected && local.isSuccess && (!genre || anyGenre);
    const endpoint = catalogueEndpoint(view, search, selected);
    const query = useInfiniteQuery({ queryKey: [...seerr.root, 'Catalogue', endpoint, genre],
        enabled: ready, initialPageParam: 1, retry: false, staleTime: 60000,
        queryFn: ({ signal, pageParam }) => seerr.call<Results<ExternalMedia>>(`Api/${endpoint}&page=${pageParam}`, signal),
        getNextPageParam: last => (last.page || 1) < (last.totalPages || 1) ? (last.page || 1) + 1 : undefined });
    const pages = ready ? query.data?.pages : undefined;
    const results = pages?.flatMap(page => page.results) || [];
    const people = results.filter(entry => entry.mediaType === 'person' && entry.id > 0 && entry.name)
        .map(entry => ({ Id: `tmdb-${entry.id}`, Name: entry.name, profilePath: entry.profilePath }));
    const mapped = results.filter(entry => entry.mediaType !== 'person' && (view === 'search' || isRecommendable(entry))).map(entry => {
        const type: MediaType = entry.mediaType === 'tv' || view === 'series' ? 'tv' : 'movie';
        return catalogueItem(entry, type, local.data || []);
    });
    const items = mapped.filter(item => !genre || matchesCatalogueGenre(item, genre, lists));
    const loading = enabled && seerr.connected && [local, movieGenres, tvGenres, query].some(observer => observer.isFetching);
    return { ...query, hasNextPage: ready && query.hasNextPage, isError: ready && query.isError, items, people, local, loading, matchesGenre: (item: BaseItemDto, name: string) => matchesCatalogueGenre(item, name, lists) };
}
export function useSeerrDetail(type: MediaType | undefined, id: number | undefined, poll = true) {
    const seerr = useSeerr();
    return useQuery({ queryKey: [...seerr.root, 'Detail', type, id], enabled: seerr.connected && !!type && !!id,
        retry: false, staleTime: 15000, refetchInterval: poll ? 20000 : false,
        queryFn: async ({ signal }) => ({ ...await seerr.call<ExternalMedia>(`Api/${type}/${id}?language=fr`, signal), mediaType: type }) });
}

export function useLocalSeasons(item?: BaseItemDto) {
    const { api, user } = useApi();
    return useQuery({ queryKey: ['Client', api?.basePath, user?.Id, 'Seasons', item?.Id],
        enabled: !!api && !!user?.Id && item?.Type === 'Series', staleTime: 30000,
        queryFn: async ({ signal }) => (await getShowApi(api!).getSeasons({ seriesId: item!.Id!, userId: user!.Id,
            fields: [ItemFields.ChildCount] }, { signal })).data.Items || [] });
}

export function canRequestSeasons(item: BaseItemDto, connected: boolean) {
    return connected && item.Type === 'Series' && !!externalIdentity(item);
}

/** Number of seasons still requestable for a local series. */
export function useMissingSeasons(item: BaseItemDto, enabled: boolean) {
    const identity = enabled ? externalIdentity(item) : undefined;
    const detail = useSeerrDetail(identity?.type, identity?.id, false);
    const local = useLocalSeasons(enabled ? item : undefined);
    if (!identity || !detail.data || local.isPending || local.isError) return 0;
    return requestableSeasons(withLocalAvailability(detail.data, item, local.data)).length;
}

// « Bientôt à découvrir » : films et séries annoncés dans les 60 prochains jours, du plus proche au plus lointain.
export function useSeerrUpcoming(enabled: boolean) {
    const seerr = useSeerr();
    const local = useLocalIdentities(enabled && seerr.connected);
    const query = useQuery({ queryKey: [...seerr.root, 'Upcoming'], enabled: enabled && seerr.connected,
        retry: false, staleTime: 3600000, queryFn: async ({ signal }) => {
            const [movies, series] = await Promise.all(['movies', 'tv'].map(path =>
                seerr.call<Results<ExternalMedia>>(`Api/discover/${path}/upcoming?language=fr&page=1`, signal)));
            return [...movies.results.map(entry => ({ ...entry, mediaType: 'movie' as const })),
                ...series.results.map(entry => ({ ...entry, mediaType: 'tv' as const }))];
        } });
    const today = new Date().toISOString().slice(0, 10);
    const limit = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    const items = (query.data || []).map(entry => ({ date: entry.releaseDate || entry.firstAirDate || '', entry }))
        .filter(({ date, entry }) => date >= today && date <= limit && entry.posterPath)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 16)
        .map(({ date, entry }) => ({ date, item: catalogueItem(entry, entry.mediaType === 'tv' ? 'tv' : 'movie', local.data || []) }));
    return { items, loading: query.isFetching };
}
