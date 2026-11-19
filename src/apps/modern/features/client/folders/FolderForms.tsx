/* eslint-disable react/jsx-no-bind -- Forms use their local selection. */
import React, { type FormEvent, useId, useState } from 'react';

import { ChoiceSelect, type Option } from '../settings/controls';
import type { Folder, FolderShare } from './model';
import { useFolderChange, useFolderTargets } from './queries';

export function FolderNameForm({ folder, onSave }: Readonly<{ folder?: Folder; onSave: (created?: Folder) => void }>) {
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

type Grant = 'none' | 'viewer' | 'editor';
const grants: readonly Option<Grant>[] = [['none', 'Aucun accès'], ['viewer', 'Lecture seule'], ['editor', 'Modification']];

export function ShareForm({ folder, shares, onSave }: Readonly<{ folder: Folder; shares: FolderShare[]; onSave: () => void }>) {
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

export function DeleteFolder({ folder, onDelete }: Readonly<{ folder: Folder; onDelete: () => void }>) {
    const change = useFolderChange();
    return <div className='client-folder-dialog'>
        <p>Le dossier et ses partages seront supprimés. Les titres resteront dans ta bibliothèque.</p>
        <button type='button' className='client-button client-folder-delete' disabled={change.isPending}
            onClick={() => change.mutate({ method: 'DELETE', path: `/${folder.id}` }, { onSuccess: onDelete })}>Confirmer la suppression</button>
        {change.isError && <FolderError />}
    </div>;
}

export function FolderError() {
    return <p role='alert'>Le changement n’a pas été enregistré. Réessayez.</p>;
}

/* eslint-enable react/jsx-no-bind */
