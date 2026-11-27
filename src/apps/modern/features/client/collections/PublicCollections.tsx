/* eslint-disable react/jsx-no-bind -- Controls operate on the current collection and its titles. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import Artwork from '../Artwork';
import ClientDialog from '../ClientDialog';
import ClientIcon from '../ClientIcon';
import ClientSkeleton from '../ClientSkeleton';
import CollectionCard from '../CollectionCard';
import CollectionGrid, { type CollectionCardOptions } from '../CollectionGrid';
import CollectionHero from '../CollectionHero';
import { type FolderItem, followedMember } from '../folders/model';
import { isExternal, providerKey } from '../seerr/model';
import { sharedCatalogItems, useSharedCatalog } from '../sharedCatalog';
import SharedCatalogArtwork from '../SharedCatalogArtwork';
import { normalizeText } from '../spotlight/searchIndex';
import type { PlayQueue } from '../mediaQueue';
import { useDebounced } from '../spotlight/useSpotlightData';
import { useClientMedia } from '../useClientMedia';
import { canManageCollections } from './access';
import { useClientCollections, useCollectionChanges, useCollectionShelf } from './queries';
import './collections.scss';
import { ActionButton } from '../ui';
import { LABELS } from '../labels';

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
        <ActionButton aria-haspopup='dialog' onClick={() => setOpen(true)} icon='plus'>Créer une collection</ActionButton>
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
        <ActionButton type='submit' variant='primary' disabled={!trimmed || change.isPending}>Créer</ActionButton>
        {change.isError && <p role='alert'>Impossible de créer la collection. Réessayez.</p>}
    </form>;
}

function CollectionDetail({ collection, canManage, onForbidden, full, queueBusy, playQueue, ...card }: Readonly<{ collection: BaseItemDto } & Surface & Rights>) {
    const titles = useCollectionShelf(collection.Id);
    const change = useCollectionChanges(onForbidden);
    const { mutate: promote, isPending: promoting } = useCollectionChanges(onForbidden);
    const [adding, setAdding] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const lastPromotion = useRef('');
    const signature = (titles.followed || []).flatMap(entry => entry.itemId || []).join(',');
    useEffect(() => {
        if (!canManage || !signature || lastPromotion.current === signature) return;
        lastPromotion.current = signature;
        promote({ type: 'promote', collectionId: collection.Id! });
    }, [canManage, signature, collection.Id, promote]);

    function remove(entry: FolderItem) {
        const onSuccess = () => trigger.current?.focus({ preventScroll: true });
        const collectionId = collection.Id!;
        if (entry.followed && entry.tmdbId) {
            change.mutate({ type: 'remove-followed', collectionId, member: { type: entry.type, id: entry.tmdbId } }, { onSuccess });
        } else if (entry.itemId) {
            change.mutate({ type: 'remove', collectionId, itemId: entry.itemId }, { onSuccess });
        }
    }
    const actions = canManage && titles.isSuccess && <ActionButton ref={trigger} aria-haspopup='dialog' onClick={() => setAdding(true)} icon='plus'>Ajouter des titres</ActionButton>;
    return <CollectionHero title={collection.Name || 'Collection'} items={titles.items} count={titles.count ?? collection.ChildCount ?? 0}
        metadata={canManage ? 'Collection publique' : 'Collection publique · Lecture seule'} backTo={collectionsPath} backLabel='Collections publiques'
        full={full} image={card.image} playQueue={playQueue} queueBusy={queueBusy} actions={actions}>
        <CollectionGrid {...card} items={titles.entries} pending={titles.isPending} error={titles.isError} retry={() => titles.refetch()}
            orderLabel='Ordre de la collection' empty='Cette collection ne contient aucun titre.'
            actions={canManage ? entry => <div className='client-shelf-item-actions'>
                <ActionButton disabled={change.isPending || promoting} aria-label={`Retirer ${entry.item.Name} de la collection`}
                    title='Retirer de la collection' onClick={() => remove(entry)} icon='close'></ActionButton>
            </div> : undefined} />
        {canManage && change.isError && <p role='alert' className='client-shelf-organize'>Impossible de retirer le titre. Réessayez.</p>}
        {canManage && <ClientDialog className='client-collection-modal' label='Ajouter des titres' title='Ajouter des titres' subtitle={collection.Name || undefined}
            controlled={{ open: adding, onClose: () => setAdding(false) }}>
            {adding && <AddCollectionTitles collectionId={collection.Id!} items={titles.items} followed={titles.supported} image={card.image} onForbidden={() => {
                setAdding(false);
                onForbidden();
            }} />}
        </ClientDialog>}
    </CollectionHero>;
}

function AddCollectionTitles({ collectionId, items, followed, image, onForbidden }: Readonly<{ collectionId: string; items: BaseItemDto[]; followed: boolean; image: Surface['image']; onForbidden: () => void }>) {
    const field = useId();
    const searchField = useRef<HTMLInputElement>(null);
    const [search, setSearch] = useState('');
    const [inserted, setInserted] = useState('');
    const term = search.trim();
    const query = useDebounced(term, 200);
    const media = useClientMedia(query ? 'collection-picker' : 'disabled', query, 0);
    const change = useCollectionChanges(onForbidden);
    const catalog = useSharedCatalog(followed && !!query);
    const members = new Set(items.map(item => item.Id));
    const memberProviders = new Set(items.map(providerKey).filter(Boolean));
    const local = (media.data?.items || []).filter(item => item.Id && !members.has(item.Id));
    const providers = new Set([...memberProviders, ...local.map(providerKey)]);
    const external = followed && query ? sharedCatalogItems((catalog.data || [])
        .filter(entry => normalizeText(entry.title).includes(normalizeText(query))).slice(0, 20), [])
        .filter(item => !providers.has(providerKey(item))) : [];
    const matches = [...local, ...external];
    const waiting = !!term && (term !== query || media.isPending);
    function add(item: BaseItemDto) {
        const onSuccess = () => {
            setInserted(item.Name || '');
            searchField.current?.focus();
        };
        const member = followedMember(item, catalog.data);
        if (member) change.mutate({ type: 'add-followed', collectionId, member }, { onSuccess });
        else if (!isExternal(item)) change.mutate({ type: 'add', collectionId, itemId: item.Id! }, { onSuccess });
    }
    return <div className='client-collection-form'>
        <label htmlFor={field}>{followed ? 'Rechercher dans la bibliothèque et le catalogue partagé' : 'Rechercher dans la bibliothèque'}</label>
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
            <span className='client-collection-thumb'>{isExternal(item) ? <SharedCatalogArtwork item={item} backdrop={false} /> : <Artwork source={image(item)} />}</span>
            <span><strong>{item.Name}</strong><small>{[item.ProductionYear, isExternal(item) && 'À demander'].filter(Boolean).join(' · ')}</small></span>
            <ClientIcon name='plus' />
        </button>
    </li>)}</ul>;
}

function LoadError({ message, retry }: Readonly<{ message: string; retry: () => unknown }>) {
    return <p role='alert' className='client-collections-note'>{message} <ActionButton onClick={retry}>{LABELS.retry}</ActionButton></p>;
}
/* eslint-enable react/jsx-no-bind */
