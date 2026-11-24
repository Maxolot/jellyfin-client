/* eslint-disable react/jsx-no-bind -- Form handlers are local to each account. */
import type { UserDto, UserPolicy } from '@jellyfin/sdk/lib/generated-client';
import React, { useEffect, useId, useRef, useState } from 'react';

import { useApi } from 'hooks/useApi';

import { SaveNote, Select, SettingCard, StatusBadge, TextField, Toggle } from '../settings/controls';
import { serverAdminUrl } from '../session/ServerInterfacePage';
import { disableBlocker, plural, policyChanges, relativeTime } from './model';
import { useCreateUser, useCurrentUserId, useResetPassword, useSavePolicy, useUsers, useVirtualFolders } from './useAdmin';
import './admin.scss';

const BITRATES = [
    [0, 'Sans limite'], [40000000, '40 Mb/s'], [20000000, '20 Mb/s'], [10000000, '10 Mb/s'], [8000000, '8 Mb/s'], [4000000, '4 Mb/s'], [2000000, '2 Mb/s']
] as const;

function Avatar({ user }: Readonly<{ user: UserDto }>) {
    const { api } = useApi();
    if (user.PrimaryImageTag && api) return <img className='client-admin-initial' src={`${api.basePath}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}&maxWidth=80&quality=80`} alt='' />;
    return <span className='client-admin-initial' aria-hidden='true'>{(user.Name || '?').slice(0, 1).toUpperCase()}</span>;
}

function Libraries({ policy, onChange }: Readonly<{ policy: UserPolicy; onChange: (next: Partial<UserPolicy>) => void }>) {
    const folders = useVirtualFolders();
    const enabled = policy.EnabledFolders || [];
    return <>
        <Toggle label='Toutes les bibliothèques' hint='Y compris celles ajoutées plus tard.' checked={!!policy.EnableAllFolders} onChange={value => onChange({ EnableAllFolders: value })} />
        {!policy.EnableAllFolders && <fieldset className='client-admin-checks'>
            <legend>Bibliothèques accessibles</legend>
            {(folders.data || []).map(folder => folder.ItemId && <label key={folder.ItemId}>
                <input type='checkbox' checked={enabled.includes(folder.ItemId)} onChange={event => onChange({
                    EnabledFolders: event.target.checked ? [...enabled, folder.ItemId!] : enabled.filter(id => id !== folder.ItemId)
                })} />
                <span>{folder.Name}</span>
            </label>)}
            {folders.isPending && <small>Chargement…</small>}
        </fieldset>}
    </>;
}

function Password({ user }: Readonly<{ user: UserDto }>) {
    const reset = useResetPassword();
    const [password, setPassword] = useState('');
    return <div className='client-admin-password'>
        <TextField label='Nouveau mot de passe' hint='Communiquez-le à la personne : elle pourra le changer dans son compte.' type='password' autoComplete='new-password' value={password} onChange={setPassword} />
        <div className='client-settings-actions'>
            <button type='button' className='client-settings-button' disabled={!password || reset.isPending} onClick={() => reset.mutate({ userId: user.Id!, password }, { onSuccess: () => setPassword('') })}>Changer le mot de passe</button>
            <SaveNote state={reset} error='Le mot de passe n’a pas été changé.' />
        </div>
    </div>;
}

function Editor({ user, users }: Readonly<{ user: UserDto; users: UserDto[] }>) {
    const start = user.Policy!;
    const [policy, setPolicy] = useState<UserPolicy>(start);
    const save = useSavePolicy();
    const currentUserId = useCurrentUserId();
    const previous = useRef(start);
    useEffect(() => {
        // A fresh copy from the server replaces the form only while the form holds no unsaved change.
        const before = previous.current;
        previous.current = start;
        setPolicy(form => (Object.keys(policyChanges(before, form)).length ? form : start));
    }, [start]);
    const changes = policyChanges(start, policy);
    const dirty = Object.keys(changes).length > 0;
    const blocker = disableBlocker(user, currentUserId, users);
    const set = (next: Partial<UserPolicy>) => setPolicy(form => ({ ...form, ...next }));
    return <div className='client-admin-editor'>
        <Toggle label='Compte actif' hint={blocker && !policy.IsDisabled ? blocker : 'Un compte désactivé ne peut plus se connecter. Rien n’est supprimé.'}
            checked={!policy.IsDisabled} disabled={!!blocker && !policy.IsDisabled} onChange={value => set({ IsDisabled: !value })} />
        <Toggle label='Accès hors du réseau local' checked={!!policy.EnableRemoteAccess} onChange={value => set({ EnableRemoteAccess: value })} />
        <Toggle label='Téléchargements' hint='Enregistrer des titres pour les regarder hors ligne.' checked={!!policy.EnableContentDownloading} onChange={value => set({ EnableContentDownloading: value })} />
        <Toggle label='Gestion des collections' hint='Créer et modifier les collections publiques.' checked={!!policy.EnableCollectionManagement} onChange={value => set({ EnableCollectionManagement: value })} />
        <Toggle label='Gestion des sous-titres' hint='Chercher et ajouter des sous-titres.' checked={!!policy.EnableSubtitleManagement} onChange={value => set({ EnableSubtitleManagement: value })} />
        <Toggle label='Transcodage vidéo' hint='Sans lui, seuls les fichiers lisibles tels quels par l’appareil passent.' checked={!!policy.EnableVideoPlaybackTranscoding} onChange={value => set({ EnableVideoPlaybackTranscoding: value })} />
        <Toggle label='Suppression de médias' hint='Supprimer des fichiers du serveur.' checked={!!policy.EnableContentDeletion} onChange={value => set({ EnableContentDeletion: value })} />
        <Select label='Débit maximal hors du réseau local' value={policy.RemoteClientBitrateLimit || 0} options={BITRATES} onChange={value => set({ RemoteClientBitrateLimit: value })} />
        <Libraries policy={policy} onChange={set} />
        <div className='client-settings-actions'>
            <button type='button' className='client-settings-button client-settings-button-primary' disabled={!dirty || save.isPending} onClick={() => save.mutate({ userId: user.Id!, changes })}>Enregistrer</button>
            {dirty && <button type='button' className='client-settings-button' onClick={() => setPolicy(start)}>Annuler</button>}
            <SaveNote state={save} error='Les droits n’ont pas été enregistrés. Réessayez.' />
        </div>
        <Password user={user} />
        <p className='client-setting-note'>Administrateurs, contrôle parental, horaires et appareils : <a href={serverAdminUrl(`dashboard/users/${user.Id}/profile`)}>réglages avancés de ce compte</a>.</p>
    </div>;
}

function Account({ user, users, open, toggle }: Readonly<{ user: UserDto; users: UserDto[]; open: boolean; toggle: () => void }>) {
    const id = useId();
    const policy = user.Policy;
    return <li className={`client-admin-account${open ? ' is-open' : ''}`}>
        <button type='button' className='client-admin-account-head' aria-expanded={open} aria-controls={id} onClick={toggle}>
            <Avatar user={user} />
            <span><strong>{user.Name}</strong><small>{user.LastActivityDate ? `Actif ${relativeTime(user.LastActivityDate)}` : 'Jamais connecté'}</small></span>
            <span className='client-admin-badges'>
                {policy?.IsAdministrator && <StatusBadge tone='ok'>Administrateur</StatusBadge>}
                {policy?.IsDisabled && <StatusBadge tone='error'>Désactivé</StatusBadge>}
                {policy?.IsHidden && <StatusBadge tone='off'>Masqué</StatusBadge>}
            </span>
            <svg aria-hidden='true' viewBox='0 0 24 24'><path d='m6 9 6 6 6-6' /></svg>
        </button>
        <div id={id} hidden={!open}>{open && <Editor user={user} users={users} />}</div>
    </li>;
}

function Create({ onCreated }: Readonly<{ onCreated: (id: string) => void }>) {
    const create = useCreateUser();
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    return <SettingCard title='Nouveau compte' description='Le compte reçoit les droits par défaut du serveur : vérifiez-les ensuite dans sa fiche.'>
        <TextField label='Nom' autoComplete='off' value={name} maxLength={64} onChange={setName} />
        <TextField label='Mot de passe' type='password' autoComplete='new-password' value={password} onChange={setPassword} />
        <div className='client-settings-actions'>
            <button type='button' className='client-settings-button client-settings-button-primary' disabled={!name.trim() || create.isPending}
                onClick={() => create.mutate({ name, password }, { onSuccess: user => {
                    setName('');
                    setPassword('');
                    if (user.Id) onCreated(user.Id);
                } })}>Créer le compte</button>
            <SaveNote state={create} error='Le compte n’a pas été créé. Ce nom est peut-être déjà pris.' />
        </div>
    </SettingCard>;
}

/** Administration, accounts: who may sign in and what each account may do. */
export default function AdminUsers() {
    const { user } = useApi();
    const users = useUsers();
    const [open, setOpen] = useState<string>();
    if (!user?.Policy?.IsAdministrator) return null;
    return <div className='client-admin'>
        <SettingCard title='Comptes' description={users.data && `${plural(users.data.length, 'compte')} sur ce serveur.`}>
            {users.isError && <p className='client-setting-note is-error' role='alert'>Les comptes n’ont pas pu être lus.</p>}
            {users.isPending && <p className='client-setting-note'>Chargement…</p>}
            <ul className='client-admin-list'>{(users.data || []).map(entry => <Account key={entry.Id} user={entry} users={users.data!} open={open === entry.Id} toggle={() => setOpen(open === entry.Id ? undefined : entry.Id!)} />)}</ul>
        </SettingCard>
        <Create onCreated={setOpen} />
    </div>;
}
/* eslint-enable react/jsx-no-bind */
