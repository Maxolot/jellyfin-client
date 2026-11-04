/* eslint-disable react/jsx-no-bind -- These controls belong to the current setup step. */
import React, { useEffect, useState } from 'react';

import { MOONBASE_REPOSITORY, seerrUrlProblem } from './setup';
import { useSeerr } from './SeerrContext';
import { useSeerrSetup } from './useSeerrSetup';

// Local Seerr instances are commonly served without TLS.
const PLACEHOLDER = ['http', '//seerr:5055'].join(':');
const SERVER_HINT = 'Utilisez l’adresse que le serveur Jellyfin peut joindre : dans Docker, « localhost » désigne le conteneur de Jellyfin, pas votre machine.';

function InstallStep({ setup }: Readonly<{ setup: ReturnType<typeof useSeerrSetup> }>) {
    const [confirming, setConfirming] = useState(false);
    return <>
        <p>Les demandes passent par Moonbase, un plugin tiers qui s’exécute sur votre serveur Jellyfin. Il faut l’installer une fois.</p>
        {confirming ? <>
            <p>Moonbase vient du catalogue officiel de ses auteurs, ajouté à vos dépôts de plugins : <code>{MOONBASE_REPOSITORY}</code>. Ses autres fonctions actives par défaut (synchronisation des réglages, recommandations, listes IMDb) se règlent ensuite dans Tableau de bord → Plugins → Moonbase.</p>
            <div className='client-account-actions'>
                <button className='client-button' disabled={setup.install.isPending} onClick={() => setup.install.mutate()}>{setup.install.isPending ? 'Installation…' : 'Confirmer l’installation'}</button>
                <button className='client-button' disabled={setup.install.isPending} onClick={() => setConfirming(false)}>Annuler</button>
            </div>
        </> : <div className='client-account-actions'><button className='client-button' onClick={() => setConfirming(true)}>Installer Moonbase</button></div>}
        {setup.install.isError && <p role='alert'>L’installation a échoué. Vérifiez que le serveur accède à Internet, puis réessayez.</p>}
    </>;
}

function RestartStep({ setup }: Readonly<{ setup: ReturnType<typeof useSeerrSetup> }>) {
    const [confirming, setConfirming] = useState(false);
    const playing = setup.playing.data || 0;
    return <>
        <p>Moonbase est installé. Jellyfin doit redémarrer pour l’activer : le serveur sera indisponible quelques instants.</p>
        {playing > 0 && <p role='alert'>{playing > 1 ? `${playing} lectures sont en cours et seront interrompues.` : 'Une lecture est en cours et sera interrompue.'}</p>}
        {confirming ? <div className='client-account-actions'>
            <button className='client-button' disabled={setup.restart.isPending} onClick={() => setup.restart.mutate()}>{setup.restart.isPending ? 'Redémarrage…' : 'Confirmer le redémarrage'}</button>
            <button className='client-button' disabled={setup.restart.isPending} onClick={() => setConfirming(false)}>Annuler</button>
        </div> : <div className='client-account-actions'><button className='client-button' onClick={() => setConfirming(true)}>Redémarrer Jellyfin</button></div>}
        {setup.restart.isError && <p role='alert'>Jellyfin n’est pas revenu avec Moonbase actif. Vérifiez le serveur, puis rechargez cette page.</p>}
    </>;
}

function ConnectStep({ setup }: Readonly<{ setup: ReturnType<typeof useSeerrSetup> }>) {
    const seerr = useSeerr();
    const stored = setup.configuration.data?.SeerrUrl;
    const [url, setUrl] = useState('');
    const [problem, setProblem] = useState('');
    const [result, setResult] = useState('');
    useEffect(() => {
        if (typeof stored === 'string') setUrl(current => current || stored);
    }, [stored]);
    async function submit(event: React.FormEvent) {
        event.preventDefault();
        const invalid = seerrUrlProblem(url);
        setProblem(invalid);
        setResult('');
        if (invalid) return;
        try {
            await setup.save.mutateAsync(url);
        } catch {
            setProblem('L’adresse n’a pas été enregistrée. Réessayez.');
            return;
        }
        try {
            await seerr.reconnect();
            setResult('Seerr est connecté. Chaque utilisateur sera relié automatiquement à son compte.');
        } catch {
            setProblem('Adresse enregistrée, mais la connexion a échoué. Vérifiez que le serveur joint cette adresse, que Quick Connect est activé dans Jellyfin et que votre compte existe dans Seerr.');
        }
    }
    return <form className='client-account-quickconnect' noValidate onSubmit={submit}>
        <label>Adresse de Seerr
            <input type='url' inputMode='url' autoComplete='off' placeholder={PLACEHOLDER} value={url} onChange={event => setUrl(event.target.value)} />
        </label>
        <p className='client-player-hint'>{SERVER_HINT}</p>
        <div className='client-account-actions'><button className='client-button' type='submit' disabled={setup.save.isPending || !url.trim()}>{setup.save.isPending ? 'Enregistrement…' : 'Enregistrer et tester'}</button></div>
        {problem && <p role='alert'>{problem}</p>}
        {result && <p role='status'>{result}</p>}
    </form>;
}

/** Administrator-only: installs and points the Moonbase server plugin at Seerr without leaving the client. */
export default function SeerrSetup() {
    const setup = useSeerrSetup();
    if (!setup.administrator || !setup.stage) return null;
    return <section className='client-account-section client-seerr-setup'>
        <header><h2>Installation sur le serveur</h2><span className='client-account-scope'>Administrateur</span></header>
        {setup.stage === 'missing' && <InstallStep setup={setup} />}
        {setup.stage === 'restart' && <RestartStep setup={setup} />}
        {setup.stage === 'ready' && <ConnectStep setup={setup} />}
        {setup.stage === 'problem' && <p role='alert'>Moonbase est présent mais inactif ({setup.plugin.data?.Status}). Consultez Tableau de bord → Plugins.</p>}
    </section>;
}
/* eslint-enable react/jsx-no-bind */
