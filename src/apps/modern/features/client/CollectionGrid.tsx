/* eslint-disable react/jsx-no-bind -- Card actions use the current media item. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import Artwork from './Artwork';
import ClientSkeleton from './ClientSkeleton';
import SharedCatalogArtwork from './SharedCatalogArtwork';
import { isExternal } from './seerr/model';
import GridLoadMore from './GridLoadMore';
import WatchedMarker, { watchedLabel } from './WatchedMarker';
import { filterFolderItems, folderTitleCount, type FolderImage, type orderedFolderItems } from './folders/model';
import { isWatchedCard, progressPercent } from './model';
import { ChoiceSelect, type Option } from './settings/controls';

export type CollectionCardOptions = {
    image: FolderImage; showWatched: boolean; prepare: (item: BaseItemDto) => void; release: () => void;
};

type Items = ReturnType<typeof orderedFolderItems>;
type GridProps = CollectionCardOptions & {
    items: Items; pending?: boolean; error?: boolean; retry?: () => void; empty: string; orderLabel?: string;
    actions?: (entry: Items[number], manualOrder: boolean) => ReactNode;
};
const pageSize = 24;
const types: Option<string>[] = [['', 'Tous les types'], ['movie', 'Films'], ['tv', 'Séries']];
const views: Option<string>[] = [['', 'Tous les statuts'], ['seen', 'Vus'], ['unseen', 'Non vus']];
const sorts: Option<string>[] = [['name', 'Titre (A à Z)'], ['year', 'Année de sortie']];

export default function CollectionGrid({ items, pending, error, retry, empty, orderLabel = 'Ordre du dossier', actions, ...card }: Readonly<GridProps>) {
    const [params, setParams] = useSearchParams();
    const type = params.get('type') || '';
    const viewed = params.get('watched') || '';
    const sort = params.get('order') || '';
    const filtered = useMemo(() => filterFolderItems(items, { type, viewed, sort }), [items, type, viewed, sort]);
    const [loaded, setLoaded] = useState({ key: '', pages: 1 });
    const key = JSON.stringify([type, viewed, sort]);
    const pages = loaded.key === key ? loaded.pages : 1;
    const load = useCallback(() => setLoaded(current => ({ key, pages: current.key === key ? current.pages + 1 : 2 })), [key]);
    function changeFilter(field: string, value: string) {
        const next = new URLSearchParams(params);
        if (value) next.set(field, value);
        else next.delete(field);
        setLoaded({ key: '', pages: 1 });
        setParams(next, { replace: true, state: location.state });
    }
    const location = useLocation();
    const manualOrder = !type && !viewed && !sort;
    if (pending) return <section className='client-library client-shelf-grid'><ClientSkeleton layout='grid' count={8} contained label='Chargement des titres…' /></section>;
    if (error) return <section className='client-library client-shelf-grid'><p role='alert'>Impossible de charger les titres. <button type='button' className='client-button' onClick={retry}>Réessayer</button></p></section>;
    if (!items.length) return <section className='client-library client-shelf-grid'><p>{empty}</p></section>;
    return <section className='client-library client-shelf-grid' aria-labelledby='client-shelf-grid-title'>
        <header className='client-shelf-grid-heading'><h2 id='client-shelf-grid-title'>Titres</h2>
            <div className='client-filter-options'>
                <ChoiceSelect label='Type de titre' value={type} options={types} onChange={value => changeFilter('type', value)} />
                <ChoiceSelect label='Statut de visionnage' value={viewed} options={views} onChange={value => changeFilter('watched', value)} />
                <ChoiceSelect label='Trier' value={sort} options={[['', orderLabel], ...sorts]} onChange={value => changeFilter('order', value)} />
                <span className='client-result-count' aria-live='polite'>{folderTitleCount(filtered.length)}</span>
            </div>
        </header>
        {filtered.length ? <div className='client-grid'>
            {filtered.slice(0, pages * pageSize).map(entry => <div className='client-shelf-item' key={entry.key}>
                <CollectionTile item={entry.item} {...card} />
                {actions?.(entry, manualOrder)}
            </div>)}
        </div> : <p>Aucun titre ne correspond aux filtres.</p>}
        {filtered.length > pages * pageSize && <GridLoadMore pages={pages} loading={false} failed={false} load={load} />}
    </section>;
}

function CollectionTile({ item, image, showWatched, prepare, release }: Readonly<{ item: BaseItemDto } & CollectionCardOptions>) {
    const location = useLocation();
    const followed = isExternal(item);
    const watched = isWatchedCard(item, showWatched);
    const progress = progressPercent(item);
    return <Link className='client-card client-shelf-poster' to={`/client?id=${item.Id}`} data-client-focus={item.Id}
        state={{ returnTo: location.pathname + location.search, returnState: location.state }}
        aria-label={[item.Name, followed && 'À demander', watched && watchedLabel].filter(Boolean).join(' · ')}
        onPointerEnter={() => prepare(item)} onPointerLeave={release} onFocus={() => prepare(item)} onBlur={release}>
        {followed ? <SharedCatalogArtwork item={item} backdrop={false} /> : <Artwork source={image(item)} />}
        {followed && <span className='client-external-badge'>À demander</span>}
        <span className='client-card-fallback'>{item.Name}</span>
        {watched && <WatchedMarker />}
        {progress > 0 && <span className='client-progress'><i style={{ width: `${progress}%` }} /></span>}
        <span className='client-shelf-reveal' aria-hidden='true'><strong>{item.Name}</strong><small>{[item.Type === 'Series' ? 'Série' : 'Film', item.ProductionYear].filter(Boolean).join(' · ')}</small></span>
    </Link>;
}

/* eslint-enable react/jsx-no-bind */
