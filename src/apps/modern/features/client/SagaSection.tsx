/* eslint-disable react/jsx-no-bind -- Each saga card activates its own entry. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import Artwork from './Artwork';
import { catalogueItem, isExternal, mediaLabel, type CatalogueItem, type ExternalMedia } from './seerr/model';
import { useSeerr } from './seerr/SeerrContext';

type Collection = { id: number; name: string; parts: ExternalMedia[] };
type NavigationState = { returnTo?: string, returnState?: NavigationState | null };

const collectionOf = (item?: BaseItemDto) => item?.ProviderIds?.TmdbCollection || item?.ProviderIds?.tmdbcollection || '';
// « Harry Potter - Saga » devient « Harry Potter ».
function sagaTitle(name: string) {
    const parts = name.split(/ [-–] /);
    return parts.length > 1 && /^(saga|collection)$/i.test(parts[parts.length - 1].trim()) ? parts.slice(0, -1).join(' - ') : name;
}
const releaseKey = (item: BaseItemDto) => item.PremiereDate || String(item.ProductionYear || 9999);

// Films de la bibliothèque, avec leur collection TMDb : repli quand Jellyseerr n'est pas connecté.
function useLocalMovies(enabled: boolean) {
    const { api, user } = useApi();
    return useQuery({ queryKey: ['Client', api?.basePath, user?.Id, 'SagaMovies'], enabled: enabled && !!api && !!user?.Id,
        staleTime: 300000, queryFn: async ({ signal }) => (await getLibraryApi(api!).getItems({ userId: user!.Id, recursive: true,
            includeItemTypes: [BaseItemKind.Movie], fields: [ItemFields.ProviderIds], imageTypeLimit: 1, enableUserData: true }, { signal })).data.Items || [] });
}

function useSaga(item: BaseItemDto) {
    const seerr = useSeerr();
    const id = collectionOf(item);
    const local = useLocalMovies(!!id);
    const remote = useQuery({ queryKey: [...seerr.root, 'Collection', id], enabled: !!id && seerr.connected, retry: false, staleTime: 3600000,
        queryFn: ({ signal }) => seerr.call<Collection>(`Api/collection/${id}?language=fr`, signal) });
    const movies = local.data || [];
    if (remote.data?.parts?.length) {
        const parts = remote.data.parts.slice().sort((a, b) => (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999'));
        return { name: remote.data.name, items: parts.map(part => catalogueItem({ ...part, mediaType: 'movie' }, 'movie', movies)) };
    }
    const owned = movies.filter(movie => id && collectionOf(movie) === id).sort((a, b) => releaseKey(a).localeCompare(releaseKey(b)));
    return { name: '', items: owned as CatalogueItem[] };
}

export default function SagaSection({ item, image }: Readonly<{ item: BaseItemDto; image: (item: BaseItemDto, backdrop?: boolean) => string }>) {
    const location = useLocation();
    const { name, items } = useSaga(item);
    const [active, setActive] = useState<string>();
    if (item.Type !== 'Movie' || items.length < 2) return null;
    const current = items.find(entry => entry.Id === item.Id)?.Id;
    const open = active || current || items[0].Id;
    const available = items.filter(entry => !isExternal(entry)).length;
    const title = sagaTitle(name || item.Name || '');
    return <section className='client-saga' aria-label={`La saga ${title}`}>
        <header><div><span className='client-saga-eyebrow'>LA SAGA</span><h2>{title}</h2><p className='client-saga-count'>{items.length} films · {available} disponible{available > 1 ? 's' : ''}</p></div><small className='client-saga-order'>Ordre de sortie</small></header>
        <div className='client-saga-strip' role='group' aria-label='Films dans l’ordre de sortie' onPointerLeave={() => setActive(undefined)}>{items.map((entry, index) => {
            const isCurrent = entry.Id === current;
            const status = isExternal(entry) ? mediaLabel(entry.Seerr?.mediaInfo) : 'Disponible';
            return <Link key={entry.Id} className={`client-saga-card${entry.Id === open ? ' active' : ''}`} to={`/client?id=${entry.Id}`} aria-current={isCurrent ? 'page' : undefined}
                state={{ returnTo: location.pathname + location.search, returnState: location.state as NavigationState | null }}
                aria-label={[`${index + 1}. ${entry.Name}`, entry.ProductionYear, status, isCurrent ? 'Film ouvert' : ''].filter(Boolean).join(' · ')}
                onPointerEnter={event => event.pointerType !== 'touch' && setActive(entry.Id)} onFocus={() => setActive(entry.Id)}>
                <Artwork className='client-saga-poster' source={image(entry)} />
                <Artwork className='client-saga-backdrop' source={image(entry, true)} />
                <span className='client-saga-shade' aria-hidden='true' />
                {isCurrent && <span className='client-saga-current'>Ce film</span>}
                <span className='client-saga-caption'><strong>{entry.Name}</strong><small>{[`${index + 1} / ${items.length}`, entry.ProductionYear].filter(Boolean).join(' · ')}</small></span>
                <span className={`client-saga-status${isExternal(entry) ? '' : ' available'}`}>{status}</span>
            </Link>;
        })}</div>
    </section>;
}
/* eslint-enable react/jsx-no-bind */
