import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ServerConnections } from 'lib/jellyfin-apiclient';

import ProfilePage from '../profiles/ProfilePage';

/** Only addresses of this application may come back after signing in. */
export function safeTarget(url: string | null) {
    if (!url) return '/client';
    try {
        const target = decodeURIComponent(url);
        return /^\/(?!\/)/.test(target) ? target : '/client';
    } catch {
        return '/client';
    }
}

/** Signing in is the people page without anyone active yet. */
export function LoginPage() {
    const [params] = useSearchParams();
    const serverId = params.get('serverid');
    const client = useMemo(() => (serverId ? ServerConnections.getOrCreateApiClient(serverId) : ServerConnections.currentApiClient()), [serverId]);
    const target = safeTarget(params.get('url'));
    return client ? <ProfilePage revision={0} signedOut={{ client, target }} /> : null;
}
