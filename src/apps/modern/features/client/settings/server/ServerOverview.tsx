import React from 'react';
import { Link } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import { serverInterfaceUrl } from '../../session/ServerInterfacePage';
import { SettingCard, StatusBadge } from '../controls';
import SettingsIcon from '../SettingsIcon';
import { ExtensionLogo, RestartCard, StageBadge } from './ExtensionSetup';
import { EXTENSIONS, extensionStage, findPlugin } from './extensions';
import { useServerCatalogue, useServerPlugins } from './useServerExtensions';

export const EXTENSION_SECTIONS = { previews: 'serveur-extraits', moonbase: 'serveur-demandes', movieSources: 'serveur-sources' } as const;

const ADMIN_LINKS = [
    ['dashboard', 'Tableau de bord', 'Activité, appareils et état du serveur'],
    ['dashboard/libraries', 'Bibliothèques', 'Dossiers, métadonnées, analyses'],
    ['dashboard/users', 'Utilisateurs', 'Comptes, accès et contrôle parental'],
    ['dashboard/playback/transcoding', 'Transcodage', 'Accélération matérielle et qualité'],
    ['dashboard/plugins', 'Plugins', 'Tous les plugins et leurs catalogues'],
    ['dashboard/tasks', 'Tâches planifiées', 'Analyses, nettoyages et sauvegardes']
] as const;

function Extensions() {
    const plugins = useServerPlugins();
    return <div className='client-extension-grid'>
        {Object.values(EXTENSIONS).map(extension => {
            const plugin = findPlugin(plugins.data, extension);
            const stage = plugins.data ? extensionStage(plugin) : undefined;
            return <Link key={extension.key} className='client-extension-tile' to={`/client?view=settings&section=${EXTENSION_SECTIONS[extension.key]}`}>
                <ExtensionLogo extension={extension} />
                <strong>{extension.title}</strong>
                <span>{extension.summary}</span>
                <span className='client-extension-tile-foot'><StageBadge stage={stage} loading={plugins.isPending} /><em>{stage === 'missing' ? 'Installer' : 'Configurer'}<SettingsIcon name='external' className='is-arrow' /></em></span>
            </Link>;
        })}
    </div>;
}

function Catalogues() {
    const { repositories } = useServerCatalogue(true);
    if (!repositories.data) return null;
    return <SettingCard title='Catalogues de plugins' scope='server' description='Les sources depuis lesquelles ce serveur installe ses plugins. Les extensions ci-dessus y ajoutent la leur à l’installation.'>
        <ul className='client-setting-list'>
            {repositories.data.map(repository => <li key={repository.Url}>
                <SettingsIcon name='plugin' /><span><strong>{repository.Name}</strong><small>{repository.Url}</small></span>
                {repository.Enabled ? <StatusBadge tone='ok'>Actif</StatusBadge> : <StatusBadge tone='off'>Désactivé</StatusBadge>}
            </li>)}
            {!repositories.data.length && <li><span>Aucun catalogue configuré.</span></li>}
        </ul>
    </SettingCard>;
}

export default function ServerOverview() {
    const { api } = useApi();
    const plugins = useServerPlugins();
    const waiting = plugins.data?.filter(plugin => plugin.Status === 'Restart') || [];
    return <>
        <header className='client-settings-intro'>
            <h2>Serveur</h2>
            <p>Les fonctions propres à cette application, installées sur votre serveur Jellyfin. Seuls les administrateurs voient cette partie.</p>
        </header>
        {waiting.length > 0 && <RestartCard what={`${waiting.map(plugin => plugin.Name).join(', ')} ${waiting.length > 1 ? 'attendent' : 'attend'} un redémarrage.`} />}
        <Extensions />
        {plugins.isError && <p className='client-setting-note is-error' role='alert'>La liste des plugins n’a pas pu être lue.</p>}
        {api && <SettingCard title='Administration complète' description='Le reste se règle dans l’interface d’administration de Jellyfin, qui s’ouvre dans un nouvel onglet.'>
            <div className='client-admin-links'>
                {ADMIN_LINKS.map(([path, title, hint]) => <a key={path} href={serverInterfaceUrl(api.basePath, path)} target='_blank' rel='noopener noreferrer'>
                    <span><strong>{title}</strong><small>{hint}</small></span><SettingsIcon name='external' />
                </a>)}
            </div>
        </SettingCard>}
        <Catalogues />
    </>;
}
