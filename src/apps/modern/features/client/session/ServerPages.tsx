/* eslint-disable react/jsx-no-bind -- Actions are local to these pages. */
import type { ConnectResponse } from 'jellyfin-apiclient';
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ConnectionState, ServerConnections } from 'lib/jellyfin-apiclient';
import appSettings from 'scripts/settings/appSettings';

import ClientIcon from '../ClientIcon';
import { restart } from '../profiles/profileSession';
import SessionPage from './SessionPage';

type SavedServer = { Id: string; Name?: string; ManualAddress?: string; LocalAddress?: string; RemoteAddress?: string };

/** Where a connection attempt leads; undefined when it failed and the page should say so. */
export function connectionTarget(result: Pick<ConnectResponse, 'State'> & { Servers?: { Id?: string }[]; SystemInfo?: { StartupWizardCompleted?: boolean } }) {
    switch (result.State) {
        case ConnectionState.SignedIn:
            return '/client';
        case ConnectionState.ServerSignIn:
            return result.SystemInfo && result.SystemInfo.StartupWizardCompleted === false ? '/wizard/start' : `/login?serverid=${result.Servers?.[0]?.Id || ''}`;
        case ConnectionState.ServerSelection:
            return '/selectserver';
        default:
            return undefined;
    }
}

export function connectionProblem(state: ConnectionState) {
    return state === ConnectionState.ServerUpdateNeeded ? 'La version de ce serveur est trop ancienne pour cette application.' : 'Impossible de joindre ce serveur. Vérifiez l’adresse.';
}

function useConnection() {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState('');
    const follow = useCallback((attempt: Promise<ConnectResponse>) => {
        setBusy(true);
        setProblem('');
        attempt.then(result => {
            const target = connectionTarget(result as Parameters<typeof connectionTarget>[0]);
            if (!target) {
                setProblem(connectionProblem(result.State));
                setBusy(false);
                return;
            }
            // Already signed in on that server: a full start leaves nothing of the previous one behind.
            if (target === '/client') restart();
            else navigate(target);
        }).catch(() => {
            setProblem(connectionProblem(ConnectionState.Unavailable));
            setBusy(false);
        });
    }, [navigate]);
    return { busy, problem, follow };
}

export function AddServerPage() {
    const [address, setAddress] = useState('');
    const { busy, problem, follow } = useConnection();
    return <SessionPage title='Ajouter un serveur'>
        <form className='client-profile-form' onSubmit={event => {
            event.preventDefault();
            follow(ServerConnections.connectToAddress(address.trim().replace(/\/$/, ''), { enableAutoLogin: appSettings.enableAutoLogin() }));
        }}>
            <h1>Ajouter un serveur</h1>
            <label>Adresse du serveur<input type='url' inputMode='url' autoComplete='url' placeholder='https://…' value={address} disabled={busy} onChange={event => setAddress(event.target.value)} /></label>
            {problem && <p role='alert' className='client-profile-error'>{problem}</p>}
            <button type='submit' className='client-profile-primary' disabled={busy || !address.trim()}>Se connecter</button>
            <Link className='client-session-link' to='/selectserver'>Voir les serveurs enregistrés</Link>
        </form>
    </SessionPage>;
}

export function SelectServerPage() {
    const navigate = useNavigate();
    const [servers, setServers] = useState<SavedServer[]>();
    const [managing, setManaging] = useState(false);
    const { busy, problem, follow } = useConnection();
    const load = useCallback(() => {
        ServerConnections.getAvailableServers().then((found: SavedServer[]) => {
            setServers(found);
            // Nothing to choose from: the only useful step is adding one.
            if (!found.length) navigate('/addserver', { replace: true });
        }).catch(() => setServers([]));
    }, [navigate]);
    useEffect(load, [load]);
    return <SessionPage title='Choisir un serveur'>
        <h1>{managing ? 'Retirer un serveur' : 'Choisir un serveur'}</h1>
        {problem && <p role='alert' className='client-profile-error'>{problem}</p>}
        <ul className='client-server-list'>
            {servers?.map(server => <li key={server.Id}>
                <button type='button' className='client-profile-tile' disabled={busy} aria-label={managing ? `Retirer ${server.Name}` : server.Name} onClick={() => {
                    if (managing) ServerConnections.deleteServer(server.Id).then(load).catch(load);
                    else follow(ServerConnections.connectToServer(server, { enableAutoLogin: appSettings.enableAutoLogin() }));
                }}>
                    <span className='client-profile-avatar'><ClientIcon name={managing ? 'close' : 'collection'} /></span>
                    <strong>{server.Name || server.ManualAddress}</strong>
                </button>
            </li>)}
        </ul>
        <div className='client-session-footer'>
            <Link className='client-profile-manage' to='/addserver'>Ajouter un serveur</Link>
            {!!servers?.length && <button type='button' className='client-profile-manage' onClick={() => setManaging(!managing)}>{managing ? 'Terminé' : 'Retirer un serveur'}</button>}
        </div>
    </SessionPage>;
}
/* eslint-enable react/jsx-no-bind */
