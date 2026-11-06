/* eslint-disable react/jsx-no-bind -- The form owns its fields. */
import React, { useEffect, useState } from 'react';

import { useApi } from 'hooks/useApi';

import { seerrUrlProblem, withSeerrUrl } from '../../seerr/setup';
import { useSeerr } from '../../seerr/SeerrContext';
import { serverInterfaceUrl } from '../../session/ServerInterfacePage';
import { SettingCard, StatusBadge, TextField } from '../controls';
import SettingsIcon from '../SettingsIcon';
import ExtensionSetup, { ExtensionHeader } from './ExtensionSetup';
import { EXTENSIONS } from './extensions';
import { useExtension, useExtensionConfiguration } from './useServerExtensions';

const extension = EXTENSIONS.moonbase;
// Local Seerr instances are commonly served without TLS.
const PLACEHOLDER = ['http', '//seerr:5055'].join(':');

function SeerrAddress() {
    const seerr = useSeerr();
    const { configuration, save } = useExtensionConfiguration(extension, true, raw => ({ SeerrUrl: typeof raw.SeerrUrl === 'string' ? raw.SeerrUrl : '' }));
    const [url, setUrl] = useState('');
    const [problem, setProblem] = useState('');
    const [result, setResult] = useState('');
    const stored = configuration.data?.SeerrUrl;
    useEffect(() => {
        if (stored) setUrl(current => current || stored);
    }, [stored]);
    async function submit(event: React.FormEvent) {
        event.preventDefault();
        const invalid = seerrUrlProblem(url);
        setProblem(invalid);
        setResult('');
        if (invalid) return;
        try {
            await save.mutateAsync(current => withSeerrUrl(current, url));
        } catch {
            setProblem('L’adresse n’a pas été enregistrée. Réessayez.');
            return;
        }
        try {
            await seerr.reconnect();
            setResult('Seerr est connecté. Chaque utilisateur sera relié automatiquement à son compte Seerr.');
        } catch {
            setProblem('Adresse enregistrée, mais la connexion a échoué. Vérifiez que le serveur joint cette adresse, que Quick Connect est activé dans Jellyfin et que votre compte existe dans Seerr.');
        }
    }
    let badge = <StatusBadge tone='off'>À configurer</StatusBadge>;
    if (stored) badge = seerr.connected ? <StatusBadge tone='ok'>Connecté</StatusBadge> : <StatusBadge tone='warning'>Adresse enregistrée</StatusBadge>;
    return <form noValidate onSubmit={submit}>
        <SettingCard title='Adresse de Seerr' scope='server' aside={badge}
            description='Seerr (ou Jellyseerr) gère les demandes. Indiquez l’adresse que le serveur Jellyfin utilise pour le joindre ; aucune clé n’est nécessaire.'>
            <TextField label='Adresse' type='url' placeholder={PLACEHOLDER} value={url} disabled={save.isPending} onChange={setUrl}
                hint='Dans Docker, « localhost » désigne le conteneur de Jellyfin, pas votre machine : utilisez le nom du conteneur ou l’adresse IP.' />
            <div className='client-settings-actions'>
                <button type='submit' className='client-settings-button-primary' disabled={save.isPending || !url.trim()}>{save.isPending ? 'Enregistrement…' : 'Enregistrer et tester'}</button>
            </div>
            {problem && <p className='client-setting-note is-error' role='alert'>{problem}</p>}
            {result && <p className='client-setting-note is-ok' role='status'>{result}</p>}
        </SettingCard>
    </form>;
}

function MoonbaseMore() {
    const { api } = useApi();
    if (!api) return null;
    return <SettingCard title='Autres réglages de Moonbase' description='Synchronisation des réglages, recommandations et listes IMDb sont propres à Moonbase et se règlent dans l’administration de Jellyfin.'>
        <div className='client-settings-actions'>
            <a className='client-settings-button' href={serverInterfaceUrl(api.basePath, 'dashboard/plugins')} target='_blank' rel='noopener noreferrer'><SettingsIcon name='external' />Ouvrir les plugins du serveur</a>
        </div>
    </SettingCard>;
}

export default function SeerrServer() {
    const { plugin, stage, plugins } = useExtension(extension);
    return <>
        <ExtensionHeader extension={extension} stage={stage} plugin={plugin} error={plugins.isError}>
            <p className='client-setting-note'>Le plugin Moonbase, publié par le projet Moonfin, fait le lien entre Jellyfin et Seerr.</p>
        </ExtensionHeader>
        <ExtensionSetup extension={extension} stage={stage} plugin={plugin} />
        {stage === 'ready' && <><SeerrAddress /><MoonbaseMore /></>}
    </>;
}
/* eslint-enable react/jsx-no-bind */
