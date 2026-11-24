import React from 'react';
import { Link } from 'react-router-dom';

import { serverAdminUrl } from '../../session/ServerInterfacePage';
import { SettingCard, StatusBadge } from '../controls';
import SettingsIcon from '../SettingsIcon';
import { ExtensionLogo, RestartCard, StageBadge } from './ExtensionSetup';
import { EXTENSIONS, extensionStage, findPlugin } from './extensions';
import { useServerCatalogue, useServerPlugins } from './useServerExtensions';

export const EXTENSION_SECTIONS = { previews: 'serveur-extraits', moonbase: 'serveur-demandes', movieSources: 'serveur-sources' } as const;

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

function InstalledPlugins() {
    const plugins = useServerPlugins();
    if (!plugins.data) return null;
    const tone = (status?: string) => {
        if (status === 'Active') return 'ok';
        if (status === 'Restart' || status === 'Superceded') return 'warning';
        if (status === 'Disabled' || status === 'Deleted') return 'off';
        return 'error';
    };
    const label: Record<string, string> = { Active: 'Actif', Restart: 'Redémarrage requis', Disabled: 'Désactivé', Superceded: 'Remplacé', Deleted: 'Supprimé', Malfunctioned: 'En panne', NotSupported: 'Incompatible' };
    return <SettingCard title='Plugins installés' scope='server' description={`${plugins.data.length} plugin${plugins.data.length > 1 ? 's' : ''}. Installation, mise à jour et configuration détaillée dans les réglages avancés.`}
        aside={<a className='client-settings-button' href={serverAdminUrl('dashboard/plugins')}>Gérer</a>}>
        <ul className='client-setting-list'>
            {[...plugins.data].sort((a, b) => (a.Name || '').localeCompare(b.Name || '', 'fr')).map(plugin => <li key={plugin.Id}>
                <SettingsIcon name='plugin' /><span><strong>{plugin.Name}</strong><small>Version {plugin.Version}</small></span>
                <StatusBadge tone={tone(plugin.Status)}>{label[plugin.Status || ''] || plugin.Status || 'Inconnu'}</StatusBadge>
            </li>)}
        </ul>
    </SettingCard>;
}

export default function ServerOverview() {
    const plugins = useServerPlugins();
    const waiting = plugins.data?.filter(plugin => plugin.Status === 'Restart') || [];
    return <>
        <header className='client-settings-intro'>
            <h2>Plugins</h2>
            <p>Les fonctions propres à cette application, installées sur votre serveur Jellyfin. Seuls les administrateurs voient cette partie.</p>
        </header>
        {waiting.length > 0 && <RestartCard what={`${waiting.map(plugin => plugin.Name).join(', ')} ${waiting.length > 1 ? 'attendent' : 'attend'} un redémarrage.`} />}
        <Extensions />
        {plugins.isError && <p className='client-setting-note is-error' role='alert'>La liste des plugins n’a pas pu être lue.</p>}
        <InstalledPlugins />
        <Catalogues />
    </>;
}
