import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

import { clientRequest } from '../session';

export function useLocalTrailers(item: BaseItemDto, enabled: boolean) {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'LocalTrailers', item.Id],
        enabled: enabled && !!api && !!user?.Id && !!item.Id && item.LocalTrailerCount !== 0,
        staleTime: 300000,
        retry: false,
        queryFn: ({ signal }) => clientRequest(async () => {
            const { data } = await getLibraryApi(api!).getLocalTrailers({ itemId: item.Id!, userId: user!.Id }, { signal });
            return Array.isArray(data) ? data.filter(trailer => trailer.Id) : [];
        })
    });
}
