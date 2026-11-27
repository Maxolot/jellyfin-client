/* eslint-disable react/jsx-no-bind -- Callbacks belong to the visible picker and its controls. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { createContext, type MouseEvent, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import ClientDialog from '../ClientDialog';
import ClientIcon from '../ClientIcon';
import { canManageCollections } from '../collections/access';
import { useFollowedMemberships } from '../collections/followed';
import { useClientCollections, useCollectionChanges } from '../collections/queries';
import { isExternal, type SeerrIdentity } from '../seerr/model';
import { useSharedCatalog } from '../sharedCatalog';
import { useTonightAction, useTonightOptions } from '../tonight/queries';
import { canEditFolder, canFile, folderItemId, followedMember, followedPath, type Folder } from './model';
import { useFolderChange, useFolders } from './queries';
import './folders.scss';
import { ActionButton } from '../ui';

type Picker = {
    folders: Folder[] | null;
    openPicker: (item: BaseItemDto, returnFocus?: HTMLElement | null) => void;
    quickSave: (item: BaseItemDto, returnFocus?: HTMLElement | null) => void;
    saving: boolean;
};

/** The default folder of the one-tap « + »; the plugin creates it on first use. */
export const DEFAULT_FOLDER = 'À voir plus tard';

/** Titles in my own folders, keyed as the plugin keys them, with the date they were filed. */
export function useFiled() {
    return useTonightOptions().data?.filed;
}

export function filedKey(item: BaseItemDto, member?: { type: string; id: number }) {
    return member ? `seerr-${member.type}-${member.id}` : folderItemId(item.Id || '');
}
const FolderPickerContext = createContext<Picker | null>(null);

export function useFolderPicker() {
    return useContext(FolderPickerContext);
}

export function FolderPickerProvider({ children }: Readonly<{ children: ReactNode }>) {
    const folders = useFolders();
    const { api, user } = useApi();
    const [selection, setSelection] = useState<{ item: BaseItemDto; scope: string } | null>(null);
    const focus = useRef<HTMLElement | null>(null);
    const scope = JSON.stringify([api?.basePath, user?.Id]);
    const selected = selection?.scope === scope && folders.data ? selection.item : null;
    const save = useTonightAction();
    const catalog = useSharedCatalog(true);
    const [notice, setNotice] = useState<{ item: BaseItemDto; text: string; failed?: boolean } | null>(null);
    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(null), 6000);
        return () => clearTimeout(timer);
    }, [notice]);
    const quickSave = (item: BaseItemDto, returnFocus?: HTMLElement | null) => {
        const member = followedMember(item, catalog.data);
        focus.current = returnFocus || null;
        const identity = member ? [member.type, member.id].join('/') : item.Id;
        save.mutate({ route: `/Later/${identity}`, data: {} }, {
            onSuccess: () => setNotice({ item, text: `Ajouté à « ${DEFAULT_FOLDER} »` }),
            onError: () => setNotice({ item, text: 'Le titre n’a pas pu être ajouté.', failed: true })
        });
    };
    const close = () => {
        setSelection(null);
        focus.current?.focus({ preventScroll: true });
        focus.current = null;
    };
    const openPicker = (item: BaseItemDto, returnFocus?: HTMLElement | null) => {
        focus.current = returnFocus || focus.current;
        setNotice(null);
        setSelection({ item, scope });
    };
    return <FolderPickerContext.Provider value={{ folders: folders.data ?? null, openPicker, quickSave, saving: save.isPending }}>
        {children}
        {notice && <div className='client-folder-toast' role={notice.failed ? 'alert' : 'status'}>
            <ClientIcon name={notice.failed ? 'close' : 'check'} /><span>{notice.text}</span>
            {!notice.failed && <button type='button' onClick={() => openPicker(notice.item)}>Choisir un autre dossier</button>}
        </div>}
        <ClientDialog className='client-folder-modal' label='Ranger dans un dossier' title='Ranger dans un dossier' subtitle={selected?.Name || undefined} controlled={{ open: !!selected, onClose: close }}>
            {selected && folders.data && <PickerChoices key={selected.Id} item={selected} folders={folders.data.filter(canEditFolder)} close={close} />}
        </ClientDialog>
    </FolderPickerContext.Provider>;
}

function PickerChoices({ item, folders, close }: Readonly<{ item: BaseItemDto; folders: Folder[]; close: () => void }>) {
    const { user } = useApi();
    const change = useFolderChange();
    const catalog = useSharedCatalog(isExternal(item));
    const member = followedMember(item, catalog.data);
    const [added, setAdded] = useState<string[]>([]);
    function addTo(folder: Folder) {
        const path = member ? followedPath(member.type, member.id) : `/Items/${item.Id}`;
        change.mutate({ method: 'PUT', path: `/${folder.id}${path}` }, {
            onSuccess: () => setAdded(current => [...current, folder.id])
        });
    }
    return <div className='client-folder-dialog'>
        <h3>Dossiers</h3>
        {folders.length ? <ul className='client-folder-choices'>{folders.map(folder => <li key={folder.id}>
            <ActionButton className='client-folder-choice' aria-label={added.includes(folder.id) ? `Ajouté à ${folder.name}` : `Ajouter à ${folder.name}`}
                disabled={change.isPending || added.includes(folder.id)} onClick={() => addTo(folder)} icon='folder'>
                <span>{folder.name}{folder.access === 'editor' && <small>Partagé avec moi</small>}</span>
                <ClientIcon name={added.includes(folder.id) ? 'check' : 'plus'} />
            </ActionButton>
        </li>)}</ul> : <p>Aucun dossier modifiable. <Link to='/client?view=mine&section=folders' onClick={close}>Gérer mes dossiers</Link></p>}
        {member && canManageCollections(user?.Policy) && <CollectionChoices member={member} />}
        {change.isError && <p role='alert'>Le changement n’a pas été enregistré. Réessayez.</p>}
        {!!added.length && <p role='status'>Ajouté à {folders.find(folder => folder.id === added.at(-1))?.name || 'un dossier'}.</p>}
    </div>;
}

function CollectionChoices({ member }: Readonly<{ member: SeerrIdentity }>) {
    const collections = useClientCollections(true, null);
    const [denied, setDenied] = useState(false);
    const change = useCollectionChanges(() => setDenied(true));
    const [added, setAdded] = useState<string[]>([]);
    if (denied) return null;
    const choices = collections.data || [];
    function add(collectionId: string) {
        change.mutate({ type: 'add-followed', collectionId, member }, {
            onSuccess: () => setAdded(current => [...current, collectionId])
        });
    }
    return <>
        <h3>Collections publiques</h3>
        {collections.isPending && <p role='status'>Chargement des collections…</p>}
        {collections.isError && <p role='alert'>Impossible de charger les collections.</p>}
        {collections.isSuccess && !choices.length && <p>Aucune collection publique.</p>}
        {!!choices.length && <ul className='client-folder-choices'>{choices.map(collection => collection.Id && <li key={collection.Id}>
            <ActionButton className='client-folder-choice'
                aria-label={added.includes(collection.Id) ? `Ajouté à la collection ${collection.Name}` : `Ajouter à la collection ${collection.Name}`}
                disabled={change.isPending || added.includes(collection.Id)} onClick={() => add(collection.Id!)} icon='collection'>
                <span>{collection.Name}</span>
                <ClientIcon name={added.includes(collection.Id) ? 'check' : 'plus'} />
            </ActionButton>
        </li>)}</ul>}
        {change.isError && <p role='alert'>Impossible d’ajouter le titre à la collection.</p>}
        {!!added.length && <p role='status'>Ajouté à la collection {choices.find(collection => collection.Id === added.at(-1))?.Name}.</p>}
    </>;
}

type ButtonProps = { item: BaseItemDto; fallback?: () => void; disabled?: boolean; tabIndex?: number; favorite?: boolean };

function listActionLook(item: BaseItemDto, available: boolean, filed: boolean, favorite: boolean): { label: string; icon: 'check' | 'plus' } {
    const name = item.Name || 'ce titre';
    if (available) return filed ? { label: `${name} est dans tes dossiers : choisir un dossier`, icon: 'check' } : { label: `Ajouter ${name} à « ${DEFAULT_FOLDER} »`, icon: 'plus' };
    return favorite ? { label: 'Retirer de ma liste', icon: 'check' } : { label: 'Ajouter à ma liste', icon: 'plus' };
}

/** « + »: one tap files the title in the default folder; once filed, the same button opens the folder choice. */
export function ListAction({ item, fallback, disabled, tabIndex, favorite = !!item.UserData?.IsFavorite }: Readonly<ButtonProps>) {
    const picker = useFolderPicker();
    const external = isExternal(item);
    const catalog = useSharedCatalog(external);
    const member = followedMember(item, catalog.data);
    const memberships = useFollowedMemberships(!!member);
    const filed = useFiled();
    const available = !!picker?.folders && (canFile(item) || (!!member && memberships.data === true));
    if (!available && !fallback) return null;
    const isFiled = available && !!filed && filedKey(item, member) in filed;
    const { label, icon } = listActionLook(item, available, isFiled, favorite && !!fallback);
    function activate(event: MouseEvent<HTMLButtonElement>) {
        event.stopPropagation();
        if (!available) fallback?.();
        else if (isFiled) picker.openPicker(item, event.currentTarget);
        else picker.quickSave(item, event.currentTarget);
    }
    return <ActionButton round aria-label={label} title={label} aria-haspopup={isFiled ? 'dialog' : undefined}
        data-folder-action={available ? '' : undefined} aria-pressed={available ? undefined : favorite} disabled={disabled || (available && picker.saving)} tabIndex={tabIndex} onClick={activate} icon={icon} />;
}

/* eslint-enable react/jsx-no-bind */
