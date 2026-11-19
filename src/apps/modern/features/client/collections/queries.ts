import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { getCollectionApi } from '@jellyfin/sdk/lib/utils/api/collection-api';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { useApi } from 'hooks/useApi';

import { clientRequest } from '../session';
import { canManageCollections } from './access';

export function useCollectionContents(id: string | undefined, limit?: number) {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'CollectionContents', id, limit],
        enabled: !!api && !!user?.Id && !!id,
        staleTime: limit ? 300000 : 0,
        queryFn: ({ signal }) => clientRequest(async () => (await getLibraryApi(api!).getItems({
            userId: user!.Id, parentId: id, recursive: true, includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series],
            imageTypeLimit: 1, sortBy: [ItemSortBy.SortName], limit
        }, { signal })).data.Items || [])
    });
}

type Change = { type: 'create'; name: string } | { type: 'add' | 'remove'; collectionId: string; itemId: string };

export function useCollectionChanges(onForbidden: () => void) {
    const { api, user } = useApi();
    const cache = useQueryClient();
    return useMutation({
        networkMode: 'always',
        mutationFn: (change: Change) => clientRequest(async () => {
            if (!api || !canManageCollections(user?.Policy)) throw new Error('Missing collection management rights');
            const collections = getCollectionApi(api);
            if (change.type === 'create') {
                const { data } = await collections.createCollection({ name: change.name });
                if (!data.Id) throw new Error('Missing created collection ID');
                return data.Id;
            }
            const params = { collectionId: change.collectionId, ids: [change.itemId] };
            if (change.type === 'add') await collections.addToCollection(params);
            else await collections.removeFromCollection(params);
            return undefined;
        }),
        onSuccess: async (_id, change) => {
            const account = ['Client', api?.basePath, user?.Id];
            if (change.type === 'create') await cache.invalidateQueries({ queryKey: [...account, 'Collections'] });
            else await cache.invalidateQueries({ queryKey: [...account, 'CollectionContents', change.collectionId] });
        },
        onError: error => {
            if (isAxiosError(error) && error.response?.status === 403) onForbidden();
        }
    });
}
