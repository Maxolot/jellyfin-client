import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api';
import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

import { calendarDay, episodesForSeries, followedSeries, seriesKey } from './personalUpcoming';
import { useLocalIdentities } from './seerr/queries';
import { clientRequest } from './session';
import { sharedCatalogItems, type SharedCatalogEntry } from './sharedCatalog';

const PAGE_SIZE = 50;
const ROW_SIZE = 12;

export default function usePersonalUpcoming(watchedSeries: string[] | undefined, catalog: SharedCatalogEntry[] | undefined) {
    const { api, user } = useApi();
    const account = ['Client', api?.basePath, user?.Id];
    const userId = user?.Id || '';
    const subscribed = userId ? (catalog || []).filter(entry => entry.type === 'tv' && seriesKey(entry.addedBy) === seriesKey(userId)) : [];
    const identities = useLocalIdentities(subscribed.length > 0);
    const catalogSeries = sharedCatalogItems(subscribed, identities.data || []).filter(entry => !entry.Id?.startsWith('seerr-'));
    const interests = useQuery({
        queryKey: [...account, 'FollowedSeries'],
        enabled: !!api && !!userId,
        staleTime: 60000,
        queryFn: ({ signal }) => clientRequest(async () => {
            const library = getLibraryApi(api!);
            const options = { userId, enableImages: false, enableTotalRecordCount: false };
            const [favorites, resumes] = await Promise.all([
                library.getItems({ ...options, recursive: true, isFavorite: true, includeItemTypes: [BaseItemKind.Series, BaseItemKind.Episode] }, { signal }),
                library.getResumeItems({ ...options, includeItemTypes: [BaseItemKind.Episode] }, { signal })
            ]);
            return followedSeries(favorites.data.Items || [], resumes.data.Items || []);
        })
    });
    const ids = [...new Set([...(watchedSeries || []), ...(interests.data || []), ...catalogSeries.map(item => item.Id)].map(seriesKey).filter(Boolean))].sort((left, right) => left.localeCompare(right));
    const today = calendarDay(new Date());
    return useQuery({
        queryKey: [...account, 'PersonalUpcoming', today, ids],
        enabled: !!api && !!userId && !!ids.length && !!watchedSeries && !!catalog && !interests.isPending && (!subscribed.length || !identities.isPending),
        staleTime: 300000,
        retry: false,
        queryFn: ({ signal }) => clientRequest(async () => {
            const shows = getShowApi(api!);
            const wanted = new Set(ids);
            const seen = new Set<string>();
            const episodes = [];
            let startIndex = 0;
            while (episodes.length < ROW_SIZE) {
                const { data } = await shows.getUpcomingEpisodes({ userId, startIndex, limit: PAGE_SIZE,
                    fields: [ItemFields.Overview], imageTypeLimit: 1, enableUserData: false }, { signal });
                const batch = data.Items || [];
                const newItems = batch.filter(item => {
                    const id = seriesKey(item.Id);
                    if (!id || seen.has(id)) return false;
                    seen.add(id);
                    return true;
                });
                episodes.push(...episodesForSeries(newItems, wanted, today));
                // Jellyfin reports the current page size as its total; a short page marks the end.
                if (batch.length < PAGE_SIZE || !newItems.length) break;
                startIndex += batch.length;
            }
            return episodes.slice(0, ROW_SIZE);
        })
    });
}
