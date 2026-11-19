import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import Artwork from './Artwork';
import ClientIcon from './ClientIcon';
import { useCollectionContents } from './collections/queries';

export default function CollectionCard({ collection, image }: Readonly<{ collection: BaseItemDto; image: (item: BaseItemDto) => string }>) {
    const anchor = useRef<HTMLAnchorElement>(null);
    const [nearby, setNearby] = useState(false);
    useEffect(() => {
        if (!anchor.current) return;
        if (!('IntersectionObserver' in window)) {
            setNearby(true);
            return;
        }
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                setNearby(true);
                observer.disconnect();
            }
        }, { rootMargin: '400px 120px' });
        observer.observe(anchor.current);
        return () => observer.disconnect();
    }, []);
    const members = useCollectionContents(nearby ? collection.Id || undefined : undefined, 3);
    const posters = (members.data || []).map(item => ({ id: item.Id, source: image(item) })).filter(poster => poster.source);
    const cover = collection.ImageTags?.Primary ? image(collection) : '';
    if (!posters.length && cover) posters.push({ id: collection.Id, source: cover });
    return <Link ref={anchor} className='client-collection-card' data-client-focus={collection.Id} to={`/client?view=collections&collection=${collection.Id}`}>
        <span className='client-collection-stack' aria-hidden='true'>
            {posters.length ? posters.map(({ id, source }) => <span key={id}><Artwork source={source} /></span>) : <ClientIcon name='collection' />}
        </span>
        <strong>{collection.Name}</strong><ClientIcon name='next' />
    </Link>;
}
