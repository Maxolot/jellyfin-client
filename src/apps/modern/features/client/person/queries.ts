import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { getPersonApi } from '@jellyfin/sdk/lib/utils/api/person-api';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

import { useSeerr } from '../seerr/SeerrContext';
import type { ExternalMedia, Results } from '../seerr/model';
import { useLocalIdentities } from '../seerr/queries';
import { useSharedCatalog } from '../sharedCatalog';
import { clientRequest } from '../session';
import { normalizedPersonName, personTmdbId, type Credits, type Person } from './model';

const validJellyfinId = /^(?:[a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i;

export function usePersonData(personId: string, suppliedName: string) {
    const { api, user } = useApi();
    const seerr = useSeerr();
    const fromLibrary = validJellyfinId.test(personId) ? personId : undefined;
    const connection = ['Client', api?.basePath, user?.Id];
    const byName = useQuery({
        queryKey: [...connection, 'PersonByName', suppliedName],
        enabled: !!api && !!user?.Id && !fromLibrary && !!suppliedName, retry: false, staleTime: 60000,
        queryFn: ({ signal }) => clientRequest(async () => {
            const { data } = await getPersonApi(api!).getPersons({ userId: user!.Id!, searchTerm: suppliedName, limit: 10 }, { signal });
            const exact = data.Items?.filter(item => normalizedPersonName(item.Name) === normalizedPersonName(suppliedName));
            return exact?.length === 1 ? exact[0].Id || null : null;
        })
    });
    const localId = fromLibrary || byName.data || undefined;
    const enabled = !!api && !!user?.Id && !!localId;
    const local = useQuery({
        queryKey: [...connection, 'Person', localId],
        enabled, retry: false,
        queryFn: ({ signal }) => clientRequest(async () => {
            const { data } = await getLibraryApi(api!).getItem({ itemId: localId!, userId: user!.Id! }, { signal });
            return data.Type === 'Person' ? data : undefined;
        })
    });
    const name = local.data?.Name || suppliedName;
    const provider = local.data?.ProviderIds?.Tmdb || local.data?.ProviderIds?.tmdb;
    const tmdbId = personTmdbId(provider) || (!fromLibrary ? personTmdbId(personId) : undefined);
    const resolved = useQuery({
        queryKey: [...seerr.root, 'PersonName', name],
        enabled: seerr.connected && !!name && !tmdbId && (!localId || local.isFetched), retry: false,
        queryFn: async ({ signal }) => {
            const response = await seerr.call<Results<ExternalMedia>>(`Api/search?query=${encodeURIComponent(name)}&page=1&language=fr`, signal);
            const exact = response.results.filter(result => result.mediaType === 'person'
                && normalizedPersonName(result.name) === normalizedPersonName(name));
            return exact.length === 1 ? exact[0].id : null;
        }
    });
    const remoteId = tmdbId || resolved.data;
    const remote = useQuery({
        queryKey: [...seerr.root, 'Person', remoteId],
        enabled: seerr.connected && !!remoteId, staleTime: 300000, retry: false,
        queryFn: async ({ signal }) => {
            const [person, credits] = await Promise.all([
                seerr.call<Person>(`Api/person/${remoteId}?language=fr`, signal),
                seerr.call<Credits>(`Api/person/${remoteId}/combined_credits?language=fr`, signal)
            ]);
            return { person, credits };
        }
    });
    const associated = useQuery({
        queryKey: [...connection, 'PersonFilmography', localId],
        enabled, retry: false, staleTime: 60000,
        queryFn: async ({ signal }) => {
            const result = await getLibraryApi(api!).getItems({
                userId: user!.Id!, personIds: [localId!], recursive: true,
                includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series],
                fields: [ItemFields.ProviderIds, ItemFields.People], enableUserData: true, imageTypeLimit: 1
            }, { signal });
            return result.data.Items || [];
        }
    });
    const library = useLocalIdentities(seerr.connected && !!remote.data?.credits);
    const shared = useSharedCatalog();
    const localItems: BaseItemDto[] = associated.data || [];
    return { local, localId, localItems, remote, name, library, shared, associated, resolving: byName.isLoading || resolved.isLoading };
}
