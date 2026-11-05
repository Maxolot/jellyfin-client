import createDOMPurify from 'dompurify';
import type { ApiClient } from 'jellyfin-apiclient';
import markdownIt from 'markdown-it';
import { useEffect, useState } from 'react';

import { SPLASHSCREEN_URL } from 'constants/branding';

import type { SavedProfile } from '../profiles/profileStore';

const purify = createDOMPurify();

export type LoginInfo = { publicUsers: SavedProfile[]; passwordless: Set<string>; disclaimer: string; background?: string };

/** What a server chooses to show before signing in: its public accounts, its notice, its background. */
export function useLoginInfo(client: ApiClient | undefined) {
    const [info, setInfo] = useState<LoginInfo>();
    useEffect(() => {
        if (!client) return;
        let left = false;
        void Promise.all([
            client.getPublicUsers().catch(() => []),
            client.getJSON(client.getUrl('Branding/Configuration')).catch(() => ({})) as Promise<{ LoginDisclaimer?: string; SplashscreenEnabled?: boolean }>
        ]).then(([users, branding]) => {
            if (left) return;
            setInfo({
                publicUsers: users.flatMap(user => user.Id && user.Name ? [{ userId: user.Id, name: user.Name, imageTag: user.PrimaryImageTag || undefined }] : []),
                passwordless: new Set(users.flatMap(user => user.Id && !user.HasPassword ? [user.Id] : [])),
                // eslint-disable-next-line sonarjs/disabled-auto-escaping, @typescript-eslint/naming-convention -- The administrator's notice, sanitized here; ADD_ATTR is DOMPurify's own name.
                disclaimer: branding.LoginDisclaimer ? purify.sanitize(markdownIt({ html: true }).render(branding.LoginDisclaimer), { ADD_ATTR: ['target', 'rel'] }) : '',
                background: branding.SplashscreenEnabled ? `${client.serverAddress()}${SPLASHSCREEN_URL}` : undefined
            });
        });
        return () => {
            left = true;
        };
    }, [client]);
    return info;
}
