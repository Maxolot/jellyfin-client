import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { createContext, useContext } from 'react';

import './spoilers.scss';

type EpisodeSafety = (item?: BaseItemDto) => boolean;
export const EpisodeSpoilers = createContext<EpisodeSafety>(() => false);

export function isProtectedEpisode(enabled: boolean, item?: BaseItemDto, safeIds: readonly (string | null | undefined)[] = []) {
    return enabled && item?.Type === 'Episode' && item.UserData?.Played !== true
        && (item.UserData?.PlaybackPositionTicks || 0) <= 0 && !(item.Id && safeIds.includes(item.Id));
}

export function useEpisodeSpoilers() {
    return useContext(EpisodeSpoilers);
}

export function EpisodeSummary({ item, protectedContent }: Readonly<{ item: BaseItemDto; protectedContent: boolean }>) {
    if (!item.Overview) return null;
    if (!protectedContent) return <p>{item.Overview}</p>;
    return <details className='client-spoiler-summary'>
        <summary>Afficher le résumé</summary>
        <p>{item.Overview}</p>
    </details>;
}
