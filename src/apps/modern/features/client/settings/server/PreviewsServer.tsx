/* eslint-disable react/jsx-no-bind -- The form owns its fields. */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { type Option, SaveNote, Segmented, Select, SettingCard, StatusBadge, Toggle } from '../controls';
import ExtensionSetup, { ExtensionHeader } from './ExtensionSetup';
import PreviewScenes from './PreviewScenes';
import { EXTENSIONS } from './extensions';
import { useExtension, useExtensionConfiguration, useExtensionEndpoint } from './useServerExtensions';

const extension = EXTENSIONS.previews;

export type PreviewOptions = { Enabled: boolean; AutomaticScenes: boolean; MaxCacheMiB: number; ReserveFreeMiB: number; Threads: number; IdleDays: number;
    JobTimeoutSeconds: number; PauseDuringPlayback: boolean; Encoder: string };
export const PREVIEW_DEFAULTS: PreviewOptions = { Enabled: true, AutomaticScenes: false, MaxCacheMiB: 2048, ReserveFreeMiB: 2048, Threads: 2, IdleDays: 30,
    JobTimeoutSeconds: 300, PauseDuringPlayback: true, Encoder: 'auto' };

export function readPreviewOptions(raw: Record<string, unknown>): PreviewOptions {
    const stored = (raw.Options && typeof raw.Options === 'object' ? raw.Options : {}) as Partial<PreviewOptions>;
    const result = { ...PREVIEW_DEFAULTS };
    for (const key of Object.keys(PREVIEW_DEFAULTS) as (keyof PreviewOptions)[]) {
        if (typeof stored[key] === typeof PREVIEW_DEFAULTS[key]) (result as Record<string, unknown>)[key] = stored[key];
    }
    return result;
}

const size = (mib: number) => mib >= 1024 ? `${(mib / 1024).toLocaleString('fr-FR')} Go` : `${mib} Mo`;
/** Keeps a value set elsewhere selectable, so opening the page never changes it. */
function withCurrent(options: readonly Option<number>[], current: number, label: (value: number) => string): Option<number>[] {
    return options.some(([value]) => value === current) ? [...options] : [...options, [current, label(current)] as const].sort((a, b) => a[0] - b[0]);
}
const CACHE = [512, 1024, 2048, 4096, 8192, 16384, 32768].map(value => [value, size(value)] as const);
const RESERVE = [1024, 2048, 5120, 10240, 20480].map(value => [value, size(value)] as const);
const DAYS = [[7, '1 semaine'], [14, '2 semaines'], [30, '1 mois'], [90, '3 mois'], [365, '1 an']] as const;
const TIMEOUTS = [[120, '2 minutes'], [300, '5 minutes'], [600, '10 minutes'], [900, '15 minutes']] as const;
const ENCODERS = [['auto', 'Automatique'], ['software', 'Processeur (logiciel)'], ['nvenc', 'NVIDIA (NVENC)'], ['qsv', 'Intel Quick Sync']] as const;

type Capabilities = { Enabled?: boolean; Variants?: string[]; MaxDurationSeconds?: number; SceneApprovalRequired?: boolean };
type Scene = { Approved?: boolean; State?: string; Automatic?: boolean };

function PreviewsStatus() {
    const capabilities = useExtensionEndpoint<Capabilities>(extension, 'NativePreviews/Capabilities', true);
    const scenes = useExtensionEndpoint<Scene[]>(extension, 'NativePreviews/Admin/Scenes', true);
    const list = scenes.data || [];
    const ready = list.filter(scene => scene.State === 'ready').length;
    const failed = list.filter(scene => scene.State === 'failed' || scene.State === 'error').length;
    let badge = <StatusBadge tone='busy'>Vérification…</StatusBadge>;
    if (capabilities.isError) badge = <StatusBadge tone='error'>Ne répond pas</StatusBadge>;
    else if (capabilities.data) badge = capabilities.data.Enabled ? <StatusBadge tone='ok'>Extraits servis</StatusBadge> : <StatusBadge tone='off'>En pause</StatusBadge>;
    return <SettingCard title='État' aside={badge}>
        <dl className='client-setting-facts'>
            <div><dt>Extraits prêts</dt><dd>{scenes.data ? ready : '—'}</dd></div>
            <div><dt>Scènes enregistrées</dt><dd>{scenes.data ? list.length : '—'}</dd></div>
            <div><dt>En échec</dt><dd>{scenes.data ? failed : '—'}</dd></div>
            <div><dt>Durée maximale</dt><dd>{capabilities.data?.MaxDurationSeconds ? `${capabilities.data.MaxDurationSeconds} s` : '—'}</dd></div>
        </dl>
        <p className='client-setting-note'>Chaque utilisateur choisit ensuite dans <Link to='/client?view=settings&section=apparence'>Apparence</Link> s’il veut voir les extraits et entendre leur son.</p>
    </SettingCard>;
}

function PreviewsForm() {
    const { configuration, save } = useExtensionConfiguration(extension, true, readPreviewOptions);
    const [form, setForm] = useState<PreviewOptions>();
    useEffect(() => {
        if (configuration.data) setForm(current => current || configuration.data);
    }, [configuration.data]);
    if (configuration.isError) return <SettingCard title='Réglages'><p className='client-setting-note is-error' role='alert'>Les réglages du plugin n’ont pas pu être lus.</p></SettingCard>;
    if (!form) return <SettingCard title='Réglages'><p role='status'>Chargement des réglages…</p></SettingCard>;
    const set = <K extends keyof PreviewOptions>(key: K) => (value: PreviewOptions[K]) => setForm({ ...form, [key]: value });
    const changed = JSON.stringify(form) !== JSON.stringify(configuration.data);
    return <form onSubmit={event => {
        event.preventDefault();
        save.mutate(current => ({ ...current, Options: { ...(current.Options as object || {}), ...form } }));
    }}>
        <SettingCard title='Préparation des extraits' scope='server'>
            <Toggle label='Préparer et servir les extraits' hint='En pause, les extraits déjà prêts ne sont plus proposés.' checked={form.Enabled} onChange={set('Enabled')} />
            <Toggle label='Choisir les scènes automatiquement' hint='Sinon, seules les scènes validées par un administrateur sont préparées. L’automatique peut révéler une scène importante.' checked={form.AutomaticScenes} onChange={set('AutomaticScenes')} />
            <Toggle label='Faire une pause pendant les lectures' hint='Le serveur garde toute sa puissance pour les films en cours.' checked={form.PauseDuringPlayback} onChange={set('PauseDuringPlayback')} />
            <Select label='Encodeur' hint='Automatique utilise l’accélération matérielle configurée dans Jellyfin quand elle existe.' value={form.Encoder} options={ENCODERS.some(([id]) => id === form.Encoder) ? ENCODERS : [...ENCODERS, [form.Encoder, form.Encoder] as const]} onChange={set('Encoder')} />
            <Segmented label='Threads du processeur par encodage' value={form.Threads} options={[[1, '1'], [2, '2'], [3, '3'], [4, '4']]} onChange={set('Threads')} />
            <Select label='Temps maximum par extrait' value={form.JobTimeoutSeconds} options={withCurrent(TIMEOUTS, form.JobTimeoutSeconds, value => `${value} s`)} onChange={set('JobTimeoutSeconds')} />
        </SettingCard>
        <SettingCard title='Espace disque' scope='server' description='Les extraits sont rangés dans le cache de Jellyfin et se recréent au besoin.'>
            <Select label='Taille maximale du cache' value={form.MaxCacheMiB} options={withCurrent(CACHE, form.MaxCacheMiB, size)} onChange={set('MaxCacheMiB')} />
            <Select label='Espace libre à toujours garder' hint='La préparation s’arrête en dessous.' value={form.ReserveFreeMiB} options={withCurrent(RESERVE, form.ReserveFreeMiB, size)} onChange={set('ReserveFreeMiB')} />
            <Select label='Effacer un extrait non regardé depuis' value={form.IdleDays} options={withCurrent(DAYS, form.IdleDays, value => `${value} jours`)} onChange={set('IdleDays')} />
            <div className='client-settings-actions'>
                <button type='submit' className='client-settings-button-primary' disabled={!changed || save.isPending}>Enregistrer</button>
                <button type='button' className='client-settings-button' disabled={!changed || save.isPending} onClick={() => setForm(configuration.data)}>Annuler les changements</button>
            </div>
            <SaveNote state={save} />
        </SettingCard>
    </form>;
}

export default function PreviewsServer() {
    const { plugin, stage, plugins } = useExtension(extension);
    return <>
        <ExtensionHeader extension={extension} stage={stage} plugin={plugin} error={plugins.isError} />
        <ExtensionSetup extension={extension} stage={stage} plugin={plugin} />
        {stage === 'ready' && <><PreviewsStatus /><PreviewsForm /><PreviewScenes /></>}
    </>;
}
/* eslint-enable react/jsx-no-bind */
