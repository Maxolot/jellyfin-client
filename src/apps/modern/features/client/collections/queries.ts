import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { ImageType } from '@jellyfin/sdk/lib/generated-client/models/image-type';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { getCollectionApi } from '@jellyfin/sdk/lib/utils/api/collection-api';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useMemo } from 'react';

import { useApi } from 'hooks/useApi';

import { orderedFolderItems, followedPath, type FolderItem } from '../folders/model';
import { useFolderTitles } from '../folders/queries';
import { clientRequest } from '../session';
import { canManageCollections } from './access';
import { membershipRequest, useFollowedMemberships } from './followed';
import { mergeCollectionMembers } from './members';

export function useClientCollections(enabled: boolean, limit: number | null = 30) {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Collections', limit],
        enabled: enabled && !!api && !!user?.Id,
        queryFn: ({ signal }) => clientRequest(async () => (await getLibraryApi(api!).getItems({ userId: user!.Id, includeItemTypes: [BaseItemKind.BoxSet], recursive: true, limit: limit ?? undefined, imageTypeLimit: 1, sortBy: [ItemSortBy.SortName], fields: limit === null ? [ItemFields.ChildCount] : undefined }, { signal })).data.Items || [])
    });
}

function useCollectionContents(id: string | undefined, limit?: number) {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'CollectionContents', id, limit, 'ItemsAndCount'],
        enabled: !!api && !!user?.Id && !!id,
        staleTime: limit ? 300000 : 0,
        queryFn: ({ signal }) => clientRequest(async () => {
            const { data } = await getLibraryApi(api!).getItems({
                userId: user!.Id, parentId: id, recursive: true, includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series],
                imageTypeLimit: 1, fields: [ItemFields.ProviderIds], sortBy: [ItemSortBy.SortName], limit,
                enableUserData: limit ? false : undefined,
                enableImageTypes: limit ? [ImageType.Primary] : undefined,
                enableTotalRecordCount: !!limit
            }, { signal });
            return { items: data.Items || [], total: data.TotalRecordCount };
        })
    });
}

export function useCollectionShelf(id: string | undefined, limit?: number) {
    const { api, user } = useApi();
    const capabilities = useFollowedMemberships(!!id);
    const supported = capabilities.data === true;
    const contents = useCollectionContents(id, limit);
    const search = limit ? `?limit=${limit}` : '';
    const followed = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'CollectionContents', id, 'Followed', limit],
        enabled: !!id && supported, staleTime: limit ? 300000 : 0, retry: false,
        queryFn: ({ signal }) => membershipRequest<{ items: FolderItem[]; total: number }>(api!, `Collections/${id}/Followed` + search, signal)
    });
    const titles = useFolderTitles(followed.data?.items);
    const data = useMemo(() => {
        const virtual = orderedFolderItems(followed.data?.items || [], titles.data);
        return mergeCollectionMembers(contents.data?.items || [], virtual);
    }, [followed.data, titles.data, contents.data]);
    const items = data.entries.map(entry => entry.item);
    const localCount = limit ? contents.data?.total ?? contents.data?.items.length : contents.data?.items.length;
    const requestedCount = limit ? followed.data?.total ?? 0 : data.additions.length;
    const count = localCount === undefined ? undefined : localCount + requestedCount;
    return {
        entries: data.entries, items, count, followed: followed.data?.items, isPending: contents.isPending || (supported && followed.isPending) || titles.isPending,
        isSuccess: contents.isSuccess && (!supported || followed.isSuccess) && titles.isSuccess,
        isError: contents.isError || followed.isError || titles.isError, supported,
        refetch: () => Promise.all([contents.refetch(), supported && followed.refetch(), titles.refetch()])
    };
}

type Change = { type: 'create'; name: string } | { type: 'add' | 'remove'; collectionId: string; itemId: string }
    | { type: 'add-followed' | 'remove-followed'; collectionId: string; member: { type: 'movie' | 'tv'; id: number } }
    | { type: 'promote'; collectionId: string };

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
            const path = `Collections/${change.collectionId}`;
            if (change.type === 'promote') {
                await membershipRequest(api, `${path}/Followed/Promote`, undefined, 'POST');
                return undefined;
            }
            if ('member' in change) {
                await membershipRequest(api, path + followedPath(change.member.type, change.member.id), undefined,
                    change.type === 'add-followed' ? 'PUT' : 'DELETE');
                return undefined;
            }
            const params = { collectionId: change.collectionId, ids: [change.itemId] };
            if (change.type === 'add') await collections.addToCollection(params);
            else await collections.removeFromCollection(params);
            return undefined;
        }),
        onSuccess: async (_id, change) => {
            const account = ['Client', api?.basePath, user?.Id];
            const invalidations = [cache.invalidateQueries({ queryKey: [...account, 'Collections'] })];
            if (change.type !== 'create') invalidations.push(cache.invalidateQueries({ queryKey: [...account, 'CollectionContents', change.collectionId] }));
            await Promise.all(invalidations);
        },
        onError: async (error, change) => {
            if (isAxiosError(error) && error.response?.status === 403) onForbidden();
            if (change.type === 'remove-followed') {
                await cache.invalidateQueries({
                    queryKey: ['Client', api?.basePath, user?.Id, 'CollectionContents', change.collectionId]
                });
            }
        }
    });
}
