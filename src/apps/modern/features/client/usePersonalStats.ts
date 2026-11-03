import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { SortOrder } from '@jellyfin/sdk/lib/generated-client/models/sort-order';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

import { distinctHistory, summarizeViewing } from './personalStats';
import { clientRequest } from './session';

export function usePersonalStats() {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'PersonalStats'],
        staleTime: 60000,
        enabled: !!api && !!user?.Id,
        queryFn: ({ signal }) => clientRequest(async () => {
            const library = getLibraryApi(api!);
            const played = { userId: user!.Id, recursive: true, isPlayed: true, enableUserData: true, enableImages: false };
            const [movies, episodes] = await Promise.all([
                library.getItems({ ...played, includeItemTypes: [BaseItemKind.Movie], fields: [ItemFields.Genres] }, { signal }),
                library.getItems({ ...played, includeItemTypes: [BaseItemKind.Episode] }, { signal })
            ]);
            const episodeItems = episodes.data.Items || [];
            const seriesIds = [...new Set(episodeItems.map(episode => episode.SeriesId).filter((id): id is string => !!id))];
            const series = seriesIds.length ? (await library.getItems({ userId: user!.Id, ids: seriesIds, enableUserData: true,
                enableImages: false, fields: [ItemFields.Genres] }, { signal })).data.Items || [] : [];
            return summarizeViewing(movies.data.Items || [], episodeItems, series);
        })
    });
}

export function useViewingHistory() {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'History'],
        staleTime: 30000,
        enabled: !!api && !!user?.Id,
        queryFn: ({ signal }) => clientRequest(async () => distinctHistory((await getLibraryApi(api!).getItems({ userId: user!.Id, recursive: true,
            isPlayed: true, includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Episode], sortBy: [ItemSortBy.DatePlayed],
            sortOrder: [SortOrder.Descending], limit: 40, enableUserData: true, imageTypeLimit: 1,
            fields: [ItemFields.Overview, ItemFields.Genres] }, { signal })).data.Items || []))
    });
}
