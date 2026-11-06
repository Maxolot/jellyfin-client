import { useEffect } from 'react';

import { useApi } from 'hooks/useApi';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import Events from 'utils/events';

import { downloader } from './downloader';
import { forgetOfflineIdentity, rememberOfflineIdentity } from './identity';

/** Configure the download queue from the existing session, keeping credentials only in memory. */
export default function OfflineBridge() {
    const { api, user, __legacyApiClient__: client } = useApi();
    useEffect(() => {
        // This route deliberately bypasses ConnectionRequired; restore the remembered session only when online.
        const reconnect = () => {
            if (!navigator.onLine || user?.Id || !/^#\/(offline|video)(?:[/?]|$)/.test(window.location.hash)) return;
            ServerConnections.connect().catch(() => undefined);
        };
        reconnect();
        window.addEventListener('online', reconnect);
        return () => window.removeEventListener('online', reconnect);
    }, [user?.Id]);
    useEffect(() => {
        if (!api || !user?.Id || !user.ServerId || !client) return;
        rememberOfflineIdentity(user);
        const connect = async () => {
            await downloader.configure({ serverId: user.ServerId!, userId: user.Id!, userName: user.Name || '', basePath: api.basePath,
                token: api.accessToken || '', deviceId: client.deviceId(), canDownload: user.Policy?.EnableContentDownloading === true,
                canTranscode: user.Policy?.EnableVideoPlaybackTranscoding === true && user.Policy?.EnableAudioPlaybackTranscoding === true });
            await downloader.syncPositions();
        };
        const online = () => {
            downloader.pump();
            downloader.syncPositions().catch(() => undefined);
        };
        connect().catch(() => undefined);
        window.addEventListener('online', online);
        return () => {
            window.removeEventListener('online', online);
            downloader.configure(undefined).catch(() => undefined);
        };
    }, [api, user, client]);
    useEffect(() => {
        const signedOut = () => {
            forgetOfflineIdentity();
            downloader.configure(undefined).catch(() => undefined);
        };
        Events.on(ServerConnections, 'localusersignedout', signedOut);
        return () => Events.off(ServerConnections, 'localusersignedout', signedOut);
    }, []);
    return null;
}
