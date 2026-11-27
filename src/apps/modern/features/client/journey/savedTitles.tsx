/* eslint-disable react/jsx-no-bind -- The dialog belongs to this banner. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getUserDataApi } from '@jellyfin/sdk/lib/utils/api/user-data-api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';

import { useApi } from 'hooks/useApi';

import ClientDialog from '../ClientDialog';
import { DEFAULT_FOLDER } from '../folders/FolderPicker';
import { clientRequest } from '../session';
import { useTonightAction } from '../tonight/queries';
import { ActionButton } from '../ui';

const RECENT_FILED = 30;

/** The titles most recently filed in my folders, read from the library for their artwork and progress. */
export function useSavedTitles(filed: Record<string, string | null> | undefined) {
    const { api, user } = useApi();
    const ids = Object.entries(filed || {}).filter(([key]) => !key.startsWith('seerr-'))
        .sort(([, a], [, b]) => (b || '').localeCompare(a || '')).slice(0, RECENT_FILED).map(([key]) => key);
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'SavedTitles', ids],
        enabled: !!api && !!user?.Id && !!filed,
        staleTime: 30000,
        queryFn: async ({ signal }) => {
            if (!ids.length) return [];
            return clientRequest(async () => (await getLibraryApi(api!).getItems({ userId: user!.Id, ids, enableUserData: true, imageTypeLimit: 1 }, { signal })).data.Items || []);
        }
    });
}

/** Favorites that were never watched: the old « Ma liste », to be filed once in the default folder. */
function useUnwatchedFavorites(enabled: boolean) {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'FavoritesToFile'],
        enabled: enabled && !!api && !!user?.Id,
        staleTime: 30000,
        queryFn: ({ signal }) => clientRequest(async () => ((await getLibraryApi(api!).getItems({ userId: user!.Id, recursive: true, isFavorite: true,
            includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series], enableUserData: true, enableImages: false, limit: 500 }, { signal })).data.Items || [])
            .filter(item => !item.UserData?.Played))
    });
}

/**
 * Asks once to move the old list into the default folder. Nothing changes before the account confirms,
 * and watched favorites are left as they are.
 */
export function FavoritesMigration({ enabled }: Readonly<{ enabled: boolean }>) {
    const { api, user } = useApi();
    const cache = useQueryClient();
    const favorites = useUnwatchedFavorites(enabled);
    const save = useTonightAction();
    const [open, setOpen] = useState(false);
    const [done, setDone] = useState(0);
    const [running, setRunning] = useState(false);
    const [failed, setFailed] = useState<string[]>([]);
    const items = favorites.data || [];
    if (!enabled || (!items.length && !running && !done)) return null;
    async function migrate() {
        if (!api || !user?.Id) return;
        setRunning(true);
        setFailed([]);
        const missed: string[] = [];
        for (const item of items) {
            try {
                await save.mutateAsync({ route: `/Later/${item.Id}`, data: {} });
                await clientRequest(() => getUserDataApi(api).unmarkFavoriteItem({ userId: user!.Id!, itemId: item.Id! }));
                setDone(count => count + 1);
            } catch {
                missed.push(item.Name || item.Id || '');
            }
        }
        setFailed(missed);
        setRunning(false);
        await cache.invalidateQueries({ queryKey: ['Client', api.basePath, user.Id] });
    }
    const finished = !running && done > 0;
    return <div className='client-journey-migration' role='status'>
        <p>{finished ? `${done} titres rangés dans « ${DEFAULT_FOLDER} ».` : `Ta liste contient ${items.length} titres pas encore vus. Les ranger dans « ${DEFAULT_FOLDER} » ?`}</p>
        {!finished && <ActionButton size='small' onClick={() => setOpen(true)} aria-haspopup='dialog'>Voir et ranger</ActionButton>}
        <ClientDialog className='client-folder-modal' label='Ranger ma liste' title='Ranger ma liste' subtitle={`Dans « ${DEFAULT_FOLDER} »`} controlled={{ open, onClose: () => setOpen(false) }}>
            {() => <div className='client-folder-dialog'>
                <p>Ces titres quittent ta liste pour le dossier « {DEFAULT_FOLDER} ». Les titres déjà vus restent tels quels.</p>
                <ul className='client-journey-migration-list'>{items.map((item: BaseItemDto) => <li key={item.Id}>{item.Name}{item.ProductionYear ? ` (${item.ProductionYear})` : ''}</li>)}</ul>
                {running && <p role='status'>{`Rangement… ${done} sur ${items.length}`}</p>}
                {!!failed.length && <p role='alert'>{`Non rangés : ${failed.join(', ')}. Réessaie plus tard.`}</p>}
                <ActionButton variant='primary' disabled={running || !items.length} onClick={() => { void migrate(); }}>{`Ranger ${items.length} titres`}</ActionButton>
            </div>}
        </ClientDialog>
    </div>;
}
/* eslint-enable react/jsx-no-bind */
