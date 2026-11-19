/* eslint-disable react/jsx-no-bind -- Callbacks belong to the visible picker and its controls. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { getUserDataApi } from '@jellyfin/sdk/lib/utils/api/user-data-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { createContext, type MouseEvent, type ReactNode, useContext, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import ClientDialog from '../ClientDialog';
import ClientIcon from '../ClientIcon';
import { clientRequest } from '../session';
import { canEditFolder, canFile, type Folder } from './model';
import { useFolderChange, useFolders } from './queries';
import './folders.scss';

type Picker = { folders: Folder[] | null; openPicker: (item: BaseItemDto, returnFocus?: HTMLElement | null) => void };
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
    const close = () => {
        setSelection(null);
        focus.current?.focus({ preventScroll: true });
        focus.current = null;
    };
    return <FolderPickerContext.Provider value={{ folders: folders.data ?? null, openPicker: (item, returnFocus) => {
        focus.current = returnFocus || null;
        setSelection({ item, scope });
    } }}>
        {children}
        <ClientDialog className='client-folder-modal' label='Ma liste' title='Ma liste' subtitle={selected?.Name || undefined} controlled={{ open: !!selected, onClose: close }}>
            {selected && folders.data && <PickerChoices key={selected.Id} item={selected} folders={folders.data.filter(canEditFolder)} close={close} />}
        </ClientDialog>
    </FolderPickerContext.Provider>;
}

function PickerChoices({ item, folders, close }: Readonly<{ item: BaseItemDto; folders: Folder[]; close: () => void }>) {
    const { api, user } = useApi();
    const cache = useQueryClient();
    const change = useFolderChange();
    const [added, setAdded] = useState<string[]>([]);
    const [savedFavorite, setSavedFavorite] = useState(!!item.UserData?.IsFavorite);
    const favorite = useMutation({
        networkMode: 'always',
        mutationFn: async () => {
            if (!api || !user?.Id || !item.Id) return;
            const data = getUserDataApi(api);
            const params = { userId: user.Id, itemId: item.Id };
            const result = await clientRequest(() => savedFavorite ? data.unmarkFavoriteItem(params) : data.markFavoriteItem(params));
            setSavedFavorite(result.data.IsFavorite ?? !savedFavorite);
            await cache.invalidateQueries({ queryKey: ['Client', api.basePath, user.Id] });
        }
    });
    function addTo(folder: Folder) {
        change.mutate({ method: 'PUT', path: `/${folder.id}/Items/${item.Id}` }, {
            onSuccess: () => setAdded(current => [...current, folder.id])
        });
    }
    return <div className='client-folder-dialog'>
        <button type='button' className='client-button client-folder-choice' aria-pressed={savedFavorite} disabled={favorite.isPending} onClick={() => favorite.mutate()}>
            <ClientIcon name={savedFavorite ? 'check' : 'plus'} />Favoris
        </button>
        <h3>Dossiers</h3>
        {folders.length ? <ul className='client-folder-choices'>{folders.map(folder => <li key={folder.id}>
            <button type='button' className='client-button client-folder-choice' aria-label={added.includes(folder.id) ? `Ajouté à ${folder.name}` : `Ajouter à ${folder.name}`}
                disabled={change.isPending || added.includes(folder.id)} onClick={() => addTo(folder)}>
                <ClientIcon name='folder' /><span>{folder.name}{folder.access === 'editor' && <small>Partagé avec moi</small>}</span>
                <ClientIcon name={added.includes(folder.id) ? 'check' : 'plus'} />
            </button>
        </li>)}</ul> : <p>Aucun dossier modifiable. <Link to='/client?view=mine' onClick={close}>Gérer mes dossiers</Link></p>}
        {(change.isError || favorite.isError) && <p role='alert'>Le changement n’a pas été enregistré. Réessayez.</p>}
        {!!added.length && <p role='status'>Ajouté à {folders.find(folder => folder.id === added.at(-1))?.name || 'un dossier'}.</p>}
    </div>;
}

type ButtonProps = { item: BaseItemDto; fallback?: () => void; disabled?: boolean; tabIndex?: number; favorite?: boolean };
export function ListAction({ item, fallback, disabled, tabIndex, favorite = !!item.UserData?.IsFavorite }: Readonly<ButtonProps>) {
    const picker = useFolderPicker();
    const available = !!picker?.folders && canFile(item);
    if (!available && !fallback) return null;
    const favoriteLabel = favorite ? 'Retirer de ma liste' : 'Ajouter à ma liste';
    const label = available ? `Choisir où ajouter ${item.Name || 'ce titre'}` : favoriteLabel;
    function activate(event: MouseEvent<HTMLButtonElement>) {
        event.stopPropagation();
        if (available) picker.openPicker(item, event.currentTarget);
        else fallback?.();
    }
    return <button type='button' className='client-button client-action-circle' aria-label={label} title={label} aria-haspopup={available ? 'dialog' : undefined}
        data-folder-action={available ? '' : undefined} aria-pressed={available ? undefined : favorite} disabled={disabled} tabIndex={tabIndex} onClick={activate}>
        <ClientIcon name={favorite && !!fallback ? 'check' : 'plus'} />
    </button>;
}

/* eslint-enable react/jsx-no-bind */
