import React from 'react';
import { Link } from 'react-router-dom';

import { ServerConnections } from 'lib/jellyfin-apiclient';

import SessionPage, { SessionNotice } from './SessionPage';

const TEXTS = {
    setup: { title: 'Serveur à configurer', message: 'Ce serveur n’a pas encore été installé. Terminez sa configuration dans son interface, puis revenez ici.', path: 'wizard/start' }
};

export function serverInterfaceUrl(server: string, path: string) {
    return `${server.replace(/\/$/, '')}/web/#/${path}`;
}

/** The server's own administration screens, mounted in this application for administrators (`apps/dashboard`). */
export function serverAdminUrl(path = 'dashboard') {
    return `#/${path.replace(/^\//, '')}`;
}

export default function ServerInterfacePage({ kind }: Readonly<{ kind: keyof typeof TEXTS }>) {
    const text = TEXTS[kind];
    const server = ServerConnections.currentApiClient()?.serverAddress();
    return <SessionPage title={text.title}>
        <SessionNotice title={text.title} message={text.message}>
            {server && <a className='client-profile-primary client-session-button' href={serverInterfaceUrl(server, text.path)} target='_blank' rel='noopener noreferrer'>Ouvrir l’interface du serveur</a>}
            <Link className='client-session-link' to='/client'>Retour à l’accueil</Link>
        </SessionNotice>
    </SessionPage>;
}
