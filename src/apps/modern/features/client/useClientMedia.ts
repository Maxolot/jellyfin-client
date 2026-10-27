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

export function useClientMedia(view: string, search: string, offset: number, genre = '', sort = 'name') {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Browse', view, search, offset, genre, sort],
        staleTime: 0,
        enabled: !!api && !!user?.Id && view !== 'disabled',
        queryFn: async ({ signal }) => {
            const library = getLibraryApi(api!);
            let types = [BaseItemKind.Movie, BaseItemKind.Series];
            if (view === 'films') types = [BaseItemKind.Movie];
            if (view === 'series') types = [BaseItemKind.Series];
            const common = { userId: user!.Id, recursive: true, includeItemTypes: types,
                fields: [ItemFields.Overview, ItemFields.Genres], imageTypeLimit: 1, enableUserData: true };
            const request = { signal };
            if (view !== 'home') {
                const result = await library.getItems({ ...common, limit: 48, startIndex: offset,
                    searchTerm: search || undefined, genres: genre ? [genre] : undefined, isFavorite: view === 'mine' ? true : undefined,
                    sortBy: [sort === 'recent' ? ItemSortBy.DateCreated : ItemSortBy.SortName],
                    sortOrder: [sort === 'recent' ? SortOrder.Descending : SortOrder.Ascending] }, request);
                return { items: result.data.Items || [], total: result.data.TotalRecordCount || 0,
                    resume: [], next: [], movies: [], series: [] };
            }
            const [resume, next, movies, series] = await Promise.all([
                library.getResumeItems({ userId: user!.Id, limit: 12,
                    includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Episode], fields: common.fields }, request),
                getShowApi(api!).getNextUp({ userId: user!.Id, limit: 12, fields: common.fields }, request),
                library.getItems({ ...common, includeItemTypes: [BaseItemKind.Movie], limit: 20,
                    sortBy: [ItemSortBy.DateCreated], sortOrder: [SortOrder.Descending] }, request),
                library.getItems({ ...common, includeItemTypes: [BaseItemKind.Series], limit: 20,
                    sortBy: [ItemSortBy.DateCreated], sortOrder: [SortOrder.Descending] }, request)
            ]);
            const continuing = uniqueItems(resume.data.Items || []);
            return { items: [], total: 0, resume: continuing,
                next: uniqueItems(next.data.Items || [], continuing),
                movies: uniqueItems(movies.data.Items || [], continuing), series: uniqueItems(series.data.Items || []) };
        }
    });
}

export function useClientDetails(id: string, season: string) {
    const { api, user } = useApi();
    const item = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Detail', id],
        staleTime: 0,
        enabled: !!api && !!user?.Id && !!id,
        queryFn: async ({ signal }) => (await getLibraryApi(api!).getItem({ itemId: id, userId: user!.Id! }, { signal })).data
    });
    const seasons = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Seasons', id],
        enabled: !!api && !!user?.Id && item.data?.Type === BaseItemKind.Series,
        queryFn: async ({ signal }) => (await getShowApi(api!).getSeasons({ seriesId: id, userId: user!.Id }, { signal })).data.Items || []
    });
    const selected = season || seasons.data?.[0]?.Id || '';
    const episodes = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Episodes', id, selected],
        enabled: !!api && !!user?.Id && !!selected && item.data?.Type === BaseItemKind.Series,
        queryFn: async ({ signal }) => (await getShowApi(api!).getEpisodes({ seriesId: id, seasonId: selected,
            userId: user!.Id, fields: [ItemFields.Overview] }, { signal })).data.Items || []
    });
    const next = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Next', id],
        staleTime: 0,
        enabled: !!api && !!user?.Id && item.data?.Type === BaseItemKind.Series,
        queryFn: async ({ signal }) => (await getShowApi(api!).getNextUp({ seriesId: id, userId: user!.Id,
            limit: 1, enableResumable: true }, { signal })).data.Items?.[0] || null
    });
    const similar = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Similar', id],
        enabled: !!api && !!user?.Id && !!item.data,
        queryFn: async ({ signal }) => (await getLibraryApi(api!).getSimilarItems({ itemId: id,
            userId: user!.Id, limit: 12 }, { signal })).data.Items || []
    });
    return { item, seasons, episodes, next, similar, selected };
}

export function useClientGenres(view: string) {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Genres', view],
        enabled: !!api && !!user?.Id && ['films', 'series', 'search', 'mine'].includes(view),
        queryFn: async ({ signal }) => {
            let types = [BaseItemKind.Movie, BaseItemKind.Series];
            if (view === 'films') types = [BaseItemKind.Movie];
            if (view === 'series') types = [BaseItemKind.Series];
            return (await getFilterApi(api!).getQueryFilters({ userId: user!.Id,
                includeItemTypes: types, recursive: true }, { signal })).data.Genres || [];
        }
    });
}
