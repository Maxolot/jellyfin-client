/* eslint-disable react/jsx-no-bind -- Settings use local, typed input handlers. */
import type { UserConfiguration } from '@jellyfin/sdk/lib/generated-client';
import React, { type ReactNode, useRef, useState } from 'react';

import appSettings from 'scripts/settings/appSettings';
import * as userSettings from 'scripts/settings/userSettings';
import { signOut } from '../profiles/profileSession';
import { serverInterfaceUrl } from '../session/ServerInterfacePage';
import { Collapsible, SaveNote, Select, SettingCard, type SettingScope, TextField, Toggle } from '../settings/controls';
import SettingsIcon from '../settings/SettingsIcon';

import { AUDIO_CHANNELS, BITRATES, formatBitrate, languageOptions, NEXT_UP_DAYS, normalizeQuickConnectCode, passwordProblem, avatarProblem, STILL_WATCHING,
    SUBTITLE_MODES, TRANSCODE_AUDIO_CODECS, TRANSCODE_VIDEO_CODECS, VIDEO_WIDTHS } from './accountModel';
import { useAccount } from './useAccount';
import ClientDialog from '../ClientDialog';
import './account.scss';

type Account = ReturnType<typeof useAccount>;
// The retained settings store is untyped JavaScript: each accessor reads with no argument and writes with one.
const device = appSettings as unknown as Record<string, (...value: unknown[]) => unknown>;
const synced = userSettings as unknown as Record<string, (...value: unknown[]) => unknown>;

/** Device settings are read synchronously from storage; local state re-renders after each change. */
function useDeviceSetting<T>(read: () => T, write: (value: T) => void): [T, (value: T) => void] {
    const [value, setValue] = useState(read);
    return [value, next => {
        write(next);
        setValue(read());
    }];
}

function Section({ title, scope, description, children }: Readonly<{ title: string; scope: SettingScope; description?: string; children: ReactNode }>) {
    return <SettingCard title={title} scope={scope} description={description}>{children}</SettingCard>;
}

function useServerConfiguration(account: Account) {
    const config = account.account.data?.Configuration;
    const save = (patch: Partial<UserConfiguration>) => account.configuration.mutate(patch);
    return { config, save, busy: account.configuration.isPending };
}

function Loading({ account }: Readonly<{ account: Account }>) {
    if (account.account.isError) {
        return <div className='client-settings-actions'>
            <p className='client-setting-note is-error' role='alert'>Les réglages du compte ne peuvent pas être chargés.</p>
            <button type='button' className='client-settings-button' onClick={() => {
                void account.account.refetch();
            }}>Réessayer</button>
        </div>;
    }
    return <p className='client-setting-note' role='status'>Chargement des réglages du compte…</p>;
}

const pick = <T extends string>(options: readonly (readonly [T, string])[], value: string, fallback: T) => options.find(([id]) => id === value)?.[0] ?? fallback;

export function LanguageSettings() {
    const account = useAccount();
    const { config, save, busy } = useServerConfiguration(account);
    if (!config) return <Section title='Audio' scope='account'><Loading account={account} /></Section>;
    const languages = languageOptions(account.cultures.data || [], config.AudioLanguagePreference);
    return <Section title='Audio' scope='account' description='Vaut pour toutes vos applications Jellyfin.'>
        <Select label='Langue audio préférée' value={config.AudioLanguagePreference || ''} options={languages} disabled={busy} onChange={value => save({ AudioLanguagePreference: value || null })} />
        <Toggle label='Toujours lire la piste audio par défaut du fichier' hint='Ignore la langue préférée quand le fichier désigne une piste par défaut.' checked={!!config.PlayDefaultAudioTrack} disabled={busy} onChange={value => save({ PlayDefaultAudioTrack: value })} />
        <Toggle label='Retenir la piste audio choisie' hint='Pour les épisodes suivants de la même série.' checked={!!config.RememberAudioSelections} disabled={busy} onChange={value => save({ RememberAudioSelections: value })} />
        <Toggle label='Retenir les sous-titres choisis' hint='Pour les épisodes suivants de la même série.' checked={!!config.RememberSubtitleSelections} disabled={busy} onChange={value => save({ RememberSubtitleSelections: value })} />
        <Toggle label='Enchaîner l’épisode suivant dans les autres applications' hint='Ici, c’est le réglage « Épisode suivant » du Lecteur qui décide.' checked={!!config.EnableNextEpisodeAutoPlay} disabled={busy} onChange={value => save({ EnableNextEpisodeAutoPlay: value })} />
        <SaveNote state={account.configuration} />
    </Section>;
}

export function SubtitleSettings() {
    const account = useAccount();
    const { config, save, busy } = useServerConfiguration(account);
    const [burnIn, setBurnIn] = useDeviceSetting(() => device.alwaysBurnInSubtitleWhenTranscoding() as boolean, value => device.alwaysBurnInSubtitleWhenTranscoding(value));
    if (!config) return <Section title='Sous-titres' scope='account'><Loading account={account} /></Section>;
    const languages = languageOptions(account.cultures.data || [], config.SubtitleLanguagePreference);
    const mode = config.SubtitleMode || 'Default';
    return <>
        <Section title='Sous-titres' scope='account' description='Vaut pour toutes vos applications Jellyfin.'>
            <Select label='Langue des sous-titres préférée' value={config.SubtitleLanguagePreference || ''} options={languages} disabled={busy} onChange={value => save({ SubtitleLanguagePreference: value })} />
            <Select label='Activation automatique' hint={SUBTITLE_MODES.find(([id]) => id === mode)?.[2]} value={mode} disabled={busy}
                options={SUBTITLE_MODES.map(([id, label]) => [id, label] as const)} onChange={value => save({ SubtitleMode: value })} />
            <SaveNote state={account.configuration} />
            <p className='client-setting-note'>Taille, fond et position des sous-titres se règlent dans la section Lecteur.</p>
        </Section>
        <Section title='Sous-titres sur cet appareil' scope='device'>
            <Toggle label='Incruster les sous-titres lors d’un transcodage' hint='Évite les décalages, mais oblige le serveur à réencoder la vidéo.' checked={burnIn} onChange={setBurnIn} />
        </Section>
    </>;
}

export function LibrarySettings() {
    const account = useAccount();
    const { config, save, busy } = useServerConfiguration(account);
    const [days, setDays] = useDeviceSetting(() => String(synced.maxDaysForNextUp()), value => synced.maxDaysForNextUp(Number(value)));
    const [rewatching, setRewatching] = useDeviceSetting(() => !!synced.enableRewatchingInNextUp(), value => synced.enableRewatchingInNextUp(value));
    if (!config) return <Section title='Bibliothèque' scope='account'><Loading account={account} /></Section>;
    return <>
        <Section title='Bibliothèque' scope='account'>
            <Toggle label='Afficher les épisodes manquants' hint='Les épisodes connus mais absents de la bibliothèque apparaissent dans les saisons.' checked={!!config.DisplayMissingEpisodes} disabled={busy} onChange={value => save({ DisplayMissingEpisodes: value })} />
            <Toggle label='Masquer les titres vus dans les ajouts récents' checked={!!config.HidePlayedInLatest} disabled={busy} onChange={value => save({ HidePlayedInLatest: value })} />
            <SaveNote state={account.configuration} />
        </Section>
        <Section title='Continuer à regarder' scope='device'>
            <Select label='Proposer les séries commencées depuis' value={pick(NEXT_UP_DAYS, days, '365')} options={NEXT_UP_DAYS} onChange={setDays} />
            <Toggle label='Proposer aussi les séries terminées que vous revoyez' checked={rewatching} onChange={setRewatching} />
        </Section>
    </>;
}

function BitrateChoice({ remote }: Readonly<{ remote: boolean }>) {
    const isInNetwork = !remote;
    const [auto, setAuto] = useDeviceSetting(() => device.enableAutomaticBitrateDetection(isInNetwork, 'Video') as boolean,
        value => device.enableAutomaticBitrateDetection(isInNetwork, 'Video', value));
    const [bitrate, setBitrate] = useDeviceSetting(() => device.maxStreamingBitrate(isInNetwork, 'Video') as number,
        value => device.maxStreamingBitrate(isInNetwork, 'Video', value));
    const value = auto ? 'auto' : String(BITRATES.find(entry => entry <= bitrate) || BITRATES[BITRATES.length - 1]);
    const label = remote ? 'Qualité hors du réseau local' : 'Qualité sur le réseau local';
    return <Select label={label} value={value} options={[['auto', 'Automatique'], ...BITRATES.map(entry => [String(entry), formatBitrate(entry)] as const)]} onChange={next => {
        if (next === 'auto') {
            setAuto(true);
            return;
        }
        setBitrate(Number(next));
        setAuto(false);
    }} />;
}

export function DeviceSettings() {
    const [width, setWidth] = useDeviceSetting(() => String(device.maxVideoWidth()), value => device.maxVideoWidth(Number(value)));
    const [limitResolution, setLimitResolution] = useDeviceSetting(() => device.limitSupportedVideoResolution() as boolean, value => device.limitSupportedVideoResolution(value));
    const [channels, setChannels] = useDeviceSetting(() => String(synced.allowedAudioChannels()), value => synced.allowedAudioChannels(value));
    const [cinema, setCinema] = useDeviceSetting(() => !!synced.enableCinemaMode(), value => synced.enableCinemaMode(value));
    const [stillWatching, setStillWatching] = useDeviceSetting(() => String(synced.stillWatchingPrompt()), value => synced.stillWatchingPrompt(value));
    const [fmp4, setFmp4] = useDeviceSetting(() => !!synced.preferFmp4HlsContainer(), value => synced.preferFmp4HlsContainer(value));
    const [segments, setSegments] = useDeviceSetting(() => !!synced.limitSegmentLength(), value => synced.limitSegmentLength(value));
    const [dts, setDts] = useDeviceSetting(() => device.enableDts() as boolean, value => device.enableDts(value));
    const [trueHd, setTrueHd] = useDeviceSetting(() => device.enableTrueHd() as boolean, value => device.enableTrueHd(value));
    const [hi10p, setHi10p] = useDeviceSetting(() => device.enableHi10p() as boolean, value => device.enableHi10p(value));
    const [videoCodec, setVideoCodec] = useDeviceSetting(() => String(device.preferredTranscodeVideoCodec() || ''), value => device.preferredTranscodeVideoCodec(value));
    const [audioCodec, setAudioCodec] = useDeviceSetting(() => String(device.preferredTranscodeVideoAudioCodec() || ''), value => device.preferredTranscodeVideoAudioCodec(value));
    return <>
        <Section title='Qualité de lecture' scope='device' description='S’applique à la prochaine lecture.'>
            <BitrateChoice remote={false} />
            <BitrateChoice remote />
            <Select label='Résolution maximale' value={pick(VIDEO_WIDTHS, width, '0')} options={VIDEO_WIDTHS} onChange={setWidth} />
            <Toggle label='Limiter aussi la lecture directe à cette résolution' checked={limitResolution} onChange={setLimitResolution} />
            <Select label='Canaux audio' value={pick(AUDIO_CHANNELS, channels, '-1')} options={AUDIO_CHANNELS} onChange={setChannels} />
        </Section>
        <Section title='Pendant la lecture' scope='device'>
            <Toggle label='Mode cinéma' hint='Bandes-annonces et introductions configurées sur le serveur avant un film.' checked={cinema} onChange={setCinema} />
            <Select label='Demander « Êtes-vous toujours là ? »' value={pick(STILL_WATCHING, stillWatching, 'default')} options={STILL_WATCHING} onChange={setStillWatching} />
        </Section>
        <Section title='Compatibilité' scope='device' description='À changer seulement si une lecture échoue, ou si votre matériel décode ces formats.'>
            <Collapsible title='Réglages avancés'>
                <Select label='Codec vidéo préféré pour le transcodage' value={videoCodec} options={TRANSCODE_VIDEO_CODECS} onChange={setVideoCodec} />
                <Select label='Codec audio préféré pour le transcodage' value={audioCodec} options={TRANSCODE_AUDIO_CODECS} onChange={setAudioCodec} />
                <Toggle label='Préférer le conteneur fMP4 pour le streaming' checked={fmp4} onChange={setFmp4} />
                <Toggle label='Limiter la durée des segments de streaming' checked={segments} onChange={setSegments} />
                <Toggle label='Lire le DTS sans conversion' hint='Seulement si votre appareil le décode.' checked={dts} onChange={setDts} />
                <Toggle label='Lire le Dolby TrueHD sans conversion' hint='Seulement si votre appareil le décode.' checked={trueHd} onChange={setTrueHd} />
                <Toggle label='Lire la vidéo 10 bits H.264 (Hi10P) sans conversion' checked={hi10p} onChange={setHi10p} />
            </Collapsible>
        </Section>
    </>;
}

function AvatarSettings({ account }: Readonly<{ account: Account }>) {
    const input = useRef<HTMLInputElement>(null);
    const [problem, setProblem] = useState('');
    const user = account.account.data;
    const source = user?.PrimaryImageTag && account.api ? `${account.api.basePath}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}&maxWidth=240&quality=90` : '';
    return <div className='client-account-avatar'>
        {source ? <img src={source} alt='' /> : <span aria-hidden='true'>{user?.Name?.slice(0, 1)}</span>}
        <div><strong>{user?.Name}</strong>
            {user?.Policy?.IsAdministrator && <small>Administrateur du serveur</small>}
            <div className='client-settings-actions'>
                <button type='button' className='client-settings-button' disabled={account.avatar.isPending} onClick={() => input.current?.click()}>Changer la photo</button>
                {source && <button type='button' className='client-settings-button' disabled={account.avatar.isPending} onClick={() => account.avatar.mutate(null)}>Retirer la photo</button>}
            </div>
            <input ref={input} type='file' accept='image/png,image/jpeg,image/webp,image/gif' hidden onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                const error = avatarProblem(file);
                setProblem(error);
                if (!error) account.avatar.mutate(file);
            }} />
            {problem ? <p className='client-setting-note is-error' role='alert'>{problem}</p> : <SaveNote state={account.avatar} />}
        </div>
    </div>;
}

function PasswordSettings({ account }: Readonly<{ account: Account }>) {
    const [fields, setFields] = useState({ current: '', next: '', confirmation: '' });
    const [problem, setProblem] = useState('');
    const field = (key: keyof typeof fields, label: string, autoComplete: string) => <TextField label={label} type='password' autoComplete={autoComplete} value={fields[key]}
        onChange={value => setFields({ ...fields, [key]: value })} />;
    return <form className='client-account-form' onSubmit={event => {
        event.preventDefault();
        const error = passwordProblem(fields.current, fields.next, fields.confirmation, false);
        setProblem(error);
        if (error) return;
        account.password.mutate({ current: fields.current, next: fields.next }, {
            onSuccess: () => setFields({ current: '', next: '', confirmation: '' }),
            onError: () => setProblem('Le mot de passe n’a pas été changé. Vérifiez votre mot de passe actuel.')
        });
    }}>
        {field('current', 'Mot de passe actuel (vide si vous n’en avez pas)', 'current-password')}
        {field('next', 'Nouveau mot de passe', 'new-password')}
        {field('confirmation', 'Confirmer le nouveau mot de passe', 'new-password')}
        <div className='client-settings-actions'><button type='submit' className='client-settings-button-primary' disabled={account.password.isPending}>Changer le mot de passe</button></div>
        {problem ? <p className='client-setting-note is-error' role='alert'>{problem}</p> : <p className='client-setting-note is-ok' role='status'>{account.password.isSuccess ? 'Mot de passe changé.' : ''}</p>}
    </form>;
}

function QuickConnectSettings({ account }: Readonly<{ account: Account }>) {
    const [code, setCode] = useState('');
    const [problem, setProblem] = useState('');
    return <form className='client-controls client-account-form' onSubmit={event => {
        event.preventDefault();
        const normalized = normalizeQuickConnectCode(code);
        setProblem(normalized ? '' : 'Le code comporte six chiffres.');
        if (!normalized) return;
        account.authorize.mutate(normalized, {
            onSuccess: () => setCode(''),
            onError: () => setProblem('Ce code est inconnu ou a expiré. Générez-en un nouveau sur l’autre appareil.')
        });
    }}>
        <p className='client-setting-note'>Sur l’appareil à connecter, choisissez Quick Connect : il affiche un code à six chiffres. Saisissez-le ici pour l’ouvrir avec votre compte, sans taper votre mot de passe.</p>
        <TextField label='Code affiché' inputMode='numeric' autoComplete='one-time-code' maxLength={9} placeholder='123 456' value={code} onChange={setCode} />
        <div className='client-settings-actions'><button type='submit' className='client-settings-button-primary' disabled={account.authorize.isPending}>Autoriser l’appareil</button></div>
        {problem ? <p className='client-setting-note is-error' role='alert'>{problem}</p> : <p className='client-setting-note is-ok' role='status'>{account.authorize.isSuccess ? 'Appareil autorisé : il est maintenant connecté.' : ''}</p>}
    </form>;
}

/** Profile menu entry: authorizing another device is a quick action, not a setting. */
export function QuickConnectMenuItem() {
    const account = useAccount();
    if (account.quickConnect.data === false) return null;
    return <ClientDialog label='Quick Connect' title='Connecter un autre appareil' buttonClassName='client-profile-action'><QuickConnectSettings account={account} /></ClientDialog>;
}

export function ProfileSettings() {
    const account = useAccount();
    if (!account.account.data) return <Section title='Profil' scope='account'><Loading account={account} /></Section>;
    const admin = !!account.account.data.Policy?.IsAdministrator;
    return <>
        <Section title='Profil' scope='account'><AvatarSettings account={account} /></Section>
        <Section title='Mot de passe' scope='account'><PasswordSettings account={account} /></Section>
        {account.quickConnect.data !== false && <Section title='Connecter un autre appareil' scope='account'><QuickConnectSettings account={account} /></Section>}
        <Section title='Session' scope='device'>
            <div className='client-settings-actions'>
                <button type='button' className='client-settings-button client-settings-button-danger' onClick={() => {
                    void signOut(account.api?.basePath, account.account.data?.Id);
                }}>Se déconnecter</button>
                {admin && account.api && <a className='client-settings-button' href={serverInterfaceUrl(account.api.basePath, 'dashboard')} target='_blank' rel='noopener noreferrer'><SettingsIcon name='external' />Administration du serveur</a>}
            </div>
        </Section>
    </>;
}

/* eslint-enable react/jsx-no-bind */
