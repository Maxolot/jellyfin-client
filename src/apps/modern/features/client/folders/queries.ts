import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { useApi } from 'hooks/useApi';
import { useMemo } from 'react';

import { buildMediaQueue } from '../mediaQueue';
import { isExternal } from '../seerr/model';
import { sharedCatalogItems, useSharedCatalog } from '../sharedCatalog';
import { folderMemberKey, type Folder, type FolderDetail, type FolderItem, type FolderShare, type FolderTarget } from './model';

function useFolderApi() {
    const { api, user } = useApi();
    const key = ['ClientFolders', api?.basePath, user?.Id];
    async function request<T>(path: string, method = 'GET', data?: unknown, signal?: AbortSignal) {
        if (!api || !user?.Id) throw new Error('Missing folder session');
        const result = await api.axiosInstance.request<T>({
            url: api.basePath + '/SharedCatalog/Folders' + path,
            method,
            data,
            signal,
            headers: { Authorization: `MediaBrowser Token="${api.accessToken}"` }
        });
        return result.data;
    }
    return { key, request, enabled: !!api && !!user?.Id };
}

export function useFolders() {
    const { key, enabled, request } = useFolderApi();
    return useQuery({
        queryKey: key,
        enabled,
        staleTime: 15000,
        retry: false,
        queryFn: async ({ signal }) => {
            try {
                const folders = await request<Folder[]>('', 'GET', undefined, signal);
                return Array.isArray(folders) ? folders : null;
            } catch (error) {
                if (isAxiosError(error) && error.response?.status === 404) return null;
                throw error;
            }
        }
    });
}

export function useFolderDetail(id: string | undefined) {
    const { key, enabled, request } = useFolderApi();
    return useQuery({
        queryKey: [...key, 'Detail', id],
        enabled: enabled && !!id,
        retry: false,
        queryFn: ({ signal }) => request<FolderDetail>(`/${id}?includeFollowed=true`, 'GET', undefined, signal)
    });
}

export function useFolderTargets(active = true) {
    const { key, enabled, request } = useFolderApi();
    return useQuery({
        queryKey: [...key, 'Targets'],
        enabled: enabled && active,
        staleTime: 30000,
        retry: false,
        queryFn: ({ signal }) => request<FolderTarget[]>('/ShareTargets', 'GET', undefined, signal)
    });
}

export function useFolderTitles(entries: FolderItem[] | undefined) {
    const { api, user } = useApi();
    const ids = entries?.flatMap(entry => entry.itemId || []) || [];
    const followedKeys = entries?.filter(entry => entry.followed).map(folderMemberKey).join(',') || '';
    const virtual = !!followedKeys;
    const followed = useSharedCatalog(virtual);
    const local = useQuery({
        queryKey: ['ClientFolders', api?.basePath, user?.Id, 'Titles', ids],
        enabled: !!api && !!user?.Id && ids.length > 0,
        queryFn: async ({ signal }) => {
            const library = getLibraryApi(api!);
            const batches = Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ids.slice(i * 50, (i + 1) * 50));
            const results = await Promise.all(batches.map(batch => library.getItems({
                ids: batch, userId: user!.Id, enableImages: true, imageTypeLimit: 1
            }, { signal })));
            return results.flatMap(({ data }) => data.Items || []);
        }
    });
    const data = useMemo(() => {
        const localItems = local.data || [];
        if (!followedKeys || !followed.data?.length) return localItems;
        const keys = new Set(followedKeys.split(','));
        const entriesToLoad = followed.data.filter(entry => keys.has(`seerr-${entry.type}-${entry.id}`));
        return [...localItems, ...sharedCatalogItems(entriesToLoad, [])];
    }, [local.data, followed.data, followedKeys]);
    return {
        data, isPending: (ids.length > 0 && local.isPending) || (virtual && followed.isPending),
        isSuccess: (!ids.length || local.isSuccess) && (!virtual || followed.isSuccess),
        isError: local.isError || (virtual && followed.isError),
        refetch: () => Promise.all([ids.length && local.refetch(), virtual && followed.refetch()])
    };
}

type FolderChange =
    | { method: 'POST'; path: ''; data: { name: string } }
    | { method: 'PATCH'; path: string; data: { name: string } }
    | { method: 'DELETE'; path: string }
    | { method: 'PUT'; path: string; data?: { shares: FolderShare[] } | { itemIds: string[] } | { keys: string[] } };

export function useFolderChange() {
    const { key, request } = useFolderApi();
    const cache = useQueryClient();
    return useMutation({
        networkMode: 'always',
        mutationFn: (change: FolderChange) => request<Folder | undefined>(change.path, change.method, 'data' in change ? change.data : undefined),
        onSettled: async () => {
            await cache.invalidateQueries({ queryKey: key });
        }
    });
}

export function useFolderDuration(items: BaseItemDto[]) {
    const { api, user } = useApi();
    const playable = items.filter(item => !isExternal(item));
    const ids = playable.map(item => item.Id || '').sort((left, right) => left.localeCompare(right));
    return useQuery({
        queryKey: ['ClientFolders', api?.basePath, user?.Id, 'Duration', ids],
        enabled: !!api && !!user?.Id && !!ids.length,
        staleTime: 300000,
        retry: false,
        queryFn: async ({ signal }) => {
            const present = await buildMediaQueue(playable, async seriesId => (await getShowApi(api!).getEpisodes({
                seriesId, userId: user!.Id, isMissing: false, enableImages: false, enableUserData: false
            }, { signal })).data.Items || [], false);
            const ticks = present.reduce((total, item) => total + (item.RunTimeTicks || 0), 0);
            return { ticks, incomplete: present.some(item => !item.RunTimeTicks) };
        }
    });
}
