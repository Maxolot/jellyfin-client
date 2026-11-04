import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import Artwork from './Artwork';
import ClientIcon from './ClientIcon';

export default function CollectionCard({ collection, image }: Readonly<{ collection: BaseItemDto; image: (item: BaseItemDto) => string }>) {
    const { api, user } = useApi();
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
    const members = useQuery({ queryKey: ['Client', api?.basePath, user?.Id, 'CollectionPreview', collection.Id],
        enabled: nearby && !!api && !!user?.Id && !!collection.Id, staleTime: 300000,
        queryFn: async ({ signal }) => (await getLibraryApi(api!).getItems({ userId: user!.Id, parentId: collection.Id, recursive: true, includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series], limit: 3, imageTypeLimit: 1 }, { signal })).data.Items || [] });
    const ownArtwork = Object.keys(collection.ImageTags || {}).length > 0 || !!collection.BackdropImageTags?.length;
    const preview = members.data?.length ? members.data : [];
    if (!preview.length && ownArtwork) preview.push(collection);
    return <Link ref={anchor} to={`/client?view=search&collection=${collection.Id}&collectionName=${encodeURIComponent(collection.Name || '')}`}><span className='client-collection-art client-collection-stack'>{preview.map(item => <Artwork key={item.Id} source={image(item)} />)}{!preview.length && <ClientIcon name='collection' />}</span><strong>{collection.Name}</strong></Link>;
}
