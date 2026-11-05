/* eslint-disable react/jsx-no-bind -- Actions are local to this page. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { ApiClient } from 'jellyfin-apiclient';

import { appHost } from 'components/apphost';
import { AppFeature } from 'constants/appFeature';
import { useApi } from 'hooks/useApi';
import { useWebConfig } from 'hooks/useWebConfig';

import SessionPage from '../session/SessionPage';
import { useLoginInfo } from '../session/useLoginInfo';

import ClientIcon from '../ClientIcon';
import AvatarPicker from './AvatarPicker';
import { saveAvatar, type GalleryAvatar } from './avatars';
import { enterProfile, restart } from './profileSession';
import { dropToken, forgetProfile, markProfileChosen, profileTone, readProfiles, rememberProfile, type SavedProfile } from './profileStore';
import QuickConnectPanel from './QuickConnectPanel';

type Form = { name: string; locked: boolean; note?: string };
/** Before anyone is signed in, the same page works directly with the chosen server. */
type SignedOut = { client: ApiClient; target: string };

type SignedIn = { User?: { Id?: string; Name?: string | null; PrimaryImageTag?: string | null; Policy?: { IsAdministrator?: boolean } | null }; AccessToken?: string | null };

const tokenHeader = (token: string) => ({ Authorization: `MediaBrowser Token="${token}"` });

function Avatar({ profile, basePath }: Readonly<{ profile: SavedProfile; basePath: string }>) {
    const source = profile.imageTag ? `${basePath}/Users/${profile.userId}/Images/Primary?tag=${profile.imageTag}&width=320&quality=90` : undefined;
    return <span className='client-profile-avatar' style={{ background: source ? undefined : profileTone(profile.userId) }}>
        {source ? <img src={source} alt='' /> : profile.name.slice(0, 1).toUpperCase()}
    </span>;
}

function refusal(status?: number) {
    if (status === 401) return 'Nom d’utilisateur ou mot de passe incorrect. Si ce compte demande une double authentification, utilisez Quick Connect.';
    if (status === 403) return 'Ce compte n’a pas le droit de se connecter ici.';
    return 'Le serveur est injoignable. Réessayez dans un instant.';
}

/** Who is watching: the people who have signed in on this browser, and nobody else. */
// eslint-disable-next-line sonarjs/cognitive-complexity -- One page, several short steps: people, signing in, Quick Connect, pictures.
export default function ProfilePage({ revision, signedOut }: Readonly<{ revision: number; signedOut?: SignedOut }>) {
    const context = useApi();
    const legacy = signedOut?.client || context.__legacyApiClient__;
    const api = context.api;
    const user = signedOut ? undefined : context.user;
    const { clientAvatars } = useWebConfig();
    const navigate = useNavigate();
    const basePath = signedOut?.client.serverAddress() || api?.basePath || '';
    const [quickAvailable, setQuickAvailable] = useState(false);
    const [profiles, setProfiles] = useState(() => readProfiles(basePath));
    // On a direct load the connection arrives after the first render, and the current person is only saved then.
    useEffect(() => {
        setProfiles(readProfiles(basePath));
    }, [basePath, revision]);
    const [managing, setManaging] = useState(false);
    const [form, setForm] = useState<Form>();
    const [quick, setQuick] = useState(false);
    const [picking, setPicking] = useState<SavedProfile>();
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const formElement = useRef<HTMLFormElement>(null);
    const formOpen = !!form && !quick;
    useEffect(() => {
        if (!legacy) return;
        legacy.getJSON(legacy.getUrl('QuickConnect/Enabled')).then(enabled => setQuickAvailable(enabled === true)).catch(() => setQuickAvailable(false));
    }, [legacy]);
    const login = useLoginInfo(signedOut?.client);
    const publicUsers = login?.publicUsers.filter(entry => !profiles.some(profile => profile.userId === entry.userId)) || [];
    const hasNobody = !!login && !publicUsers.length && !profiles.length;
    useEffect(() => {
        // Nobody to pick from: the form is the page.
        if (hasNobody) setForm(current => current || { name: '', locked: false });
    }, [hasNobody]);
    useEffect(() => {
        if (formOpen) formElement.current?.querySelector('input')?.focus();
    }, [formOpen]);

    /** An administrator's session is not kept, so it must not stay open behind the next person. */
    const closing = useRef<string>();
    closing.current = user?.Policy?.IsAdministrator ? api?.accessToken : undefined;
    const closeAdministrator = useCallback(async (token: string | undefined) => {
        if (token) await fetch(`${basePath}/Sessions/Logout`, { method: 'POST', headers: tokenHeader(token) }).catch(() => undefined);
    }, [basePath]);

    /** The session only changes once the new person is signed in, so a refused attempt costs nothing. */
    const welcome = useCallback(async (result: SignedIn, leaving: string | undefined) => {
        const signedIn = result.User;
        rememberProfile(basePath, { userId: signedIn?.Id || '', name: signedIn?.Name || '', imageTag: signedIn?.PrimaryImageTag || undefined,
            token: signedIn?.Policy?.IsAdministrator ? undefined : result.AccessToken || undefined });
        await closeAdministrator(leaving === result.AccessToken ? undefined : leaving);
        restart(signedOut?.target);
    }, [basePath, closeAdministrator, signedOut?.target]);

    const quickDone = useCallback((result: SignedIn) => {
        void welcome(result, closingAtStart.current);
    }, [welcome]);
    const closingAtStart = useRef<string>();

    async function choose(profile: SavedProfile) {
        setMessage('');
        if (profile.userId === user?.Id) {
            markProfileChosen();
            navigate('/client', { replace: true });
            return;
        }
        if (!profile.token) {
            if (login?.passwordless.has(profile.userId) && legacy) {
                setBusy(true);
                try {
                    await welcome(await legacy.authenticateUserByName(profile.name, ''), undefined);
                } catch (error) {
                    setMessage(refusal((error as { status?: number }).status));
                    setBusy(false);
                }
                return;
            }
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
            await closeAdministrator(closing.current);
            enterProfile(legacy?.serverId() || user?.ServerId || '', profile.userId, profile.token, signedOut?.target);
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
        const leaving = closing.current;
        try {
            await welcome(await legacy.authenticateUserByName(form.name.trim(), password), leaving);
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

    const tokenOf = (profile: SavedProfile) => profile.userId === user?.Id ? api?.accessToken : profile.token;

    async function pick(avatar: GalleryAvatar) {
        const token = picking && tokenOf(picking);
        if (!picking || !token) return;
        setBusy(true);
        setMessage('');
        try {
            const imageTag = await saveAvatar(basePath, picking.userId, token, avatar);
            rememberProfile(basePath, { ...picking, imageTag });
            setProfiles(readProfiles(basePath));
            // The active profile also shows its picture in the navigation, so everything restarts from the server.
            if (picking.userId === user?.Id) {
                window.location.reload();
                return;
            }
            setPicking(undefined);
        } catch {
            setMessage('Impossible d’enregistrer cette photo. Réessayez dans un instant.');
        } finally {
            setBusy(false);
        }
    }

    function closeForm() {
        setForm(undefined);
        setQuick(false);
        setPassword('');
        setMessage('');
    }

    function renderManaged(profile: SavedProfile) {
        const current = profile.userId === user?.Id;
        const editable = !!clientAvatars && !!tokenOf(profile);
        return <li key={profile.userId} className='client-profile-managed'>
            <button type='button' className='client-profile-tile' disabled={!editable} aria-label={editable ? `Changer la photo de ${profile.name}` : profile.name} onClick={() => setPicking(profile)}>
                <Avatar profile={profile} basePath={basePath} />
                {editable && <span className='client-profile-edit'><ClientIcon name='edit' /></span>}
                <strong>{profile.name}</strong>{current && <small>Profil actif</small>}
            </button>
            {!current && <button type='button' className='client-profile-remove' aria-label={`Retirer ${profile.name} de ce navigateur`} onClick={() => {
                void remove(profile);
            }}><ClientIcon name='close' /></button>}
        </li>;
    }

    const tiles = managing ? profiles : [...profiles, ...publicUsers];
    const formTitle = signedOut ? 'Connexion' : 'Ajouter un profil';
    const title = managing ? 'Gérer les profils' : 'Qui regarde ?';
    let content;
    if (picking && clientAvatars) {
        content = <AvatarPicker manifest={clientAvatars} name={picking.name} busy={busy} problem={message} choose={avatar => {
            void pick(avatar);
        }} cancel={() => {
            setPicking(undefined);
            setMessage('');
        }} />;
    } else if (quick && legacy) {
        content = <QuickConnectPanel legacy={legacy} done={quickDone} cancel={() => setQuick(false)} />;
    } else if (form) {
        content = <form ref={formElement} className='client-profile-form' onSubmit={signIn}>
            <h1>{form.locked ? form.name : formTitle}</h1>
            {form.note && <p>{form.note}</p>}
            {!form.locked && <label>Nom d’utilisateur<input autoComplete='username' value={form.name} disabled={busy} onChange={event => setForm({ ...form, name: event.target.value })} /></label>}
            <label>Mot de passe<input type='password' autoComplete='current-password' value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
            {message && <p role='alert' className='client-profile-error'>{message}</p>}
            <div>
                <button type='submit' className='client-profile-primary' disabled={busy || !form.name.trim()}>{signedOut ? 'Se connecter' : 'Continuer'}</button>
                {!!tiles.length && <button type='button' disabled={busy} onClick={closeForm}>Annuler</button>}
            </div>
            {quickAvailable && <button type='button' className='client-profile-quick' disabled={busy} onClick={() => {
                closingAtStart.current = closing.current;
                setMessage('');
                setQuick(true);
            }}>Utiliser Quick Connect</button>}
            {signedOut && <Link className='client-session-link' to='/forgotpassword'>Mot de passe oublié</Link>}
            {signedOut && appHost.supports(AppFeature.MultiServer) && <Link className='client-session-link' to='/selectserver'>Changer de serveur</Link>}
        </form>;
    } else {
        content = <>
            <h1>{title}</h1>
            {message && <p role='alert' className='client-profile-error'>{message}</p>}
            <ul>
                {tiles.map(profile => managing ? renderManaged(profile) : <li key={profile.userId}>
                    <button type='button' className='client-profile-tile' disabled={busy} aria-current={profile.userId === user?.Id ? 'true' : undefined} onClick={() => {
                        void choose(profile);
                    }}>
                        <Avatar profile={profile} basePath={basePath} /><strong>{profile.name}</strong>
                    </button>
                </li>)}
                {!managing && <li>
                    <button type='button' className='client-profile-tile' disabled={busy} onClick={() => setForm({ name: '', locked: false })}>
                        <span className='client-profile-avatar client-profile-add'><ClientIcon name='plus' /></span><strong>{signedOut ? 'Autre compte' : 'Ajouter un profil'}</strong>
                    </button>
                </li>}
            </ul>
            {!!profiles.length && <button type='button' className='client-profile-manage' disabled={busy} onClick={() => setManaging(!managing)}>{managing ? 'Terminé' : 'Gérer les profils'}</button>}
        </>;
    }
    return <SessionPage title={signedOut ? 'Connexion' : title} background={login?.background}>
        {basePath && (!signedOut || login) ? content : null}
        {/* eslint-disable-next-line sonarjs/disabled-auto-escaping -- Sanitized by useLoginInfo. */}
        {login?.disclaimer && <div className='client-session-disclaimer' dangerouslySetInnerHTML={{ __html: login.disclaimer }} />}
    </SessionPage>;
}
/* eslint-enable react/jsx-no-bind */
