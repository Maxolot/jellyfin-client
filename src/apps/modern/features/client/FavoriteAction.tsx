/* eslint-disable react/jsx-no-bind -- This is a local media action. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';

import { useApi } from 'hooks/useApi';

import ClientIcon from './ClientIcon';
import { clientRequest } from './session';

type Props = { item: BaseItemDto; onFavorite: (item: BaseItemDto) => Promise<void> };

export default function FavoriteAction({ item, onFavorite }: Readonly<Props>) {
    const { api, user } = useApi();
    const [busy, setBusy] = useState(false);
    const series = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Detail', item.SeriesId],
        enabled: !!api && !!user?.Id && item.Type === 'Episode' && !!item.SeriesId,
        queryFn: ({ signal }) => clientRequest(async () => (await getLibraryApi(api!).getItem({ itemId: item.SeriesId!, userId: user!.Id }, { signal })).data)
    });
    const target = item.Type === 'Episode' ? series.data : item;
    const favorite = !!target?.UserData?.IsFavorite;
    return <button aria-label={`${favorite ? 'Retirer' : 'Ajouter'} ${target?.Name || item.SeriesName || item.Name} ${favorite ? 'de' : 'à'} ma liste`} aria-pressed={favorite} disabled={!target || busy} onClick={async () => {
        if (!target) return;
        setBusy(true);
        try {
            await onFavorite(target);
        } finally {
            setBusy(false);
        }
    }}><ClientIcon name={favorite ? 'check' : 'plus'} /></button>;
}
/* eslint-enable react/jsx-no-bind */
