import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import React from 'react';

import ActionLabel from './ActionLabel';
import ClientIcon from './ClientIcon';

import { useApi } from 'hooks/useApi';

import { resolveCatalogueArtwork } from './catalogArtwork';
import { useCatalogArtworkLookup } from './useCatalogArtwork';
import { catalogueItem, externalIdentity, type ExternalMedia, type MediaType } from './seerr/model';

export type SharedCatalogEntry = {
    type: MediaType;
    id: number;
    title: string;
    overview?: string;
    year?: number;
    posterPath?: string;
    backdropPath?: string;
    /** Account that added the title and when, absent from entries made before plugin 0.3.0. */
    addedBy?: string;
    addedAt?: string;
};

export function useSharedCatalog(enabled = true) {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['SharedCatalog', api?.basePath, user?.Id],
        enabled: enabled && !!api && !!user?.Id,
        retry: false,
        staleTime: 30000,
        queryFn: async ({ signal }) => {
            try {
                const response = await api!.axiosInstance.get<SharedCatalogEntry[]>(api!.basePath + '/SharedCatalog/Items', {
                    signal,
                    headers: { Authorization: `MediaBrowser Token="${api!.accessToken}"` }
                });
                return Array.isArray(response.data) ? response.data : null;
            } catch (error) {
                if (isAxiosError(error) && error.response?.status === 404) return null;
                throw error;
            }
        }
    });
}

export function sharedCatalogItems(entries: SharedCatalogEntry[], local: BaseItemDto[]) {
    return entries.map(entry => catalogueItem({
        id: entry.id,
        title: entry.title,
        overview: entry.overview,
        releaseDate: entry.year ? String(entry.year) : undefined,
        posterPath: entry.posterPath,
        backdropPath: entry.backdropPath
    }, entry.type, local));
}

export function FollowCatalogAction({ item, remote, menu = false, circle = false }: Readonly<{ item: BaseItemDto; remote?: ExternalMedia; menu?: boolean; circle?: boolean }>) {
    const { api, user } = useApi();
    const query = useSharedCatalog();
    const artwork = useCatalogArtworkLookup();
    const cache = useQueryClient();
    const identity = externalIdentity(item);
    const followed = query.data?.some(entry => entry.id === identity?.id && entry.type === identity?.type);
    const admin = user?.Policy?.IsAdministrator;
    const mutation = useMutation({
        mutationFn: async () => {
            if (!api || !identity || !item.Name) throw new Error('Missing catalog identity');
            const paths = followed ? undefined : await resolveCatalogueArtwork(identity, remote, artwork);
            await api.axiosInstance.request({
                url: `${api.basePath}/SharedCatalog/Items/${identity.type}/${identity.id}`,
                method: followed ? 'DELETE' : 'PUT',
                headers: { Authorization: `MediaBrowser Token="${api.accessToken}"` },
                data: followed ? undefined : {
                    title: item.Name.slice(0, 300),
                    overview: item.Overview?.slice(0, 6000),
                    year: item.ProductionYear || undefined,
                    ...paths
                }
            });
            await cache.invalidateQueries({ queryKey: ['SharedCatalog', api.basePath] });
        }
    });
    if (!query.data || !identity || !item.Name) return null;
    let label = 'Garder dans le catalogue';
    let icon: 'bookmark' | 'bookmarkOff' | 'check' = 'bookmark';
    if (followed) {
        label = admin ? 'Retirer du catalogue partagé' : 'Dans le catalogue partagé';
        icon = admin ? 'bookmarkOff' : 'check';
    }
    if (mutation.isPending) label = 'Enregistrement…';
    function follow() {
        mutation.mutate();
    }
    if (circle) {
        return <button type='button' className='client-button client-action-circle' aria-label={label} title={label} aria-pressed={followed}
            disabled={mutation.isPending || (followed && !admin)}
            // eslint-disable-next-line react/jsx-no-bind -- Action belongs to this button.
            onClick={follow}><ClientIcon name={icon} /></button>;
    }
    return <>
        <button type='button' className={menu ? undefined : 'client-button'} role={menu ? 'menuitem' : undefined}
            disabled={mutation.isPending || (followed && !admin)}
            // eslint-disable-next-line react/jsx-no-bind -- Action belongs to this button.
            onClick={follow}>
            <ActionLabel icon={icon}>{label}</ActionLabel>
        </button>
        {mutation.isError && <span role='alert'>Le catalogue n’a pas été mis à jour. Réessayez.</span>}
    </>;
}
