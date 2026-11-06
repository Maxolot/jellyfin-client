import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import { previewConnection } from '../previews/identity';

import { profileChosen, readProfiles, rememberProfile } from './profileStore';

/** Keeps this browser's list of people up to date and says when to show who is watching. */
export function useProfileGate() {
    const { api, user, __legacyApiClient__: legacy } = useApi();
    const [params] = useSearchParams();
    const { pathname } = useLocation();
    const basePath = api?.basePath;
    const [saved, setSaved] = useState(0);
    useEffect(() => {
        // During a switch the context can pair one person with the next one's session: such a pair is never stored.
        if (!basePath || !user?.Id || !user.Name || !api?.accessToken || !previewConnection(api, user, legacy)) return;
        // An administrator's session is never kept: coming back to it asks for the password.
        rememberProfile(basePath, { userId: user.Id, name: user.Name, imageTag: user.PrimaryImageTag || undefined,
            token: user.Policy?.IsAdministrator ? undefined : api.accessToken });
        setSaved(count => count + 1);
    }, [basePath, user?.Id, user?.Name, user?.PrimaryImageTag, user?.Policy?.IsAdministrator, api, user, legacy]);
    const profiles = useMemo(() => readProfiles(basePath), [basePath, saved]);
    const requested = params.get('view') === 'profiles';
    // Links to a precise page are never interrupted, only an arrival on the home page.
    const arriving = pathname.endsWith('/client') && !params.toString() && profiles.length > 1 && !profileChosen();
    return { showing: requested || arriving, revision: saved };
}
