/* eslint-disable react/jsx-no-bind -- Actions are local to this page. */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApi } from 'hooks/useApi';
import Page from 'components/Page';

import ClientIcon from '../ClientIcon';
import { enterProfile, restart } from './profileSession';
import { dropToken, forgetProfile, markProfileChosen, profileTone, readProfiles, rememberProfile, type SavedProfile } from './profileStore';
import './profiles.scss';

type Form = { name: string; locked: boolean; note?: string };

const tokenHeader = (token: string) => ({ Authorization: `MediaBrowser Token="${token}"` });

function Avatar({ profile, basePath }: Readonly<{ profile: SavedProfile; basePath: string }>) {
    const source = profile.imageTag ? `${basePath}/Users/${profile.userId}/Images/Primary?tag=${profile.imageTag}&width=320&quality=90` : undefined;
    return <span className='client-profile-avatar' style={{ background: source ? undefined : profileTone(profile.userId) }}>
        {source ? <img src={source} alt='' /> : profile.name.slice(0, 1).toUpperCase()}
    </span>;
}

function refusal(status?: number) {
    if (status === 401) return 'Nom d’utilisateur ou mot de passe incorrect. Si ce compte demande une double authentification, déconnectez-vous puis utilisez la page de connexion.';
    if (status === 403) return 'Ce compte n’a pas le droit de se connecter ici.';
    return 'Le serveur est injoignable. Réessayez dans un instant.';
}

/** Who is watching: the people who have signed in on this browser, and nobody else. */
export default function ProfilePage() {
    const { api, user, __legacyApiClient__: legacy } = useApi();
    const navigate = useNavigate();
    const basePath = api?.basePath || '';
    const [profiles, setProfiles] = useState(() => readProfiles(basePath));
    const [managing, setManaging] = useState(false);
    const [form, setForm] = useState<Form>();
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const formElement = useRef<HTMLFormElement>(null);
    const formOpen = !!form;
    useEffect(() => {
        if (formOpen) formElement.current?.querySelector('input')?.focus();
    }, [formOpen]);

    /** An administrator's session is not kept, so it must not stay open behind the next person. */
    async function leaveCurrent() {
        if (!user?.Policy?.IsAdministrator || !api?.accessToken) return;
        await fetch(`${basePath}/Sessions/Logout`, { method: 'POST', headers: tokenHeader(api.accessToken) }).catch(() => undefined);
    }

    async function choose(profile: SavedProfile) {
        setMessage('');
        if (profile.userId === user?.Id) {
            markProfileChosen();
            navigate('/client', { replace: true });
            return;
        }
        if (!profile.token) {
            setForm({ name: profile.name, locked: true, note: 'Ce profil demande son mot de passe.' });
            return;
        }
        setBusy(true);
        try {
            const response = await fetch(`${basePath}/Users/Me`, { headers: tokenHeader(profile.token) });
            const owner = response.ok ? (await response.json() as { Id?: string }).Id : undefined;
            // A session that is not this person's never opens their profile.
            if (response.status === 401 || (response.ok && owner?.replace(/-/g, '').toLowerCase() !== profile.userId.replace(/-/g, '').toLowerCase())) {
                dropToken(basePath, profile.userId);
                setProfiles(readProfiles(basePath));
                setForm({ name: profile.name, locked: true, note: 'Cette session a expiré.' });
                return;
            }
            if (!response.ok) throw new Error(String(response.status));
            await leaveCurrent();
            enterProfile(legacy?.serverId() || user?.ServerId || '', profile.userId, profile.token);
        } catch {
            setMessage('Impossible de changer de profil pour le moment. Réessayez dans un instant.');
        } finally {
            setBusy(false);
        }
    }

    async function signIn(event: React.FormEvent) {
        event.preventDefault();
        if (!legacy || !form?.name.trim()) return;
        setBusy(true);
        setMessage('');
        try {
            await leaveCurrent();
            const result = await legacy.authenticateUserByName(form.name.trim(), password);
            const signedIn = result.User;
            rememberProfile(basePath, { userId: signedIn?.Id || '', name: signedIn?.Name || form.name, imageTag: signedIn?.PrimaryImageTag || undefined,
                token: signedIn?.Policy?.IsAdministrator ? undefined : result.AccessToken || undefined });
            restart();
        } catch (error) {
            setPassword('');
            setMessage(refusal((error as { status?: number }).status));
            setBusy(false);
        }
    }

    async function remove(profile: SavedProfile) {
        if (profile.token) await fetch(`${basePath}/Sessions/Logout`, { method: 'POST', headers: tokenHeader(profile.token) }).catch(() => undefined);
        forgetProfile(basePath, profile.userId);
        setProfiles(readProfiles(basePath));
    }

    const title = managing ? 'Gérer les profils' : 'Qui regarde ?';
    return <Page id='clientPage' title={title} className='client-page' isBackButtonEnabled={false}>
        <main className='client-profiles'>
            {form ? <form ref={formElement} className='client-profile-form' onSubmit={signIn}>
                <h1>{form.locked ? form.name : 'Ajouter un profil'}</h1>
                {form.note && <p>{form.note}</p>}
                {!form.locked && <label>Nom d’utilisateur<input autoComplete='username' value={form.name} disabled={busy} onChange={event => setForm({ ...form, name: event.target.value })} /></label>}
                <label>Mot de passe<input type='password' autoComplete='current-password' value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
                {message && <p role='alert' className='client-profile-error'>{message}</p>}
                <div>
                    <button type='submit' className='client-profile-primary' disabled={busy || !form.name.trim()}>Continuer</button>
                    <button type='button' disabled={busy} onClick={() => {
                        setForm(undefined);
                        setPassword('');
                        setMessage('');
                    }}>Annuler</button>
                </div>
            </form> : <>
                <h1>{title}</h1>
                {message && <p role='alert' className='client-profile-error'>{message}</p>}
                <ul>
                    {profiles.map(profile => {
                        const current = profile.userId === user?.Id;
                        if (managing) {
                            return <li key={profile.userId}>
                                <button type='button' className='client-profile-tile' disabled={current} aria-label={current ? `${profile.name}, profil actif` : `Retirer ${profile.name} de ce navigateur`} onClick={() => {
                                    void remove(profile);
                                }}>
                                    <Avatar profile={profile} basePath={basePath} />{!current && <span className='client-profile-remove'><ClientIcon name='close' /></span>}<strong>{profile.name}</strong>{current && <small>Profil actif</small>}
                                </button>
                            </li>;
                        }
                        return <li key={profile.userId}>
                            <button type='button' className='client-profile-tile' disabled={busy} aria-current={current ? 'true' : undefined} onClick={() => {
                                void choose(profile);
                            }}>
                                <Avatar profile={profile} basePath={basePath} /><strong>{profile.name}</strong>
                            </button>
                        </li>;
                    })}
                    {!managing && <li>
                        <button type='button' className='client-profile-tile' disabled={busy} onClick={() => setForm({ name: '', locked: false })}>
                            <span className='client-profile-avatar client-profile-add'><ClientIcon name='plus' /></span><strong>Ajouter un profil</strong>
                        </button>
                    </li>}
                </ul>
                <button type='button' className='client-profile-manage' disabled={busy} onClick={() => setManaging(!managing)}>{managing ? 'Terminé' : 'Gérer les profils'}</button>
            </>}
        </main>
    </Page>;
}
/* eslint-enable react/jsx-no-bind */
