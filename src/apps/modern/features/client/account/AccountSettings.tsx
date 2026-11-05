/* eslint-disable react/jsx-no-bind -- Settings use local, typed input handlers. */
import type { UserConfiguration } from '@jellyfin/sdk/lib/generated-client';
import React, { type ReactNode, useRef, useState } from 'react';

import appSettings from 'scripts/settings/appSettings';
import * as userSettings from 'scripts/settings/userSettings';
import { signOut } from '../profiles/profileSession';
import { serverInterfaceUrl } from '../session/ServerInterfacePage';

import { AUDIO_CHANNELS, BITRATES, formatBitrate, languageOptions, NEXT_UP_DAYS, normalizeQuickConnectCode, passwordProblem, avatarProblem, STILL_WATCHING,
    SUBTITLE_MODES, TRANSCODE_AUDIO_CODECS, TRANSCODE_VIDEO_CODECS, VIDEO_WIDTHS } from './accountModel';
import { useAccount } from './useAccount';
import ClientDialog from '../ClientDialog';
import './account.scss';

type Account = ReturnType<typeof useAccount>;
// The retained settings store is untyped JavaScript: each accessor reads with no argument and writes with one.
const device = appSettings as unknown as Record<string, (...value: unknown[]) => unknown>;
const synced = userSettings as unknown as Record<string, (...value: unknown[]) => unknown>;

function SaveStatus({ mutation }: Readonly<{ mutation: { isPending: boolean; isError: boolean; isSuccess: boolean } }>) {
    let text = '';
    if (mutation.isPending) text = 'Enregistrement…';
    else if (mutation.isError) text = 'Le changement n’a pas été enregistré. Réessayez.';
    else if (mutation.isSuccess) text = 'Enregistré';
    return <p className={`client-account-status${mutation.isError ? ' error' : ''}`} role='status'>{text}</p>;
}

function Check({ label, hint, checked, disabled, onChange }: Readonly<{ label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }>) {
    return <label className='client-player-check client-account-check'><input type='checkbox' checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
        <span>{label}{hint && <small>{hint}</small>}</span></label>;
}

function Choice({ label, value, options, disabled, onChange }: Readonly<{ label: string; value: string; options: readonly (readonly [string, string])[]; disabled?: boolean; onChange: (value: string) => void }>) {
    return <label>{label}<select aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}

/** Device settings are read synchronously from storage; local state re-renders after each change. */
function useDeviceSetting<T>(read: () => T, write: (value: T) => void): [T, (value: T) => void] {
    const [value, setValue] = useState(read);
    return [value, next => {
        write(next);
        setValue(read());
    }];
}

function Section({ title, scope, children }: Readonly<{ title: string; scope: string; children: ReactNode }>) {
    return <section className='client-account-section'><header><h2>{title}</h2><span className='client-account-scope'>{scope}</span></header>{children}</section>;
}

function useServerConfiguration(account: Account) {
    const config = account.account.data?.Configuration;
    const save = (patch: Partial<UserConfiguration>) => account.configuration.mutate(patch);
    return { config, save, busy: account.configuration.isPending };
}

function Loading({ account }: Readonly<{ account: Account }>) {
    if (account.account.isError) {
        return <p role='alert'>Les réglages du compte ne peuvent pas être chargés. <button type='button' onClick={() => {
            void account.account.refetch();
        }}>Réessayer</button></p>;
    }
    return <p role='status'>Chargement des réglages du compte…</p>;
}

export function LanguageSettings() {
    const account = useAccount();
    const { config, save, busy } = useServerConfiguration(account);
    if (!config) return <Section title='Langues et lecture' scope='Votre compte'><Loading account={account} /></Section>;
    const languages = languageOptions(account.cultures.data || [], config.AudioLanguagePreference);
    return <Section title='Langues et lecture' scope='Votre compte · tous vos appareils'>
        <div className='client-player-fields'>
            <Choice label='Langue audio préférée' value={config.AudioLanguagePreference || ''} options={languages} disabled={busy} onChange={value => save({ AudioLanguagePreference: value || null })} />
            <Check label='Toujours lire la piste audio par défaut du fichier' hint='Ignore la langue préférée quand le fichier désigne une piste par défaut.' checked={!!config.PlayDefaultAudioTrack} disabled={busy} onChange={value => save({ PlayDefaultAudioTrack: value })} />
            <Check label='Retenir la piste audio choisie' hint='Pour les épisodes suivants de la même série.' checked={!!config.RememberAudioSelections} disabled={busy} onChange={value => save({ RememberAudioSelections: value })} />
            <Check label='Retenir les sous-titres choisis' hint='Pour les épisodes suivants de la même série.' checked={!!config.RememberSubtitleSelections} disabled={busy} onChange={value => save({ RememberSubtitleSelections: value })} />
            <Check label='Enchaîner l’épisode suivant dans les autres applications' hint='Dans ce client, c’est le compte à rebours du Lecteur qui décide.' checked={!!config.EnableNextEpisodeAutoPlay} disabled={busy} onChange={value => save({ EnableNextEpisodeAutoPlay: value })} />
        </div>
        <SaveStatus mutation={account.configuration} />
    </Section>;
}

export function SubtitleSettings() {
    const account = useAccount();
    const { config, save, busy } = useServerConfiguration(account);
    const [burnIn, setBurnIn] = useDeviceSetting(() => device.alwaysBurnInSubtitleWhenTranscoding() as boolean, value => device.alwaysBurnInSubtitleWhenTranscoding(value));
    if (!config) return <Section title='Sous-titres' scope='Votre compte'><Loading account={account} /></Section>;
    const languages = languageOptions(account.cultures.data || [], config.SubtitleLanguagePreference);
    const mode = config.SubtitleMode || 'Default';
    return <Section title='Sous-titres' scope='Votre compte · tous vos appareils'>
        <div className='client-player-fields'>
            <Choice label='Langue des sous-titres préférée' value={config.SubtitleLanguagePreference || ''} options={languages} disabled={busy} onChange={value => save({ SubtitleLanguagePreference: value })} />
            <Check label='Incruster les sous-titres lors d’un transcodage' hint='Sur cet appareil. Évite les décalages, mais oblige le serveur à réencoder la vidéo.' checked={burnIn} onChange={setBurnIn} />
        </div>
        <fieldset className='client-account-modes' disabled={busy}><legend>Activation automatique</legend>
            {SUBTITLE_MODES.map(([id, label, description]) => <button key={id} type='button' aria-pressed={mode === id} onClick={() => save({ SubtitleMode: id })}><strong>{label}</strong><small>{description}</small></button>)}
        </fieldset>
        <p className='client-player-hint'>Taille, fond et position des sous-titres se règlent dans la section Lecteur, plus haut.</p>
        <SaveStatus mutation={account.configuration} />
    </Section>;
}

export function LibrarySettings() {
    const account = useAccount();
    const { config, save, busy } = useServerConfiguration(account);
    const [days, setDays] = useDeviceSetting(() => String(synced.maxDaysForNextUp()), value => synced.maxDaysForNextUp(Number(value)));
    const [rewatching, setRewatching] = useDeviceSetting(() => !!synced.enableRewatchingInNextUp(), value => synced.enableRewatchingInNextUp(value));
    if (!config) return <Section title='Bibliothèque' scope='Votre compte'><Loading account={account} /></Section>;
    return <>
        <Section title='Bibliothèque' scope='Votre compte · tous vos appareils'>
            <div className='client-player-fields'>
                <Check label='Afficher les épisodes manquants' hint='Les épisodes connus mais absents de la bibliothèque apparaissent dans les saisons.' checked={!!config.DisplayMissingEpisodes} disabled={busy} onChange={value => save({ DisplayMissingEpisodes: value })} />
                <Check label='Masquer les titres vus dans les ajouts récents' checked={!!config.HidePlayedInLatest} disabled={busy} onChange={value => save({ HidePlayedInLatest: value })} />
            </div>
            <SaveStatus mutation={account.configuration} />
        </Section>
        <Section title='Continuer à regarder' scope='Cet appareil'>
            <div className='client-player-fields'>
                <Choice label='Proposer les séries commencées depuis' value={NEXT_UP_DAYS.some(([id]) => id === days) ? days : '365'} options={NEXT_UP_DAYS} onChange={setDays} />
                <Check label='Proposer aussi les séries déjà terminées que vous revoyez' checked={rewatching} onChange={setRewatching} />
            </div>
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
    return <Choice label={label} value={value} options={[['auto', 'Automatique'], ...BITRATES.map(entry => [String(entry), formatBitrate(entry)] as [string, string])]} onChange={next => {
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
    return <Section title='Qualité et compatibilité' scope='Cet appareil · s’applique à la prochaine lecture'>
        <div className='client-player-fields'>
            <BitrateChoice remote={false} />
            <BitrateChoice remote />
            <Choice label='Résolution maximale' value={VIDEO_WIDTHS.some(([id]) => id === width) ? width : '0'} options={VIDEO_WIDTHS} onChange={setWidth} />
            <Check label='Limiter aussi la lecture directe à cette résolution' checked={limitResolution} onChange={setLimitResolution} />
            <Choice label='Canaux audio' value={AUDIO_CHANNELS.some(([id]) => id === channels) ? channels : '-1'} options={AUDIO_CHANNELS} onChange={setChannels} />
            <Check label='Mode cinéma' hint='Bandes-annonces et introductions configurées sur le serveur avant un film.' checked={cinema} onChange={setCinema} />
            <Choice label='Demander « Êtes-vous toujours là ? »' value={stillWatching} options={STILL_WATCHING} onChange={setStillWatching} />
        </div>
        <details className='client-account-advanced'><summary>Réglages avancés</summary>
            <div className='client-player-fields'>
                <Choice label='Codec vidéo préféré pour le transcodage' value={videoCodec} options={TRANSCODE_VIDEO_CODECS} onChange={setVideoCodec} />
                <Choice label='Codec audio préféré pour le transcodage' value={audioCodec} options={TRANSCODE_AUDIO_CODECS} onChange={setAudioCodec} />
                <Check label='Préférer le conteneur fMP4 pour le streaming' checked={fmp4} onChange={setFmp4} />
                <Check label='Limiter la durée des segments de streaming' checked={segments} onChange={setSegments} />
                <Check label='Lire le DTS sans conversion' hint='Seulement si votre appareil le décode.' checked={dts} onChange={setDts} />
                <Check label='Lire le Dolby TrueHD sans conversion' hint='Seulement si votre appareil le décode.' checked={trueHd} onChange={setTrueHd} />
                <Check label='Lire la vidéo 10 bits H.264 (Hi10P) sans conversion' checked={hi10p} onChange={setHi10p} />
            </div>
        </details>
    </Section>;
}

function AvatarSettings({ account }: Readonly<{ account: Account }>) {
    const input = useRef<HTMLInputElement>(null);
    const [problem, setProblem] = useState('');
    const user = account.account.data;
    const source = user?.PrimaryImageTag && account.api ? `${account.api.basePath}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}&maxWidth=240&quality=90` : '';
    return <div className='client-account-avatar'>
        {source ? <img src={source} alt='' /> : <span aria-hidden='true'>{user?.Name?.slice(0, 1)}</span>}
        <div><strong>{user?.Name}</strong>
            <div className='client-account-actions'>
                <button type='button' disabled={account.avatar.isPending} onClick={() => input.current?.click()}>Changer la photo</button>
                {source && <button type='button' disabled={account.avatar.isPending} onClick={() => account.avatar.mutate(null)}>Retirer la photo</button>}
            </div>
            <input ref={input} type='file' accept='image/png,image/jpeg,image/webp,image/gif' hidden onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                const error = avatarProblem(file);
                setProblem(error);
                if (!error) account.avatar.mutate(file);
            }} />
            {problem ? <p className='client-account-status error' role='alert'>{problem}</p> : <SaveStatus mutation={account.avatar} />}
        </div>
    </div>;
}

function PasswordSettings({ account }: Readonly<{ account: Account }>) {
    const [fields, setFields] = useState({ current: '', next: '', confirmation: '' });
    const [problem, setProblem] = useState('');
    const field = (key: keyof typeof fields, label: string, autoComplete: string) => <label>{label}<input type='password' autoComplete={autoComplete} value={fields[key]} onChange={event => setFields({ ...fields, [key]: event.target.value })} /></label>;
    return <form className='client-player-fields client-account-password' onSubmit={event => {
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
        <button type='submit' disabled={account.password.isPending}>Changer le mot de passe</button>
        {problem ? <p className='client-account-status error' role='alert'>{problem}</p> : <p className='client-account-status' role='status'>{account.password.isSuccess ? 'Mot de passe changé.' : ''}</p>}
    </form>;
}

function QuickConnectSettings({ account }: Readonly<{ account: Account }>) {
    const [code, setCode] = useState('');
    const [problem, setProblem] = useState('');
    return <form className='client-player-fields client-account-quickconnect' onSubmit={event => {
        event.preventDefault();
        const normalized = normalizeQuickConnectCode(code);
        setProblem(normalized ? '' : 'Le code comporte six chiffres.');
        if (!normalized) return;
        account.authorize.mutate(normalized, {
            onSuccess: () => setCode(''),
            onError: () => setProblem('Ce code est inconnu ou a expiré. Générez-en un nouveau sur l’autre appareil.')
        });
    }}>
        <p className='client-player-hint'>Sur l’appareil à connecter, choisissez Quick Connect : il affiche un code à six chiffres. Saisissez-le ici pour l’ouvrir avec votre compte, sans taper votre mot de passe.</p>
        <label>Code affiché<input inputMode='numeric' autoComplete='one-time-code' maxLength={9} placeholder='123 456' value={code} onChange={event => setCode(event.target.value)} /></label>
        <button type='submit' disabled={account.authorize.isPending}>Autoriser l’appareil</button>
        {problem ? <p className='client-account-status error' role='alert'>{problem}</p> : <p className='client-account-status' role='status'>{account.authorize.isSuccess ? 'Appareil autorisé : il est maintenant connecté.' : ''}</p>}
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
    if (!account.account.data) return <Section title='Profil' scope='Votre compte'><Loading account={account} /></Section>;
    const admin = !!account.account.data.Policy?.IsAdministrator;
    return <>
        <Section title='Profil' scope='Votre compte'><AvatarSettings account={account} /></Section>
        <Section title='Mot de passe' scope='Votre compte'><PasswordSettings account={account} /></Section>
        <Section title='Session' scope='Cet appareil'>
            <div className='client-account-actions'>
                <button type='button' onClick={() => {
                    void signOut(account.api?.basePath, account.account.data?.Id);
                }}>Se déconnecter</button>
                {admin && account.api && <a className='client-button' href={serverInterfaceUrl(account.api.basePath, 'dashboard')} target='_blank' rel='noopener noreferrer'>Administration du serveur ↗</a>}
            </div>
        </Section>
    </>;
}

/* eslint-enable react/jsx-no-bind */
