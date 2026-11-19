import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import Artwork from './Artwork';
import ClientIcon from './ClientIcon';
import { useCollectionContents } from './collections/queries';

export default function CollectionCard({ collection, image }: Readonly<{ collection: BaseItemDto; image: (item: BaseItemDto) => string }>) {
    const anchor = useRef<HTMLAnchorElement>(null);
    const countId = useId();
    const [nearby, setNearby] = useState(false);
    const [failedCover, setFailedCover] = useState('');
    const primary = collection.ImageTags?.Primary ? image(collection) : '';
    const cover = primary !== failedCover ? primary : '';
    const hasCount = collection.ChildCount != null;
    const needsPreview = !hasCount || (!cover && collection.ChildCount !== 0);

    useEffect(() => {
        const node = anchor.current;
        if (!node || !needsPreview || nearby) return;
        if (!('IntersectionObserver' in window)) {
            setNearby(true);
            return;
        }
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                setNearby(true);
                observer.disconnect();
            }
        }, { rootMargin: '300px 0px' });
        observer.observe(node);
        return () => observer.disconnect();
    }, [nearby, needsPreview]);

    const preview = useCollectionContents(nearby && needsPreview ? collection.Id || undefined : undefined, 4);
    const posters = (preview.data?.items || []).filter(item => item.ImageTags?.Primary);
    const count = preview.data?.total ?? collection.ChildCount;
    const noun = count === 1 ? 'titre' : 'titres';
    const countLabel = count == null ? undefined : `${count} ${noun}`;
    const fallbackToMembers = useCallback(() => setFailedCover(primary), [primary]);

    return <Link ref={anchor} className='client-card client-collection-card' aria-label={collection.Name || undefined}
        aria-describedby={countLabel ? countId : undefined} data-client-focus={collection.Id} to={`/client?view=collections&collection=${collection.Id}`}>
        {!cover && !posters.length && <span className='client-card-fallback' aria-hidden='true'><ClientIcon name='collection' /></span>}
        {cover && <Artwork source={cover} onFailure={fallbackToMembers} />}
        {!cover && posters.length > 0 && <span className='client-collection-mosaic' data-posters={posters.length} aria-hidden='true'>
            {posters.map(item => <span key={item.Id}><Artwork source={image(item)} /></span>)}
        </span>}
        <span className='client-card-caption'>
            <strong>{collection.Name}</strong>
            {countLabel && <small id={countId}>{countLabel}</small>}
        </span>
    </Link>;
}
