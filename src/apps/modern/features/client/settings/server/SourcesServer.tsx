/* eslint-disable react/jsx-no-bind -- The form owns its fields. */
import { isAxiosError } from 'axios';
import React, { useEffect, useState } from 'react';

import { useApi } from 'hooks/useApi';

import { SaveNote, SettingCard, StatusBadge, TextField, Toggle } from '../controls';
import ExtensionSetup, { ExtensionHeader } from './ExtensionSetup';
import { addressProblem, EXTENSIONS, withSecret } from './extensions';
import { useExtension, useExtensionConfiguration } from './useServerExtensions';

const extension = EXTENSIONS.movieSources;
const PLACEHOLDER = ['http', '//prowlarr:9696'].join(':');
// A well-known film, used only to check that searches work.
const TEST_FILM = 'tt0111161';

/** Only the presence of a key enters the persisted query cache. The admin configuration response is projected here. */
export function readSources(raw: Record<string, unknown>) {
    return { Enabled: raw.Enabled === true, Address: typeof raw.Address === 'string' ? raw.Address : '', hasApiKey: typeof raw.ApiKey === 'string' && raw.ApiKey.length > 0 };
}

function useSourcesTest() {
    const { api } = useApi();
    const [state, setState] = useState<{ tone: 'ok' | 'warning' | 'error' | 'busy'; text: string }>();
    async function run() {
        if (!api) return;
        setState({ tone: 'busy', text: 'Recherche d’un film de test dans Prowlarr…' });
        try {
            const response = await api.axiosInstance.get<{ Found?: boolean }>(`${api.basePath}/MovieSources/Movies/${TEST_FILM}`, { headers: { Authorization: api.authorizationHeader } });
            setState(response.data.Found ?
                { tone: 'ok', text: 'Prowlarr répond et trouve des sources.' } :
                { tone: 'warning', text: 'Prowlarr répond, mais aucun indexeur n’a renvoyé de résultat pour le film de test.' });
        } catch (error) {
            const status = isAxiosError(error) ? error.response?.status : undefined;
            if (status === 429) setState({ tone: 'warning', text: 'Une recherche vient d’avoir lieu : réessayez dans quelques secondes.' });
            else setState({ tone: 'error', text: 'Prowlarr ne répond pas : vérifiez l’adresse, la clé et que le serveur Jellyfin peut le joindre.' });
        }
    }
    return { state, run };
}

function SourcesForm() {
    const { configuration, save } = useExtensionConfiguration(extension, true, readSources);
    const [enabled, setEnabled] = useState(false);
    const [address, setAddress] = useState('');
    const [key, setKey] = useState('');
    const [problem, setProblem] = useState('');
    const [loaded, setLoaded] = useState(false);
    const test = useSourcesTest();
    const stored = configuration.data;
    useEffect(() => {
        if (!stored || loaded) return;
        setEnabled(stored.Enabled);
        setAddress(stored.Address);
        setLoaded(true);
    }, [stored, loaded]);
    if (configuration.isError) return <SettingCard title='Connexion à Prowlarr'><p className='client-setting-note is-error' role='alert'>Les réglages du plugin n’ont pas pu être lus.</p></SettingCard>;
    if (!stored) return <SettingCard title='Connexion à Prowlarr'><p role='status'>Chargement des réglages…</p></SettingCard>;
    const changed = enabled !== stored.Enabled || address.trim() !== stored.Address || key.length > 0;
    let badge = <StatusBadge tone='off'>Désactivé</StatusBadge>;
    if (stored.Enabled) badge = stored.Address && stored.hasApiKey ? <StatusBadge tone='ok'>Activé</StatusBadge> : <StatusBadge tone='warning'>Incomplet</StatusBadge>;
    return <form noValidate autoComplete='off' onSubmit={event => {
        event.preventDefault();
        const invalid = enabled || address.trim() ? addressProblem(address) : '';
        setProblem(invalid || (enabled && !stored.hasApiKey && !key.trim() ? 'Indiquez la clé API de Prowlarr.' : ''));
        if (invalid || (enabled && !stored.hasApiKey && !key.trim())) return;
        save.mutate(current => withSecret<Record<string, unknown>>({ ...current, Enabled: enabled, Address: address.trim() }, 'ApiKey', key.trim()), { onSuccess: () => setKey('') });
    }}>
        <SettingCard title='Connexion à Prowlarr' scope='server' aside={badge}
            description='Movie Sources interroge vos indexeurs Prowlarr pour dire, sur la page de demande, si une version est déjà publiée et en quelles langues.'>
            <Toggle label='Chercher les sources avant une demande' checked={enabled} disabled={save.isPending} onChange={setEnabled} />
            <TextField label='Adresse de Prowlarr' type='url' placeholder={PLACEHOLDER} value={address} disabled={save.isPending} onChange={setAddress}
                hint='Telle que le serveur Jellyfin la joint (nom du conteneur ou adresse IP).' />
            <TextField label='Clé API' type='password' autoComplete='new-password' value={key} disabled={save.isPending} onChange={setKey}
                placeholder={stored.hasApiKey ? 'Clé enregistrée : laissez vide pour la garder' : 'Prowlarr → Paramètres → Général → Sécurité'}
                hint={stored.hasApiKey ? 'La clé enregistrée n’est jamais affichée. Saisissez-en une nouvelle seulement pour la remplacer.' : 'Elle est enregistrée dans la configuration du serveur et n’est jamais réaffichée.'} />
            <div className='client-settings-actions'>
                <button type='submit' className='client-settings-button-primary' disabled={!changed || save.isPending}>Enregistrer</button>
                <button type='button' className='client-settings-button' disabled={changed || !stored.Enabled || test.state?.tone === 'busy'} onClick={() => { void test.run(); }}>Tester la recherche</button>
            </div>
            {problem && <p className='client-setting-note is-error' role='alert'>{problem}</p>}
            <SaveNote state={save} />
            {test.state && <p className={`client-setting-note is-${test.state.tone}`} role='status'>{test.state.text}</p>}
        </SettingCard>
    </form>;
}

export default function SourcesServer() {
    const { plugin, stage, plugins } = useExtension(extension);
    return <>
        <ExtensionHeader extension={extension} stage={stage} plugin={plugin} error={plugins.isError} />
        <ExtensionSetup extension={extension} stage={stage} plugin={plugin} />
        {stage === 'ready' && <SourcesForm />}
    </>;
}
/* eslint-enable react/jsx-no-bind */
