/* eslint-disable react/jsx-no-bind -- Forms and actions use their local selection. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { type FormEvent, useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import Artwork from '../Artwork';
import ClientDialog from '../ClientDialog';
import ClientIcon from '../ClientIcon';
import { ChoiceSelect, type Option } from '../settings/controls';
import { useFolderPicker } from './FolderPicker';
import { canEditFolder, type Folder, type FolderDetail, type FolderShare, orderedFolderItems } from './model';
import { useFolderChange, useFolderDetail, useFolderTargets, useFolderTitles } from './queries';

type Image = (item: BaseItemDto) => string;
type Editor = 'rename' | 'share' | 'delete';

const accessLabels = { owner: 'Personnel', editor: 'Modification', viewer: 'Lecture seule' };

export default function FolderPanel({ image }: Readonly<{ image: Image }>) {
    const picker = useFolderPicker();
    const [selected, setSelected] = useState('');
    const [creating, setCreating] = useState(false);
    const folders = picker?.folders;
    if (!folders) return null;
    const folder = folders.find(entry => entry.id === selected);
    const own = folders.filter(entry => entry.access === 'owner');
    const shared = folders.filter(entry => entry.access !== 'owner');
    return <section className='client-folders' aria-label='Dossiers de Ma liste'>
        <header className='client-folders-header'>
            <h3>Mes dossiers</h3>
            <button type='button' className='client-button' aria-haspopup='dialog' onClick={() => setCreating(true)}>
                <ClientIcon name='plus' />Nouveau dossier
            </button>
            <ClientDialog className='client-folder-modal' label='Nouveau dossier' title='Nouveau dossier' controlled={{ open: creating, onClose: () => setCreating(false) }}>
                {close => creating && <FolderNameForm onSave={created => {
                    if (created) setSelected(created.id);
                    close();
                }} />}
            </ClientDialog>
        </header>
        <FolderTiles folders={own} selected={selected} select={setSelected} empty='Aucun dossier personnel.' />
        <h3 id='client-shared-folders'>Partagées avec moi</h3>
        <FolderTiles folders={shared} selected={selected} select={setSelected} empty='Aucun dossier partagé pour le moment.' />
        {folder && <FolderContents key={folder.id} summary={folder} image={image} onDelete={() => setSelected('')} />}
        <h3 className='client-folder-favorites-heading'>Favoris</h3>
    </section>;
}

function FolderTiles({ folders, selected, select, empty }: Readonly<{ folders: Folder[]; selected: string; select: (id: string) => void; empty: string }>) {
    if (!folders.length) return <p className='client-folder-empty'>{empty}</p>;
    return <ul className='client-folder-tiles'>{folders.map(folder => <li key={folder.id}>
        <button type='button' className='client-folder-tile' aria-expanded={selected === folder.id} aria-controls={selected === folder.id ? 'client-folder-content' : undefined}
            onClick={() => select(selected === folder.id ? '' : folder.id)}>
            <span className='client-folder-symbol'><ClientIcon name='folder' /></span>
            <span><strong>{folder.name}</strong><small>{accessLabels[folder.access]}</small></span>
            <ClientIcon name='next' />
        </button>
    </li>)}</ul>;
}

function FolderNameForm({ folder, onSave }: Readonly<{ folder?: Folder; onSave: (created?: Folder) => void }>) {
    const id = useId();
    const [name, setName] = useState(folder?.name || '');
    const change = useFolderChange();
    function submit(event: FormEvent) {
        event.preventDefault();
        if (!name.trim() || change.isPending) return;
        const data = { name: name.trim() };
        change.mutate(folder ? { method: 'PATCH', path: `/${folder.id}`, data } : { method: 'POST', path: '', data }, { onSuccess: onSave });
    }
    return <form className='client-folder-dialog' onSubmit={submit}>
        <label htmlFor={id}>Nom du dossier</label>
        <input id={id} value={name} maxLength={120} required onChange={event => setName(event.target.value)} />
        <button type='submit' className='client-play' disabled={!name.trim() || change.isPending}>{folder ? 'Enregistrer' : 'Créer le dossier'}</button>
        {change.isError && <FolderError />}
    </form>;
}

function FolderContents({ summary, image, onDelete }: Readonly<{ summary: Folder; image: Image; onDelete: () => void }>) {
    const detail = useFolderDetail(summary.id);
    const [editor, setEditor] = useState<Editor | null>(null);
    const data = detail.isError ? undefined : detail.data;
    const editable = canEditFolder(summary) && !!data && canEditFolder(data.folder);
    const owner = summary.access === 'owner' && data?.folder.access === 'owner';
    const activeEditor = (editor === 'rename' && editable) || owner ? editor : null;
    const titleCount = data?.items.length;
    const plural = titleCount === 1 ? 'titre' : 'titres';
    return <section id='client-folder-content' className='client-folder-content' aria-label={summary.name}>
        <header>
            <div><h4>{summary.name}</h4><p>{accessLabels[summary.access]}{titleCount !== undefined && ` · ${titleCount} ${plural}`}</p></div>
            {editable && <div className='client-folder-actions'>
                <button type='button' className='client-button' onClick={() => setEditor('rename')}>Renommer</button>
                {owner && <><button type='button' className='client-button' onClick={() => setEditor('share')}>Partager</button>
                    <button type='button' className='client-button' onClick={() => setEditor('delete')}>Supprimer le dossier</button></>}
            </div>}
        </header>
        {detail.isPending && <p role='status'>Chargement du dossier…</p>}
        {detail.isError && <p role='alert'>Impossible d’ouvrir le dossier. <button type='button' className='client-button' onClick={() => detail.refetch()}>Réessayer</button></p>}
        {data && !detail.isError && <FolderTitles detail={data} editable={editable} image={image} />}
        <ClientDialog className='client-folder-modal' label={summary.name} title={editorTitle(activeEditor)} subtitle={summary.name}
            controlled={{ open: !!activeEditor, onClose: () => setEditor(null) }}>
            {close => <>
                {activeEditor === 'rename' && <FolderNameForm folder={summary} onSave={close} />}
                {activeEditor === 'share' && data?.shares && <ShareForm folder={summary} shares={data.shares} onSave={close} />}
                {activeEditor === 'delete' && <DeleteFolder folder={summary} onDelete={() => {
                    close();
                    onDelete();
                }} />}
            </>}
        </ClientDialog>
    </section>;
}

function editorTitle(editor: Editor | null) {
    if (editor === 'rename') return 'Renommer le dossier';
    if (editor === 'share') return 'Partager le dossier';
    return 'Supprimer le dossier';
}

function FolderTitles({ detail, editable, image }: Readonly<{ detail: FolderDetail; editable: boolean; image: Image }>) {
    const location = useLocation();
    const titles = useFolderTitles(detail.items);
    const change = useFolderChange();
    if (!detail.items.length) return <p className='client-folder-empty'>Ce dossier ne contient encore aucun titre.</p>;
    if (titles.isPending) return <p role='status'>Chargement des titres…</p>;
    if (titles.isError) return <p role='alert'>Impossible de charger les titres. <button type='button' className='client-button' onClick={() => titles.refetch()}>Réessayer</button></p>;
    const items = orderedFolderItems(detail.items, titles.data);
    return <>
        {!items.length && <p className='client-folder-empty'>Aucun titre disponible dans ce dossier.</p>}
        <ul className='client-folder-titles'>{items.map(({ item, itemId }) => <li key={itemId}>
            <Link to={`/client?id=${item.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state }}>
                <span className='client-folder-poster'><Artwork source={image(item)} /></span>
                <span><strong>{item.Name}</strong><small>{[item.ProductionYear, item.Type === 'Series' ? 'Série' : 'Film'].filter(Boolean).join(' · ')}</small></span>
            </Link>
            {editable && <button type='button' className='client-button client-action-circle' aria-label={`Retirer ${item.Name} du dossier`} title='Retirer du dossier'
                disabled={change.isPending} onClick={() => change.mutate({ method: 'DELETE', path: `/${detail.folder.id}/Items/${itemId}` })}><ClientIcon name='close' /></button>}
        </li>)}</ul>
        {change.isError && <FolderError />}
    </>;
}

type Grant = 'none' | 'viewer' | 'editor';
const grants: readonly Option<Grant>[] = [['none', 'Aucun accès'], ['viewer', 'Lecture seule'], ['editor', 'Modification']];

function ShareForm({ folder, shares, onSave }: Readonly<{ folder: Folder; shares: FolderShare[]; onSave: () => void }>) {
    const targets = useFolderTargets();
    const change = useFolderChange();
    const [selection, setSelection] = useState<Record<string, Grant>>(() => Object.fromEntries(shares.map(share => [share.userId, share.canEdit ? 'editor' : 'viewer'])));
    if (targets.isPending) return <p role='status'>Chargement des comptes…</p>;
    if (targets.isError) return <p role='alert'>Impossible de charger les comptes. <button type='button' className='client-button' onClick={() => targets.refetch()}>Réessayer</button></p>;
    const accounts = [...targets.data, ...shares.filter(share => !targets.data.some(target => target.userId === share.userId))
        .map(share => ({ userId: share.userId, name: 'Compte indisponible' }))];
    const next = Object.entries(selection).flatMap(([userId, access]) => access === 'none' ? [] : [{ userId, canEdit: access === 'editor' }]);
    if (!accounts.length) return <p>Aucun compte disponible pour le partage.</p>;
    return <div className='client-folder-dialog'>
        <p>Choisis les comptes qui auront accès à ce dossier.</p>
        <ul className='client-folder-share-list'>{accounts.map(account => <li key={account.userId}>
            <strong>{account.name}</strong>
            <ChoiceSelect label={`Accès pour ${account.name}`} value={selection[account.userId] ?? 'none'} options={grants} disabled={change.isPending}
                onChange={access => setSelection(current => ({ ...current, [account.userId]: access }))} />
        </li>)}</ul>
        <button type='button' className='client-play' disabled={change.isPending || next.length > 50} onClick={() => change.mutate({
            method: 'PUT', path: `/${folder.id}/Shares`, data: { shares: next }
        }, { onSuccess: onSave })}>Enregistrer le partage</button>
        {next.length > 50 && <p role='status'>Un dossier peut être partagé avec 50 comptes au maximum.</p>}
        {change.isError && <FolderError />}
    </div>;
}

function DeleteFolder({ folder, onDelete }: Readonly<{ folder: Folder; onDelete: () => void }>) {
    const change = useFolderChange();
    return <div className='client-folder-dialog'>
        <p>Le dossier et ses partages seront supprimés. Les titres resteront dans ta bibliothèque.</p>
        <button type='button' className='client-button client-folder-delete' disabled={change.isPending}
            onClick={() => change.mutate({ method: 'DELETE', path: `/${folder.id}` }, { onSuccess: onDelete })}>Confirmer la suppression</button>
        {change.isError && <FolderError />}
    </div>;
}

function FolderError() {
    return <p role='alert'>Le changement n’a pas été enregistré. Réessayez.</p>;
}

/* eslint-enable react/jsx-no-bind */
