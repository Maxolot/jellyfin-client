import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useRef } from 'react';

import CollectionCover, { useCoverPreview } from './CollectionCover';
import { useCollectionContents } from './collections/queries';
import { folderTitleCount, hasFolderPoster } from './folders/model';

export default function CollectionCard({ collection, image, canManage }: Readonly<{ collection: BaseItemDto; image: (item: BaseItemDto) => string; canManage: boolean }>) {
    const anchor = useRef<HTMLAnchorElement>(null);
    const nearby = useCoverPreview(anchor, collection.ChildCount !== 0);
    const preview = useCollectionContents(nearby ? collection.Id || undefined : undefined, 3);
    const members = (preview.data?.items || []).filter(hasFolderPoster).map(image);
    const primary = collection.ImageTags?.Primary && collection.ChildCount !== 0 ? [image(collection)] : [];
    const posters = members.length ? members : primary;
    const count = preview.data?.total ?? collection.ChildCount;
    return <CollectionCover anchor={anchor} className='client-collection-card' id={collection.Id || ''} name={collection.Name || 'Collection'}
        to={`/client?view=collections&collection=${encodeURIComponent(collection.Id || '')}`} posters={posters}
        count={count == null ? undefined : folderTitleCount(count)} ready={preview.isSuccess || count === 0}
        emptyLabel={canManage && count === 0 ? 'Ajoutez un titre' : undefined} />;
}
