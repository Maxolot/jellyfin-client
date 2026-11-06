import React, { useEffect, useState } from 'react';

import type { ApiClient } from 'jellyfin-apiclient';

const POLL_MS = 3000;

/** Signs in by approving a code on a device that is already connected, without typing a password here. */
export default function QuickConnectPanel({ legacy, done, cancel }: Readonly<{ legacy: ApiClient; done: (result: Awaited<ReturnType<ApiClient['quickConnect']>>) => void; cancel: () => void }>) {
    const [code, setCode] = useState('');
    const [problem, setProblem] = useState('');
    useEffect(() => {
        let stopped = false;
        let timer = 0;
        const fail = (message: string) => {
            if (!stopped) setProblem(message);
        };
        const start = async () => {
            const response = await legacy.ajax({ type: 'POST', url: legacy.getUrl('/QuickConnect/Initiate') });
            const started = await response.json() as { Code?: string; Secret?: string };
            if (!started.Code || !started.Secret) throw new Error('Réponse invalide');
            if (stopped) return;
            setCode(started.Code);
            const secret = started.Secret;
            const again = () => {
                timer = window.setTimeout(() => {
                    void check();
                }, POLL_MS);
            };
            const check = async () => {
                try {
                    const state = await legacy.getJSON(legacy.getUrl(`/QuickConnect/Connect?Secret=${encodeURIComponent(secret)}`));
                    if (stopped) return;
                    if (state.Authenticated) {
                        done(await legacy.quickConnect(secret));
                        return;
                    }
                    again();
                } catch {
                    fail('Ce code a expiré. Annulez puis recommencez.');
                }
            };
            again();
        };
        start().catch(() => fail('Quick Connect n’est pas disponible sur ce serveur.'));
        return () => {
            stopped = true;
            window.clearTimeout(timer);
        };
    }, [legacy, done]);
    return <div className='client-profile-form'>
        <h1>Quick Connect</h1>
        {problem ? <p role='alert' className='client-profile-error'>{problem}</p> : <>
            <p>Sur un appareil déjà connecté, ouvrez Quick Connect depuis le menu du profil et saisissez ce code.</p>
            <output className='client-quick-code' aria-live='polite'>{code || '…'}</output>
        </>}
        <div><button type='button' onClick={cancel}>Annuler</button></div>
    </div>;
}
