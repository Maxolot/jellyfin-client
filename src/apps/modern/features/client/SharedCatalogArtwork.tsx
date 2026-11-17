import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useEffect, useRef, useState } from 'react';

import Artwork from './Artwork';
import { externalIdentity, imageUrl } from './seerr/model';
import { useSeerrDetail } from './seerr/queries';

/** Resolve posters for older catalog entries saved before their local copy was removed. */
export default function SharedCatalogArtwork({ item, backdrop }: Readonly<{ item: BaseItemDto; backdrop: boolean }>) {
    const anchor = useRef<HTMLSpanElement>(null);
    const [nearby, setNearby] = useState(false);
    useEffect(() => {
        const card = anchor.current?.parentElement;
        if (!card) return;
        if (!('IntersectionObserver' in window)) {
            setNearby(true);
            return;
        }
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                observer.disconnect();
                setNearby(true);
            }
        }, { rootMargin: '600px 300px' });
        observer.observe(card);
        return () => observer.disconnect();
    }, []);
    const identity = nearby ? externalIdentity(item) : undefined;
    const detail = useSeerrDetail(identity?.type, identity?.id, false);
    const images = detail.data;
    const source = imageUrl(backdrop ? images?.backdropPath || images?.posterPath : images?.posterPath, backdrop);
    return <><span ref={anchor} hidden /><Artwork source={source} /></>;
}
