import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useEffect, useState } from 'react';

import { heroArtworkSizes, preloadArtwork } from './artwork';

/** Keep the current slide's title and actions while a newly selected image is loading. */
export default function useLoadedHero(candidate: BaseItemDto | undefined, source: string, group: string) {
    const [ready, setReady] = useState<{ item: BaseItemDto; group: string }>();
    useEffect(() => {
        if (!candidate || !source) return;
        let disposed = false;
        void preloadArtwork(source, heroArtworkSizes).then(() => {
            if (!disposed) setReady({ item: candidate, group });
        }).catch(() => undefined);
        return () => {
            disposed = true;
        };
    }, [candidate, source, group]);
    return ready?.group === group ? ready.item : candidate;
}
