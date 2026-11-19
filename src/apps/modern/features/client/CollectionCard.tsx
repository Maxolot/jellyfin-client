import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useRef } from 'react';

import CollectionCover, { useCoverPreview } from './CollectionCover';
import { useCollectionShelf } from './collections/queries';
import { folderTitleCount, hasFolderPoster, shelfPoster } from './folders/model';

export default function CollectionCard({ collection, image, canManage }: Readonly<{ collection: BaseItemDto; image: (item: BaseItemDto) => string; canManage: boolean }>) {
    const anchor = useRef<HTMLAnchorElement>(null);
    const nearby = useCoverPreview(anchor);
    const preview = useCollectionShelf(nearby ? collection.Id || undefined : undefined, 3);
    const members = preview.items.filter(hasFolderPoster).slice(0, 3).map(item => shelfPoster(item, image)).filter(Boolean);
    const primary = collection.ImageTags?.Primary && collection.ChildCount !== 0 ? [image(collection)] : [];
    const posters = members.length ? members : primary;
    const count = preview.count ?? collection.ChildCount;
    return <CollectionCover anchor={anchor} className='client-collection-card' id={collection.Id || ''} name={collection.Name || 'Collection'}
        to={`/client?view=collections&collection=${encodeURIComponent(collection.Id || '')}`} posters={posters}
        count={count == null ? undefined : folderTitleCount(count)} ready={preview.isSuccess || count === 0}
        emptyLabel={canManage && count === 0 ? 'Ajoutez un titre' : undefined} />;
}
