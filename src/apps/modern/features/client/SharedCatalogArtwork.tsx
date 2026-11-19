import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useCallback, useRef, useState } from 'react';

import Artwork from './Artwork';
import { cataloguePaths } from './catalogArtwork';
import { useCoverPreview } from './CollectionCover';
import { externalIdentity, imageUrl, type CatalogueItem } from './seerr/model';
import { useRepairCatalogArtwork } from './useCatalogArtwork';
import './sharedArtwork.scss';

const hues = [206, 183, 232, 273, 12, 35];

export default function SharedCatalogArtwork({ item, backdrop, className }: Readonly<{ item: BaseItemDto; backdrop: boolean; className?: string }>) {
    const anchor = useRef<HTMLSpanElement>(null);
    const [failed, setFailed] = useState<string>();
    const nearby = useCoverPreview(anchor);
    const identity = externalIdentity(item);
    const saved = cataloguePaths((item as CatalogueItem).Seerr);
    const repair = useRepairCatalogArtwork(identity, saved, nearby);
    const poster = saved.posterPath || repair.data?.posterPath;
    const background = saved.backdropPath || repair.data?.backdropPath;
    const source = imageUrl(backdrop ? background || poster : poster || background, backdrop);
    const markFailed = useCallback(() => setFailed(source), [source]);
    const hue = hues[(identity?.id || 0) % hues.length];
    return <span ref={anchor} className={`client-shared-art ${className || ''}`} aria-hidden='true'>
        {source && failed !== source ? <Artwork source={source} onFailure={markFailed} /> :
            <span className='client-shared-art-fallback' style={{ '--shared-art-hue': hue } as React.CSSProperties}>
                <strong>{item.Name}</strong>{item.ProductionYear && <small>{item.ProductionYear}</small>}
            </span>}

    </span>;
}
