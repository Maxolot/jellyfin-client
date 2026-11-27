import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { useApi } from 'hooks/useApi';

import type { RequestProgress } from './model';

export const requestProgressPrefix = ['SharedCatalog', 'Requests'];

export function useRequestProgress(enabled = true, poll = false) {
    const { api, user } = useApi();
    return useQuery<RequestProgress[] | null>({
        queryKey: [...requestProgressPrefix, api?.basePath, user?.Id],
        enabled: !!api && !!user?.Id && enabled,
        staleTime: 5000,
        retry: false,
        refetchInterval: query => poll && Array.isArray(query.state.data) ? 5000 : false,
        refetchIntervalInBackground: false,
        queryFn: async ({ signal }) => {
            try {
                const { data } = await api!.axiosInstance.get<RequestProgress[]>(api!.basePath + '/SharedCatalog/Requests', {
                    signal, headers: { Authorization: `MediaBrowser Token="${api!.accessToken}"` }
                });
                return Array.isArray(data) ? data : null;
            } catch (error) {
                if (isAxiosError(error) && error.response?.status === 404) return null;
                throw error;
            }
        }
    });
}

export function useRefreshRequestProgress() {
    const cache = useQueryClient();
    return () => cache.invalidateQueries({ queryKey: requestProgressPrefix });
}

export function usePlayRequest(play: (item: BaseItemDto) => void) {
    const { api, user } = useApi();
    return useMutation({
        mutationFn: async (entry: RequestProgress) => {
            if (!api || !user?.Id || !entry.itemId || entry.stage !== 'available') throw new Error('Playback unavailable');
            if (entry.type === 'movie') {
                return (await getLibraryApi(api).getItem({ userId: user.Id, itemId: entry.itemId })).data;
            }
            const season = entry.seasons.find(part => part.available > 0);
            const { data } = await getShowApi(api).getEpisodes({ seriesId: entry.itemId, userId: user.Id, season: season?.number, isMissing: false, limit: 1 });
            const first = data.Items?.[0];
            if (!first) throw new Error('No available episode');
            return first;
        },
        onSuccess: item => play(item)
    });
}
