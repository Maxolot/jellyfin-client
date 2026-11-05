import type { Api } from '@jellyfin/sdk';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client';

export type PreviewTransport = Pick<Api, 'basePath' | 'accessToken' | 'axiosInstance'>;
type LegacyIdentity = { serverAddress: () => string; serverId: () => string; getCurrentUserId: () => string | undefined | null; accessToken: () => string | undefined | null };
const normalized = (value: string | undefined | null) => (value || '').replace(/-/g, '').toLowerCase();
/** API/context updates can span a render; never mix one user's ID with another session. */
export function previewConnection(api: PreviewTransport | undefined, user: Pick<UserDto, 'Id' | 'ServerId'> | undefined, legacy: LegacyIdentity | undefined): PreviewTransport | undefined {
    if (!api?.accessToken || !user?.Id || !user.ServerId || !legacy) return undefined;
    try {
        const { basePath, accessToken, axiosInstance } = api;
        if (basePath.replace(/\/$/, '') !== legacy.serverAddress().replace(/\/$/, '') || accessToken !== legacy.accessToken()
            || normalized(user.Id) !== normalized(legacy.getCurrentUserId()) || normalized(user.ServerId) !== normalized(legacy.serverId())) return undefined;
        return { basePath, accessToken, axiosInstance };
    } catch { return undefined; }
}
