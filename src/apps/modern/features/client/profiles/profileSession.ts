import { ServerConnections } from 'lib/jellyfin-apiclient';
import Dashboard from 'utils/dashboard';

import { forgetProfile, markProfileChosen } from './profileStore';

/** Starts over as this person: nothing of the previous account survives a full reload. */
export function enterProfile(serverId: string, userId: string, token: string) {
    const provider = ServerConnections.credentialProvider();
    const credentials = provider.credentials();
    const server = credentials.Servers.find((entry: { Id?: string }) => entry.Id === serverId);
    if (!server) throw new Error('Serveur introuvable');
    server.UserId = userId;
    server.AccessToken = token;
    provider.credentials(credentials);
    restart();
}

export function restart() {
    markProfileChosen();
    // Silent on purpose: changing the hash would mount the home page with the previous, perhaps closed, session before the reload.
    window.history.replaceState(null, '', '#/client');
    window.location.reload();
}

/** Signing out of an account also takes it off this browser's list. */
export function signOut(basePath: string | undefined, userId: string | null | undefined) {
    forgetProfile(basePath, userId || undefined);
    return Dashboard.logout();
}
