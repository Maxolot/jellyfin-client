import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api';
import { useQuery } from '@tanstack/react-query';
import React, { type ReactNode, useMemo } from 'react';

import { useApi } from 'hooks/useApi';
import { EpisodeSpoilers, isProtectedEpisode } from './spoilers';

type Continuations = { resume: BaseItemDto[]; next: BaseItemDto[] };

function useContinuingEpisodes(enabled: boolean) {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'SpoilerContinuations'],
        enabled: enabled && !!api && !!user?.Id,
        staleTime: 30000,
        retry: false,
        queryFn: async ({ signal }) => {
            const args = { userId: user!.Id!, limit: 20 };
            const [resume, next] = await Promise.all([
                getLibraryApi(api!).getResumeItems({ ...args, includeItemTypes: [BaseItemKind.Episode] }, { signal }),
                getShowApi(api!).getNextUp({ ...args, enableResumable: true }, { signal })
            ]);
            return { resume: resume.data.Items || [], next: next.data.Items || [] };
        }
    });
}

export default function SpoilerProvider({ enabled, nextId, home, continuing, children }: Readonly<{
    enabled: boolean; nextId?: string | null; home: boolean; continuing?: Continuations; children: ReactNode;
}>) {
    const query = useContinuingEpisodes(enabled && !home);
    const data = home ? continuing : query.data;
    const shouldProtect = useMemo(() => {
        const ids = [nextId, ...(data?.resume || []).map(item => item.Id), ...(data?.next || []).map(item => item.Id)];
        return (item?: BaseItemDto) => isProtectedEpisode(enabled, item, ids);
    }, [enabled, nextId, data]);
    return <EpisodeSpoilers.Provider value={shouldProtect}>{children}</EpisodeSpoilers.Provider>;
}
