/* eslint-disable react/jsx-no-bind -- Each step owns its buttons. */
import type { PluginInfo } from '@jellyfin/sdk/lib/generated-client';
import React, { type ReactNode, useState } from 'react';

import { useApi } from 'hooks/useApi';
import { useWebConfig } from 'hooks/useWebConfig';

import { serverInterfaceUrl } from '../../session/ServerInterfacePage';
import { SettingCard, StatusBadge, TextField } from '../controls';
import SettingsIcon, { type SettingsIconName } from '../SettingsIcon';
import seerrLogo from '../logos/seerr.svg';
import { type Extension, type ExtensionKey, type ExtensionStage, findPackage, repositoryProblem } from './extensions';
import { useEnableExtension, useInstallExtension, useServerCatalogue, useServerRestart } from './useServerExtensions';

const ICONS: Record<ExtensionKey, SettingsIconName> = { previews: 'previews', moonbase: 'requests', movieSources: 'sources' };

/** Seerr's own logo (MIT); the other extensions use this application's line icons. */
export function ExtensionLogo({ extension }: Readonly<{ extension: Extension }>) {
    return <span className={`client-extension-logo is-${extension.key}`} aria-hidden='true'>
        {extension.key === 'moonbase' ? <img src={seerrLogo} alt='' /> : <SettingsIcon name={ICONS[extension.key]} />}
    </span>;
}

export function StageBadge({ stage, loading }: Readonly<{ stage?: ExtensionStage; loading?: boolean }>) {
    if (!stage) return <StatusBadge tone='busy'>{loading === false ? 'Inconnu' : 'Vérification…'}</StatusBadge>;
    if (stage === 'ready') return <StatusBadge tone='ok'>Actif</StatusBadge>;
    if (stage === 'restart') return <StatusBadge tone='warning'>Redémarrage requis</StatusBadge>;
    if (stage === 'disabled') return <StatusBadge tone='off'>Désactivé</StatusBadge>;
    if (stage === 'problem') return <StatusBadge tone='error'>En erreur</StatusBadge>;
    return <StatusBadge tone='off'>Non installé</StatusBadge>;
}

/** The title block of an extension page: logo, purpose, state and version. */
export function ExtensionHeader({ extension, stage, plugin, children, error }: Readonly<{ extension: Extension; stage?: ExtensionStage; plugin?: PluginInfo; children?: ReactNode; error?: boolean }>) {
    return <header className='client-extension-header'>
        <ExtensionLogo extension={extension} />
        <div>
            <h2>{extension.title}</h2>
            <p>{extension.summary}</p>
            <div className='client-extension-meta'>
                <StageBadge stage={stage} loading={!error} />
                <span>Plugin {extension.packageName}{plugin?.Version ? ` · version ${plugin.Version}` : ''}</span>
            </div>
            {error && <p role='alert' className='client-setting-note is-error'>Le serveur n’a pas pu fournir l’état du plugin. Rechargez la page pour réessayer.</p>}
            {children}
        </div>
    </header>;
}

function InstallCard({ extension }: Readonly<{ extension: Extension }>) {
    const configured = useWebConfig().clientPluginRepositories?.[extension.key as 'previews' | 'movieSources'];
    const [confirming, setConfirming] = useState(false);
    const [url, setUrl] = useState(configured || extension.repository || '');
    const [problem, setProblem] = useState('');
    const { packages, repositories } = useServerCatalogue(confirming);
    const { addRepository, install } = useInstallExtension(extension);
    const offered = findPackage(packages.data, extension);
    const latest = offered?.versions?.[0];
    const busy = addRepository.isPending || install.isPending;
    const repositoryName = latest?.repositoryName || repositories.data?.find(entry => entry.Url === latest?.repositoryUrl)?.Name;

    async function installFrom(repositoryUrl?: string) {
        setProblem('');
        try {
            await install.mutateAsync(repositoryUrl);
        } catch {
            setProblem('L’installation n’a pas abouti. Vérifiez que le serveur accède au catalogue, puis réessayez.');
        }
    }
    async function addAndInstall() {
        const invalid = repositoryProblem(url);
        setProblem(invalid);
        if (invalid) return;
        try {
            await addRepository.mutateAsync(url);
        } catch {
            setProblem('Le catalogue n’a pas pu être ajouté au serveur.');
            return;
        }
        await installFrom(url.trim());
    }

    if (!confirming) {
        return <SettingCard title='Installation' description={`${extension.packageName} n’est pas installé sur ce serveur. L’installation se fait depuis un catalogue de plugins. Vous confirmerez ensuite le redémarrage de Jellyfin.`}>
            <div className='client-settings-actions'><button type='button' className='client-settings-button-primary' onClick={() => setConfirming(true)}>Installer {extension.packageName}</button></div>
        </SettingCard>;
    }
    let body: ReactNode;
    if (packages.isPending) {
        body = <p role='status'>Lecture des catalogues du serveur…</p>;
    } else if (offered) {
        body = <>
            <p>{extension.packageName} {latest?.version} est proposé par le catalogue {repositoryName ? `« ${repositoryName} »` : 'déjà configuré'}. Le serveur télécharge le plugin, puis il faudra redémarrer Jellyfin.</p>
            <div className='client-settings-actions'>
                <button type='button' className='client-settings-button-primary' disabled={busy} onClick={() => { void installFrom(latest?.repositoryUrl || undefined); }}>{install.isPending ? 'Installation…' : 'Confirmer l’installation'}</button>
                <button type='button' className='client-settings-button' disabled={busy} onClick={() => setConfirming(false)}>Annuler</button>
            </div>
        </>;
    } else {
        body = <>
            <p>Aucun catalogue de votre serveur ne propose encore {extension.packageName}. Ajoutez celui qui le publie : n’ajoutez qu’un catalogue en qui vous avez confiance, ses plugins s’exécutent sur votre serveur.</p>
            <TextField label='Adresse du catalogue' hint='Un fichier manifest.json, joignable par le serveur Jellyfin. Le guide d’installation indique comment en servir un.' type='url'
                placeholder='https://exemple.fr/jellyfin/manifest.json' value={url} disabled={busy} onChange={setUrl} />
            <div className='client-settings-actions'>
                <button type='button' className='client-settings-button-primary' disabled={busy || !url.trim()} onClick={() => { void addAndInstall(); }}>{busy ? 'Installation…' : 'Ajouter le catalogue et installer'}</button>
                <button type='button' className='client-settings-button' disabled={busy} onClick={() => setConfirming(false)}>Annuler</button>
            </div>
        </>;
    }
    return <SettingCard title='Installation' scope='server' aside={<StageBadge stage='missing' />}>
        {body}
        {packages.isError && !offered && <p className='client-setting-note'>Les catalogues n’ont pas pu être lus ; vous pouvez tout de même indiquer l’adresse du catalogue.</p>}
        {problem && <p className='client-setting-note is-error' role='alert'>{problem}</p>}
        {install.isPending && <p className='client-setting-note' role='status'>Le serveur télécharge le plugin, cela peut prendre une minute…</p>}
    </SettingCard>;
}

/** Restarting stops every playback: the count is shown and the action is confirmed first. */
export function RestartCard({ what }: Readonly<{ what: string }>) {
    const [confirming, setConfirming] = useState(false);
    const { playing, restart } = useServerRestart(true);
    const count = playing.data || 0;
    const known = playing.isSuccess;
    return <SettingCard title='Redémarrage nécessaire' aside={<StatusBadge tone='warning'>En attente</StatusBadge>}
        description={`${what} Jellyfin doit redémarrer pour l’activer : le serveur sera indisponible quelques instants.`}>
        {!known && <p className='client-setting-note' role='status'>Le nombre de lectures en cours n’a pas encore pu être vérifié.</p>}
        {playing.isError && <button type='button' className='client-settings-button' onClick={() => { void playing.refetch(); }}>Vérifier les lectures</button>}
        {count > 0 && <p className='client-setting-note is-warning' role='alert'>{count > 1 ? `${count} lectures sont en cours et seront interrompues.` : 'Une lecture est en cours et sera interrompue.'}</p>}
        <div className='client-settings-actions'>
            {confirming ? <>
                <button type='button' className='client-settings-button-primary' disabled={restart.isPending || !known} onClick={() => restart.mutate()}><SettingsIcon name='restart' />{restart.isPending ? 'Redémarrage…' : 'Confirmer le redémarrage'}</button>
                <button type='button' className='client-settings-button' disabled={restart.isPending} onClick={() => setConfirming(false)}>Annuler</button>
            </> : <button type='button' className='client-settings-button-primary' onClick={() => setConfirming(true)}><SettingsIcon name='restart' />Redémarrer Jellyfin</button>}
        </div>
        {restart.isPending && <p className='client-setting-note' role='status'>Le serveur redémarre, cette page se met à jour toute seule.</p>}
        {restart.isError && <p className='client-setting-note is-error' role='alert'>Jellyfin n’est pas revenu à temps. Vérifiez le serveur, puis rechargez la page.</p>}
    </SettingCard>;
}

function DisabledCard({ extension, plugin }: Readonly<{ extension: Extension; plugin: PluginInfo }>) {
    const enable = useEnableExtension();
    return <SettingCard title='Plugin désactivé' description={`${extension.packageName} est installé mais désactivé. Réactivez-le, puis redémarrez Jellyfin.`}>
        <div className='client-settings-actions'>
            <button type='button' className='client-settings-button-primary' disabled={enable.isPending || !plugin.Id || !plugin.Version}
                onClick={() => enable.mutate({ id: plugin.Id!, version: plugin.Version! })}>{enable.isPending ? 'Activation…' : 'Réactiver'}</button>
        </div>
        {enable.isError && <p className='client-setting-note is-error' role='alert'>Le plugin n’a pas pu être réactivé.</p>}
    </SettingCard>;
}

function ProblemCard({ extension, plugin }: Readonly<{ extension: Extension; plugin: PluginInfo }>) {
    const { api } = useApi();
    return <SettingCard title='Le plugin ne fonctionne pas' aside={<StatusBadge tone='error'>{plugin.Status || 'Erreur'}</StatusBadge>}
        description={`${extension.packageName} est installé mais Jellyfin ne l’a pas chargé. C’est souvent une version faite pour une autre version de Jellyfin : mettez-le à jour ou réinstallez-le depuis l’administration.`}>
        {api && <div className='client-settings-actions'><a className='client-settings-button' href={serverInterfaceUrl(api.basePath, 'dashboard/plugins')} target='_blank' rel='noopener noreferrer'>
            <SettingsIcon name='external' />Ouvrir les plugins du serveur</a></div>}
    </SettingCard>;
}

/** Everything before an extension can be configured: install, switch on, restart. */
export default function ExtensionSetup({ extension, stage, plugin }: Readonly<{ extension: Extension; stage?: ExtensionStage; plugin?: PluginInfo }>) {
    if (stage === 'missing') return <InstallCard extension={extension} />;
    if (stage === 'restart') return <RestartCard what={`${extension.packageName} est prêt.`} />;
    if (stage === 'disabled' && plugin) return <DisabledCard extension={extension} plugin={plugin} />;
    if (stage === 'problem' && plugin) return <ProblemCard extension={extension} plugin={plugin} />;
    return null;
}
/* eslint-enable react/jsx-no-bind */
