import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

import { hasCompleteArtwork, resolveCatalogueArtwork } from './catalogArtwork';
import type { SharedCatalogEntry } from './sharedCatalog';
import { useSeerr } from './seerr/SeerrContext';
import type { ExternalMedia, SeerrIdentity } from './seerr/model';

export function useCatalogArtworkLookup() {
    const { call, connected } = useSeerr();
    return connected ? (identity: SeerrIdentity) => call<ExternalMedia>(`Api/${identity.type}/${identity.id}?language=fr`) : undefined;
}

/** Try once for each visible followed title. The retrieved art remains usable with an older plugin. */
export function useRepairCatalogArtwork(identity: SeerrIdentity | undefined, saved: Pick<ExternalMedia, 'posterPath' | 'backdropPath'>, nearby: boolean) {
    const { api, user } = useApi();
    const { call, connected } = useSeerr();
    const cache = useQueryClient();
    return useQuery({
        queryKey: ['SharedCatalogArtworkRepair', api?.basePath, user?.Id, identity?.type, identity?.id],
        enabled: !!api && !!user?.Id && !!identity && connected && nearby && !hasCompleteArtwork(saved),
        staleTime: 3600000,
        retry: false,
        queryFn: async ({ signal }) => {
            const { type, id } = identity!;
            const paths = await resolveCatalogueArtwork(identity!, saved, () => call<ExternalMedia>(`Api/${type}/${id}?language=fr`, signal));
            const changed = (paths.posterPath && paths.posterPath !== saved.posterPath) || (paths.backdropPath && paths.backdropPath !== saved.backdropPath);
            if (changed) {
                try {
                    await api!.axiosInstance.put(`${api!.basePath}/SharedCatalog/Items/${type}/${id}/Artwork`, paths, {
                        signal, headers: { Authorization: `MediaBrowser Token="${api!.accessToken}"` }
                    });
                    cache.setQueryData<SharedCatalogEntry[] | null>(['SharedCatalog', api!.basePath, user?.Id], current => current?.map(entry =>
                        entry.type === type && entry.id === id ? { ...entry, posterPath: entry.posterPath || paths.posterPath, backdropPath: entry.backdropPath || paths.backdropPath } : entry) ?? current);
                } catch { /* The returned art also works with older plugins or read-only connections. */ }
            }
            return paths;
        }
    });
}
