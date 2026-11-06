import type { UserDto } from '@jellyfin/sdk/lib/generated-client';

import { accountKey } from './model';

export type OfflineIdentity = { account: string; serverId: string; userId: string; name: string; canDownload: boolean };
const ACTIVE = 'client-offline-active-account';

/** Only the active, still remembered session can open its local files. No credential is duplicated here. */
export function offlineIdentity(): OfflineIdentity | undefined {
    try {
        const value: OfflineIdentity = JSON.parse(localStorage.getItem(ACTIVE) || 'null');
        if (!value?.serverId || !value.userId || value.account !== accountKey(value.serverId, value.userId)) return undefined;
        const servers: { Id?: string; UserId?: string; AccessToken?: string }[] = JSON.parse(localStorage.getItem('jellyfin_credentials') || '{}').Servers || [];
        if (!servers.some(server => server.Id === value.serverId && server.UserId === value.userId && server.AccessToken)) return undefined;
        return value;
    } catch { return undefined; }
}

export function rememberOfflineIdentity(user: UserDto) {
    if (!user.Id || !user.ServerId) return;
    const identity: OfflineIdentity = { account: accountKey(user.ServerId, user.Id), serverId: user.ServerId, userId: user.Id, name: user.Name || 'Mon compte', canDownload: user.Policy?.EnableContentDownloading === true };
    try {
        localStorage.setItem(ACTIVE, JSON.stringify(identity));
    } catch { /* Offline persistence is unavailable. */ }
}

export function forgetOfflineIdentity() {
    try {
        localStorage.removeItem(ACTIVE);
    } catch { /* Already gone. */ }
}
