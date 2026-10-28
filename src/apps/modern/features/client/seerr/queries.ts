import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

import { catalogueItem, type ExternalMedia, type MediaType, type Results } from './model';
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
export function useSeerrCatalogue(view: string, search: string, enabled: boolean) {
    const seerr = useSeerr();
    const local = useLocalIdentities(enabled && seerr.connected);
    let category = 'trending';
    if (view === 'films') category = 'movies';
    if (view === 'series') category = 'tv';
    let endpoint = `discover/${category}?language=fr`;
    if (view === 'search' && search) endpoint = `search?query=${encodeURIComponent(search)}`;
    const query = useInfiniteQuery({ queryKey: [...seerr.root, 'Catalogue', endpoint],
        enabled: enabled && seerr.connected && local.isSuccess,
        initialPageParam: 1, retry: false, staleTime: 60000,
        queryFn: ({ signal, pageParam }) => seerr.call<Results<ExternalMedia>>(`Api/${endpoint}&page=${pageParam}`, signal),
        getNextPageParam: last => (last.page || 1) < (last.totalPages || 1) ? (last.page || 1) + 1 : undefined });
    const pages = seerr.connected && enabled ? query.data?.pages : undefined;
    const items = (pages?.flatMap(page => page.results) || []).filter(entry => entry.mediaType !== 'person').map(entry => {
        const type: MediaType = entry.mediaType === 'tv' || view === 'series' ? 'tv' : 'movie';
        return catalogueItem(entry, type, local.data || []);
    });
    return { ...query, items, local };
}
export function useSeerrDetail(type: MediaType | undefined, id: number | undefined) {
    const seerr = useSeerr();
    return useQuery({ queryKey: [...seerr.root, 'Detail', type, id], enabled: seerr.connected && !!type && !!id,
        retry: false, staleTime: 15000, refetchInterval: 20000,
        queryFn: async ({ signal }) => ({ ...await seerr.call<ExternalMedia>(`Api/${type}/${id}?language=fr`, signal), mediaType: type }) });
}
