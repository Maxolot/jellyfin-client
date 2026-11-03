import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { SortOrder } from '@jellyfin/sdk/lib/generated-client/models/sort-order';
import { getFilterApi } from '@jellyfin/sdk/lib/utils/api/filter-api';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api';
import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

import { uniqueItems } from './model';
import { clientRequest } from './session';

function browseOrder(view: string, sort: string) {
    if (view === 'tonight') return { sortBy: [ItemSortBy.Random], sortOrder: [SortOrder.Ascending] };
    if (sort === 'recent' || view === 'recent') return { sortBy: [ItemSortBy.DateCreated], sortOrder: [SortOrder.Descending] };
    return { sortBy: [ItemSortBy.SortName], sortOrder: [SortOrder.Ascending] };
}

type BrowseFilters = { genre?: string; sort?: string; person?: string; audio?: string; collection?: string };

export function useClientMedia(view: string, search: string, offset: number, { genre = '', sort = 'name', person = '', audio = '', collection = '' }: BrowseFilters = {}) {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Browse', view, search, offset, genre, sort, person, audio, collection],
        staleTime: 30000,
        refetchOnMount: view === 'home' ? 'always' : true,
        enabled: !!api && !!user?.Id && view !== 'disabled',
        queryFn: ({ signal }) => clientRequest(async () => {
            const library = getLibraryApi(api!);
            let types = [BaseItemKind.Movie, BaseItemKind.Series];
            if (view === 'films' || view === 'tonight') types = [BaseItemKind.Movie];
            if (view === 'series') types = [BaseItemKind.Series];
            const common = { userId: user!.Id, recursive: true, parentId: collection || undefined, includeItemTypes: types,
                audioLanguages: audio ? [audio] : undefined, genres: genre ? [genre] : undefined, fields: [ItemFields.Overview, ItemFields.Genres, ItemFields.DateCreated, ItemFields.ProviderIds], imageTypeLimit: 1, enableUserData: true };
            const request = { signal };
            if (view !== 'home') {
                const result = await library.getItems({ ...common, limit: view === 'tonight' ? 192 : 48, startIndex: offset,
                    personIds: person ? [person] : undefined, searchTerm: search || undefined, genres: genre ? [genre] : undefined, isFavorite: view === 'mine' ? true : undefined,
                    ...browseOrder(view, sort) }, request);
                return { items: result.data.Items || [], total: result.data.TotalRecordCount || 0,
                    resume: [], next: [], movies: [], series: [], picks: [] };
            }
            const [resume, next, movies, series, picks] = await Promise.all([
                library.getResumeItems({ userId: user!.Id, limit: 12,
                    includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Episode], fields: common.fields }, request),
                getShowApi(api!).getNextUp({ userId: user!.Id, limit: 12, fields: common.fields }, request),
                library.getItems({ ...common, includeItemTypes: [BaseItemKind.Movie], limit: 20,
                    sortBy: [ItemSortBy.DateCreated], sortOrder: [SortOrder.Descending] }, request),
                library.getItems({ ...common, includeItemTypes: [BaseItemKind.Series], limit: 20,
                    sortBy: [ItemSortBy.DateCreated], sortOrder: [SortOrder.Descending] }, request),
                // Unwatched, best rated titles feed the « À découvrir » selection, as in the mockup.
                library.getItems({ ...common, isPlayed: false, limit: 40,
                    sortBy: [ItemSortBy.CommunityRating, ItemSortBy.Random], sortOrder: [SortOrder.Descending] }, request)
            ]);
            const continuing = uniqueItems(resume.data.Items || []);
            return { items: [], total: 0, resume: continuing,
                next: uniqueItems(next.data.Items || [], continuing),
                movies: uniqueItems(movies.data.Items || [], continuing), series: uniqueItems(series.data.Items || []),
                picks: uniqueItems(picks.data.Items || [], continuing) };
        })
    });
}

export function useClientDetails(id: string, season: string) {
    const { api, user } = useApi();
    const item = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Detail', id],
        staleTime: 30000,
        enabled: !!api && !!user?.Id && !!id,
        queryFn: ({ signal }) => clientRequest(async () => (await getLibraryApi(api!).getItem({ itemId: id, userId: user!.Id! }, { signal })).data)
    });
    const seasons = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Seasons', id],
        enabled: !!api && !!user?.Id && item.data?.Type === BaseItemKind.Series,
        queryFn: ({ signal }) => clientRequest(async () => (await getShowApi(api!).getSeasons({ seriesId: id, userId: user!.Id, fields: [ItemFields.ChildCount] }, { signal })).data.Items || [])
    });
    const selected = season || seasons.data?.[0]?.Id || '';
    const episodes = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Episodes', id, selected],
        enabled: !!api && !!user?.Id && !!selected && item.data?.Type === BaseItemKind.Series,
        queryFn: ({ signal }) => clientRequest(async () => (await getShowApi(api!).getEpisodes({ seriesId: id, seasonId: selected,
            userId: user!.Id, fields: [ItemFields.Overview] }, { signal })).data.Items || [])
    });
    const next = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Next', id],
        staleTime: 30000,
        enabled: !!api && !!user?.Id && item.data?.Type === BaseItemKind.Series,
        queryFn: ({ signal }) => clientRequest(async () => (await getShowApi(api!).getNextUp({ seriesId: id, userId: user!.Id,
            limit: 1, enableResumable: true }, { signal })).data.Items?.[0] || null)
    });
    const similar = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Similar', id],
        enabled: !!api && !!user?.Id && !!item.data,
        queryFn: ({ signal }) => clientRequest(async () => (await getLibraryApi(api!).getSimilarItems({ itemId: id,
            userId: user!.Id, limit: 12 }, { signal })).data.Items || [])
    });
    return { item, seasons, episodes, next, similar, selected };
}

export function useClientFilters(view: string) {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Genres', view],
        enabled: !!api && !!user?.Id && ['home', 'films', 'series', 'search', 'mine', 'tonight'].includes(view),
        queryFn: ({ signal }) => clientRequest(async () => {
            let types = [BaseItemKind.Movie, BaseItemKind.Series];
            if (view === 'films' || view === 'tonight') types = [BaseItemKind.Movie];
            if (view === 'series') types = [BaseItemKind.Series];
            return (await getFilterApi(api!).getQueryFilters({ userId: user!.Id,
                includeItemTypes: types, recursive: true }, { signal })).data;
        })
    });
}

export function useClientCollections(enabled: boolean) {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Collections'],
        enabled: enabled && !!api && !!user?.Id,
        queryFn: ({ signal }) => clientRequest(async () => (await getLibraryApi(api!).getItems({ userId: user!.Id, includeItemTypes: [BaseItemKind.BoxSet], recursive: true, limit: 30, imageTypeLimit: 1 }, { signal })).data.Items || [])
    });
}
