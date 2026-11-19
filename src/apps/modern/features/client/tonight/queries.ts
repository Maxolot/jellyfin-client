import type { Api } from '@jellyfin/sdk';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { useApi } from 'hooks/useApi';

import { clientRequest } from '../session';
import { identity, type JointIdea, type TonightTitle } from './model';

type Options = { allowTogether: boolean; hidden: string[]; partners: Array<{ id: string; name: string }>; filed: Record<string, string | null> };

function useTonightApi() {
    const { api, user } = useApi();
    const key = ['SharedCatalog', 'Tonight', api?.basePath, user?.Id];
    async function request<T>(route = '', signal?: AbortSignal, data?: unknown) {
        const response = await api!.axiosInstance.request<T>({
            url: api!.basePath + '/SharedCatalog/Tonight' + route, method: data === undefined ? 'GET' : 'PUT',
            signal, data, headers: { Authorization: `MediaBrowser Token="${api!.accessToken}"` }
        });
        return response.data;
    }
    return { key, request, enabled: !!api && !!user?.Id };
}

export function useTonightOptions() {
    const { key, request, enabled } = useTonightApi();
    return useQuery<Options | null>({
        queryKey: key, enabled, retry: false, staleTime: 30000,
        queryFn: async ({ signal }) => {
            try {
                return await request<Options>('', signal);
            } catch (error) {
                if (isAxiosError(error) && error.response?.status === 404) return null;
                throw error;
            }
        }
    });
}

export function useTonightTogether(partner: string) {
    const { key, request, enabled } = useTonightApi();
    return useQuery({
        queryKey: [...key, 'Together', partner], enabled: enabled && !!partner,
        retry: false, staleTime: 30000,
        queryFn: async ({ signal }) => {
            const response = await request<{ results: Array<Omit<JointIdea, 'position'>> }>(`/Together?partner=${encodeURIComponent(partner)}`, signal);
            return new Map(response.results.map((entry, position) => [identity(entry.itemId), { ...entry, position }]));
        }
    });
}

type PreferenceAction = { route: '/Privacy'; data: { allowTogether: boolean } } | { route: '/Hide'; data: { key: string } }
    | { route: `/Later/${string}`; data: Record<string, never> };

export function useTonightAction() {
    const { key, request } = useTonightApi();
    const { api, user } = useApi();
    const cache = useQueryClient();
    return useMutation({
        mutationFn: (action: PreferenceAction) => request<{ folderId?: string }>(action.route, undefined, action.data),
        onSuccess: async (_, action) => {
            await cache.invalidateQueries({ queryKey: key });
            if (action.route.startsWith('/Later/')) await cache.invalidateQueries({ queryKey: ['ClientFolders', api?.basePath, user?.Id] });
        }
    });
}

type Data = { items: TonightTitle[]; started: string[] };

async function readLibrary(api: Api, userId: string, signal: AbortSignal, quick: boolean): Promise<Data> {
    const library = getLibraryApi(api);
    const titles: BaseItemDto[] = [];
    const episodeInfo = new Map<string, { episodes: number; ticks: number[]; started: boolean }>();
    const remote = quick ? readSeriesStats(api, signal) : Promise.resolve(undefined);
    const [, stats] = await Promise.all([
        readPages(async offset => (await library.getItems({ userId, recursive: true, includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series],
            fields: [ItemFields.Overview, ItemFields.Genres, ItemFields.People, ItemFields.Tags, ItemFields.ProviderIds],
            enableUserData: true, imageTypeLimit: 1, sortBy: [ItemSortBy.SortName], startIndex: offset, limit: 200 }, { signal })).data,
        item => { titles.push(item); }),
        remote.then(async summary => {
            if (summary) return summary;
            await readPages(async offset => (await library.getItems({ userId, recursive: true, includeItemTypes: [BaseItemKind.Episode], isMissing: false,
                enableUserData: true, enableImages: false, sortBy: [ItemSortBy.SortName], startIndex: offset, limit: 200 }, { signal })).data,
            item => {
                if (!item.SeriesId || item.LocationType === 'Virtual' || item.IsPlaceHolder) return;
                const id = identity(item.SeriesId);
                const series = episodeInfo.get(id) || { episodes: 0, ticks: [], started: false };
                series.episodes++;
                if (item.RunTimeTicks && series.ticks.length < 30) series.ticks.push(item.RunTimeTicks);
                series.started ||= !!item.UserData?.Played || (item.UserData?.PlaybackPositionTicks || 0) > 0;
                episodeInfo.set(id, series);
            });
            return undefined;
        })
    ]);
    const supplied = new Map((stats || []).map(series => [identity(series.itemId), series]));
    if (stats) {
        return {
            items: titles.map(item => {
                const series = supplied.get(identity(item.Id || ''));
                return item.Type === 'Series' ? { ...item, episodes: series?.episodes || 0, episodeMinutes: series?.episodeMinutes ?? undefined } : item;
            }),
            started: stats.filter(series => series.started).map(series => identity(series.itemId))
        };
    }
    return {
        items: titles.map(item => {
            if (item.Type !== 'Series') return item;
            const identified = episodeInfo.get(identity(item.Id || ''));
            if (!identified) return { ...item, episodes: 0 };
            const samples = identified.ticks;
            samples.sort((a, b) => a - b);
            return { ...item, episodes: identified.episodes,
                episodeMinutes: samples.length ? Math.ceil(samples[Math.floor(samples.length / 2)] / 6e8) : undefined };
        }),
        started: [...episodeInfo.entries()].filter(([, info]) => info.started).map(([id]) => id)
    };
}

type SeriesStats = { itemId: string; episodes: number; episodeMinutes?: number | null; started: boolean };

async function readSeriesStats(api: Api, signal: AbortSignal) {
    try {
        const { data } = await api.axiosInstance.get<SeriesStats[]>(api.basePath + '/SharedCatalog/Tonight/Series', {
            signal, headers: { Authorization: `MediaBrowser Token="${api.accessToken}"` }
        });
        return Array.isArray(data) ? data : undefined;
    } catch (error) {
        if (isAxiosError(error) && error.response?.status === 404) return undefined;
        throw error;
    }
}

async function readPages(fetchPage: (offset: number) => Promise<{ Items?: BaseItemDto[] | null; TotalRecordCount?: number | null }>,
    visit: (item: BaseItemDto) => void) {
    let offset = 0;
    const seen = new Set<string>();
    while (true) {
        const { Items: page, TotalRecordCount: total } = await fetchPage(offset);
        const items = page || [];
        let changes = 0;
        for (const item of items) {
            const id = item.Id;
            if (!id || seen.has(id)) continue;
            seen.add(id);
            visit(item);
            changes++;
        }
        offset += items.length;
        if (!items.length || offset >= (total ?? Infinity) || items.length < 200) return;
        if (!changes) throw new Error('Repeated Tonight library page');
    }
}

export function useTonightLibrary(quick: boolean, ready: boolean) {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'TonightLibrary', quick],
        enabled: ready && !!api && !!user?.Id, staleTime: 180000, retry: false,
        queryFn: ({ signal }) => clientRequest(() => readLibrary(api!, user!.Id!, signal, quick))
    });
}
