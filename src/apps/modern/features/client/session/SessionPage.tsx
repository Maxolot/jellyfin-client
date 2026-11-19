import React, { type PropsWithChildren, useCallback, useEffect, useState } from 'react';

import Page from 'components/Page';
import loading from 'components/loading/loading';
import { APP_NAME } from 'constants/branding';
import { useApi } from 'hooks/useApi';
import { useWebConfig } from 'hooks/useWebConfig';

import ClientIcon from '../ClientIcon';
import { readInterfacePreferences } from '../interfacePreferences';
import '../client.scss';
import '../profiles/profiles.scss';
import './session.scss';

type Variant = 'login' | 'profiles' | 'standard';

/** Full-screen frame of everything outside the library: signing in, servers, errors. */
export default function SessionPage({ title, background, variant = 'standard', children }: Readonly<PropsWithChildren<{ title: string; background?: string; variant?: Variant }>>) {
    const { user, api } = useApi();
    const { clientLoginBackground } = useWebConfig();
    const artwork = background || (variant === 'login' ? clientLoginBackground : undefined);
    const [shown, setShown] = useState<string>();
    const onBackgroundLoad = useCallback(() => setShown(artwork), [artwork]);
    useEffect(() => {
        // The boot spinner is owned by the legacy engine until our first screen is ready.
        loading.hide();
    }, []);
    const classic = user?.Id && !readInterfacePreferences(`client-interface-${api?.basePath}-${user.Id}`).glass;
    return <Page id='clientPage' title={title} className='client-page' isBackButtonEnabled={false}>
        <div className={`client-profiles client-session client-session-${variant}${artwork ? ' has-backdrop' : ''}${classic ? ' client-session-classic' : ''}`}>
            {artwork && <img className={`client-session-backdrop${shown === artwork ? ' is-shown' : ''}`} src={artwork} alt='' onLoad={onBackgroundLoad} />}
            <header className='client-session-brand'><span><ClientIcon name='play' /></span>{APP_NAME}</header>
            {children}
        </div>
    </Page>;
}

export function SessionNotice({ title, message, busy, children }: Readonly<PropsWithChildren<{ title: string; message: string; busy?: boolean }>>) {
    return <section className='client-profile-form client-session-notice'>
        <h1>{title}</h1>
        {busy ? <p role='status'>{message}</p> : <p>{message}</p>}
        {busy && <span className='client-session-progress' aria-hidden='true' />}
        {children && <div className='client-session-actions'>{children}</div>}
    </section>;
}

export function SessionLoadingPage() {
    return <SessionPage title='Connexion au serveur' variant='login'>
        <SessionNotice title='Connexion au serveur' message='La médiathèque se charge…' busy />
    </SessionPage>;
}
