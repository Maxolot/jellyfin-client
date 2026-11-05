import React, { FC, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import SessionPage, { SessionNotice } from 'apps/modern/features/client/session/SessionPage';

import { appHost } from 'components/apphost';
import { AppFeature } from 'constants/appFeature';
import { ConnectionState, ServerConnections } from 'lib/jellyfin-apiclient';

interface ConnectionErrorPageProps {
    state: ConnectionState
}

const reload = () => window.location.reload();

const ConnectionErrorPage: FC<ConnectionErrorPageProps> = ({
    state
}) => {
    const [ problem, setProblem ] = useState('');
    const [ isConnectDisabled, setIsConnectDisabled ] = useState(false);

    const onForceConnect = useCallback(async () => {
        setIsConnectDisabled(true);

        try {
            const server = ServerConnections.getLastUsedServer();
            await ServerConnections.updateSavedServerId(server);
            window.location.reload();
        } catch (err) {
            console.error('[ConnectionErrorPage] Failed to force connect to server', err);
            setProblem('La connexion a échoué.');
            setIsConnectDisabled(false);
        }
    }, []);

    const texts: Partial<Record<ConnectionState, { title: string; message: string }>> = {
        [ConnectionState.ServerMismatch]: { title: 'Ce n’est plus le même serveur', message: 'L’adresse enregistrée répond, mais avec un autre serveur que celui connu.' },
        [ConnectionState.ServerUpdateNeeded]: { title: 'Serveur à mettre à jour', message: 'La version de ce serveur est trop ancienne pour cette application.' },
        [ConnectionState.Unavailable]: { title: 'Serveur injoignable', message: 'Vérifiez votre connexion, puis réessayez.' }
    };
    const text = texts[state];
    if (!text) return null;

    return (
        <SessionPage title={text.title}>
            <SessionNotice title={text.title} message={text.message}>
                <button type='button' className='client-profile-primary' onClick={reload}>Réessayer</button>
                {state === ConnectionState.ServerMismatch && <button type='button' disabled={isConnectDisabled} onClick={onForceConnect}>Se connecter quand même</button>}
                {problem && <p role='alert' className='client-profile-error'>{problem}</p>}
                <Link className='client-session-link' to='/offline'>Ouvrir mes téléchargements</Link>
                {appHost.supports(AppFeature.MultiServer) && <Link className='client-session-link' to='/selectserver'>Changer de serveur</Link>}
            </SessionNotice>
        </SessionPage>
    );
};

export default ConnectionErrorPage;
