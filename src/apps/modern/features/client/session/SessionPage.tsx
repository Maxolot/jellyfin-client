import React, { type PropsWithChildren, useCallback, useState } from 'react';

import Page from 'components/Page';

import '../client.scss';
import '../profiles/profiles.scss';
import './session.scss';

/** Full-screen frame of everything outside the library: signing in, servers, errors. */
export default function SessionPage({ title, background, children }: Readonly<PropsWithChildren<{ title: string; background?: string }>>) {
    const [shown, setShown] = useState(false);
    const onBackgroundLoad = useCallback(() => setShown(true), []);
    return <Page id='clientPage' title={title} className='client-page' isBackButtonEnabled={false}>
        <div className={`client-profiles${background ? ' has-backdrop' : ''}`}>
            {background && <img className={`client-session-backdrop${shown ? ' is-shown' : ''}`} src={background} alt='' onLoad={onBackgroundLoad} />}
            {children}
        </div>
    </Page>;
}

export function SessionNotice({ title, message, children }: Readonly<PropsWithChildren<{ title: string; message: string }>>) {
    return <section className='client-profile-form client-session-notice'>
        <h1>{title}</h1>
        <p>{message}</p>
        <div className='client-session-actions'>{children}</div>
    </section>;
}
