/* eslint-disable react/jsx-no-bind -- Controls operate on the current collection and its titles. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { type FormEvent, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import Artwork from '../Artwork';
import ClientDialog from '../ClientDialog';
import ClientIcon from '../ClientIcon';
import ClientSkeleton from '../ClientSkeleton';
import CollectionCard from '../CollectionCard';
import CollectionGrid, { type CollectionCardOptions } from '../CollectionGrid';
import CollectionHero from '../CollectionHero';
import type { PlayQueue } from '../mediaQueue';
import { useDebounced } from '../spotlight/useSpotlightData';
import { useClientCollections, useClientMedia } from '../useClientMedia';
import { canManageCollections } from './access';
import { useCollectionChanges, useCollectionContents } from './queries';
import './collections.scss';

type Surface = CollectionCardOptions & { full: boolean; playQueue: PlayQueue; queueBusy: boolean };
type Rights = { canManage: boolean; onForbidden: () => void };
const collectionsPath = '/client?view=collections';

export default function PublicCollections(surface: Readonly<Surface>) {
    const { api, user } = useApi();
    const [params, setParams] = useSearchParams();
    const id = params.get('collection');
    const [denied, setDenied] = useState('');
    const account = JSON.stringify([api?.basePath, user?.Id]);
    const rights = { canManage: canManageCollections(user?.Policy) && denied !== account, onForbidden: () => setDenied(account) };
    const collections = useClientCollections(true, null);
    const selected = id ? collections.data?.find(item => item.Id === id) : undefined;
    if (selected) return <CollectionDetail key={selected.Id} collection={selected} {...surface} {...rights} />;
    return <section className='client-collections'>
        <header className='client-library-heading client-collections-heading'>
            <h1>Collections publiques</h1>
            {!id && rights.canManage && <CreateCollection onForbidden={rights.onForbidden} onCreate={collection => setParams({ view: 'collections', collection })} />}
        </header>
        {collections.isPending && <ClientSkeleton layout='list' count={4} contained label='Chargement des collections…' />}
        {collections.isError && <LoadError message='Impossible de charger les collections.' retry={() => collections.refetch()} />}
        {collections.isSuccess && id && <p className='client-collections-note'>Cette collection est introuvable. <Link to={collectionsPath}>Voir les collections</Link></p>}
        {collections.isSuccess && !id && <CollectionList items={collections.data} image={surface.image} canManage={rights.canManage} />}
    </section>;
}

function CollectionList({ items, image, canManage }: Readonly<{ items: BaseItemDto[]; image: Surface['image']; canManage: boolean }>) {
    if (!items.length) return <p className='client-collections-note'>Aucune collection pour le moment.</p>;
    return <ul className='client-collection-grid'>{items.map(collection => collection.Id && <li key={collection.Id}>
        <CollectionCard collection={collection} image={image} canManage={canManage} />
    </li>)}</ul>;
}

function CreateCollection({ onCreate, onForbidden }: Readonly<{ onCreate: (id: string) => void; onForbidden: () => void }>) {
    const [open, setOpen] = useState(false);
    return <>
        <button type='button' className='client-button' aria-haspopup='dialog' onClick={() => setOpen(true)}><ClientIcon name='plus' />Créer une collection</button>
        <ClientDialog className='client-collection-modal' label='Créer une collection' title='Créer une collection' controlled={{ open, onClose: () => setOpen(false) }}>
            {close => open && <CollectionName onForbidden={onForbidden} onCreate={id => {
                close();
                onCreate(id);
            }} />}
        </ClientDialog>
    </>;
}

function CollectionName({ onCreate, onForbidden }: Readonly<{ onCreate: (id: string) => void; onForbidden: () => void }>) {
    const field = useId();
    const [name, setName] = useState('');
    const change = useCollectionChanges(onForbidden);
    const trimmed = name.trim();
    function create(event: FormEvent) {
        event.preventDefault();
        if (!trimmed || change.isPending) return;
        change.mutate({ type: 'create', name: trimmed }, { onSuccess: id => {
            if (id) onCreate(id);
        } });
    }
    return <form className='client-collection-form' onSubmit={create}>
        <label htmlFor={field}>Nom de la collection</label>
        <input id={field} value={name} required onChange={event => setName(event.target.value)} />
        <button type='submit' className='client-play' disabled={!trimmed || change.isPending}>Créer</button>
        {change.isError && <p role='alert'>Impossible de créer la collection. Réessayez.</p>}
    </form>;
}

function CollectionDetail({ collection, canManage, onForbidden, full, queueBusy, playQueue, ...card }: Readonly<{ collection: BaseItemDto } & Surface & Rights>) {
    const titles = useCollectionContents(collection.Id);
    const change = useCollectionChanges(onForbidden);
    const [adding, setAdding] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const items = titles.data?.items || [];
    const entries = items.flatMap(item => item.Id ? [{ item, itemId: item.Id, type: item.Type === 'Series' ? 'tv' as const : 'movie' as const, tmdbId: null }] : []);
    function remove(itemId: string) {
        change.mutate({ type: 'remove', collectionId: collection.Id!, itemId }, { onSuccess: () => trigger.current?.focus({ preventScroll: true }) });
    }
    const actions = canManage && titles.isSuccess && <button ref={trigger} type='button' className='client-button' aria-haspopup='dialog' onClick={() => setAdding(true)}><ClientIcon name='plus' />Ajouter des titres</button>;
    return <CollectionHero title={collection.Name || 'Collection'} items={items} count={titles.data?.items.length ?? collection.ChildCount ?? 0}
        metadata={canManage ? 'Collection publique' : 'Collection publique · Lecture seule'} backTo={collectionsPath} backLabel='Collections publiques'
        full={full} image={card.image} playQueue={playQueue} queueBusy={queueBusy} actions={actions}>
        <CollectionGrid {...card} items={entries} pending={titles.isPending} error={titles.isError} retry={() => titles.refetch()}
            orderLabel='Ordre de la collection' empty='Cette collection ne contient aucun titre.'
            actions={canManage ? ({ item, itemId }) => <div className='client-shelf-item-actions'>
                <button type='button' className='client-button' disabled={change.isPending} aria-label={`Retirer ${item.Name} de la collection`}
                    title='Retirer de la collection' onClick={() => remove(itemId)}><ClientIcon name='close' /></button>
            </div> : undefined} />
        {canManage && change.isError && <p role='alert' className='client-shelf-organize'>Impossible de retirer le titre. Réessayez.</p>}
        {canManage && <ClientDialog className='client-collection-modal' label='Ajouter des titres' title='Ajouter des titres' subtitle={collection.Name || undefined}
            controlled={{ open: adding, onClose: () => setAdding(false) }}>
            {adding && <AddCollectionTitles collectionId={collection.Id!} items={items} image={card.image} onForbidden={() => {
                setAdding(false);
                onForbidden();
            }} />}
        </ClientDialog>}
    </CollectionHero>;
}

function AddCollectionTitles({ collectionId, items, image, onForbidden }: Readonly<{ collectionId: string; items: BaseItemDto[]; image: Surface['image']; onForbidden: () => void }>) {
    const field = useId();
    const searchField = useRef<HTMLInputElement>(null);
    const [search, setSearch] = useState('');
    const [inserted, setInserted] = useState('');
    const term = search.trim();
    const query = useDebounced(term, 200);
    const media = useClientMedia(query ? 'collection-picker' : 'disabled', query, 0);
    const change = useCollectionChanges(onForbidden);
    const members = new Set(items.map(item => item.Id));
    const matches = (media.data?.items || []).filter(item => item.Id && !members.has(item.Id));
    const waiting = !!term && (term !== query || media.isPending);
    function add(item: BaseItemDto) {
        change.mutate({ type: 'add', collectionId, itemId: item.Id! }, {
            onSuccess: () => {
                setInserted(item.Name || '');
                searchField.current?.focus();
            }
        });
    }
    return <div className='client-collection-form'>
        <label htmlFor={field}>Rechercher dans la bibliothèque</label>
        <input ref={searchField} id={field} type='search' value={search} placeholder='Nom d’un film ou d’une série' onChange={event => setSearch(event.target.value)} />
        {waiting && <p role='status'>Recherche en cours…</p>}
        {!waiting && term && media.isError && <LoadError message='Recherche indisponible.' retry={() => media.refetch()} />}
        {!waiting && term && media.isSuccess && <TitleMatches items={matches} image={image} pending={change.isPending} add={add} />}
        {inserted && <p role='status'>« {inserted} » ajouté à la collection.</p>}
        {change.isError && <p role='alert'>Impossible d’ajouter le titre. Réessayez.</p>}
    </div>;
}

function TitleMatches({ items, image, pending, add }: Readonly<{ items: BaseItemDto[]; image: Surface['image']; pending: boolean; add: (item: BaseItemDto) => void }>) {
    if (!items.length) return <p>Aucun titre à ajouter pour cette recherche.</p>;
    return <ul className='client-collection-matches'>{items.map(item => <li key={item.Id}>
        <button type='button' disabled={pending} aria-label={`Ajouter ${item.Name} à la collection`} onClick={() => add(item)}>
            <span className='client-collection-thumb'><Artwork source={image(item)} /></span>
            <span><strong>{item.Name}</strong><small>{item.ProductionYear}</small></span>
            <ClientIcon name='plus' />
        </button>
    </li>)}</ul>;
}

function LoadError({ message, retry }: Readonly<{ message: string; retry: () => unknown }>) {
    return <p role='alert' className='client-collections-note'>{message} <button type='button' className='client-button' onClick={retry}>Réessayer</button></p>;
}
/* eslint-enable react/jsx-no-bind */
