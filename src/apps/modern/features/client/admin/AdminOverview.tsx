/* eslint-disable react/jsx-no-bind -- Row actions are local closures. */
import type { SessionInfoDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import { formatBitrate, formatSize } from '../mediaInfo';
import { SettingCard, StatusBadge } from '../settings/controls';
import SettingsIcon from '../settings/SettingsIcon';
import { serverAdminUrl } from '../session/ServerInterfacePage';
import ConfirmButton from './ConfirmButton';
import { formatDuration, isRunning, plural, itemTitle, nowPlaying, playMethodLabel, progressShare, relativeTime, severityTone, storageVolumes, transcodeReasons, transcodeSummary, volumeTone } from './model';
import { useAdminSessions, useItemCounts, useRecentActivity, useRestartServer, useStopSession, useStorage, useSystemInfo, useTasks } from './useAdmin';
import './admin.scss';

const ADVANCED = [
    ['dashboard', 'Tableau de bord Jellyfin', 'Tous les réglages du serveur'],
    ['dashboard/users', 'Comptes', 'Contrôle parental, horaires, administrateurs'],
    ['dashboard/libraries', 'Bibliothèques', 'Dossiers, métadonnées, fournisseurs'],
    ['dashboard/playback/transcoding', 'Transcodage', 'Accélération matérielle et qualité'],
    ['dashboard/devices', 'Appareils', 'Appareils connectés et révocation'],
    ['dashboard/logs', 'Fichiers journaux', 'Journaux bruts du serveur'],
    ['dashboard/networking', 'Réseau', 'Adresses, ports, accès distant'],
    ['dashboard/backups', 'Sauvegardes', 'Sauvegarder et restaurer le serveur']
] as const;

function Initial({ name }: Readonly<{ name?: string | null }>) {
    return <span className='client-admin-initial' aria-hidden='true'>{(name || '?').slice(0, 1).toUpperCase()}</span>;
}

function Stream({ session }: Readonly<{ session: SessionInfoDto }>) {
    const stop = useStopSession();
    const [open, setOpen] = useState(false);
    const item = session.NowPlayingItem!;
    const state = session.PlayState;
    const method = state?.PlayMethod;
    const transcoding = method === 'Transcode';
    const reasons = transcodeReasons(session.TranscodingInfo);
    const share = progressShare(state?.PositionTicks, item.RunTimeTicks);
    const bitrate = formatBitrate(session.TranscodingInfo?.Bitrate);
    return <li className='client-admin-stream'>
        <Initial name={session.UserName} />
        <div className='client-admin-stream-body'>
            <div className='client-admin-stream-head'>
                <strong>{itemTitle(item)}</strong>
                <span className='client-admin-badges'>
                    {state?.IsPaused ? <StatusBadge tone='off'>En pause</StatusBadge> : <StatusBadge tone='ok'>Lecture</StatusBadge>}
                    <StatusBadge tone={transcoding ? 'warning' : 'ok'}>{playMethodLabel(method)}</StatusBadge>
                </span>
            </div>
            <small>{[session.UserName, session.DeviceName, session.Client, bitrate].filter(Boolean).join(' · ')}</small>
            <div className='client-admin-progress' role='progressbar' aria-label={`Progression de ${itemTitle(item)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share)}>
                <i style={{ width: `${share}%` }} />
            </div>
            <div className='client-admin-stream-foot'>
                <small>{formatDuration(state?.PositionTicks)} sur {formatDuration(item.RunTimeTicks)}</small>
                <span className='client-admin-row-actions'>
                    {transcoding && <button type='button' className='client-admin-text-button' aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Masquer le détail' : 'Pourquoi ?'}</button>}
                    {session.Id && <ConfirmButton label='Arrêter' confirm='Confirmer l’arrêt' busy={stop.isPending} onConfirm={() => stop.mutate(session.Id!)} />}
                </span>
            </div>
            {open && transcoding && <p className='client-admin-detail'>
                {transcodeSummary(session.TranscodingInfo)}{reasons.length > 0 && <><br />Motif : {reasons.join(', ')}.</>}
            </p>}
        </div>
    </li>;
}

function streamSummary(count: number, transcodes: number) {
    if (!count) return 'Aucune lecture.';
    const detail = transcodes ? `, dont ${transcodes} en transcodage` : '';
    return `${plural(count, 'lecture')}${detail}.`;
}

function otherPaths(paths: string[]) {
    return paths.length > 1 ? ` et ${plural(paths.length - 1, 'autre')}` : '';
}

function Streams() {
    const sessions = useAdminSessions();
    const playing = nowPlaying(sessions.data);
    const transcodes = playing.filter(session => session.PlayState?.PlayMethod === 'Transcode').length;
    return <SettingCard title='En cours de lecture' description={sessions.data && streamSummary(playing.length, transcodes)}
        aside={sessions.isFetching ? <StatusBadge tone='busy'>Actualisation</StatusBadge> : undefined}>
        {sessions.isError && <p className='client-setting-note is-error' role='alert'>Les sessions n’ont pas pu être lues.</p>}
        {sessions.isPending && <p className='client-setting-note'>Chargement…</p>}
        {sessions.data && !playing.length && <p className='client-admin-empty'>Personne ne regarde quelque chose en ce moment.</p>}
        {playing.length > 0 && <ul className='client-admin-list'>{playing.map(session => <Stream key={session.Id} session={session} />)}</ul>}
    </SettingCard>;
}

function Server() {
    const info = useSystemInfo();
    const counts = useItemCounts();
    const restart = useRestartServer();
    const data = info.data;
    return <SettingCard title='Serveur' description={data ? `${data.ServerName || 'Jellyfin'} · version ${data.Version}` : undefined}
        aside={data?.HasPendingRestart ? <StatusBadge tone='warning'>Redémarrage requis</StatusBadge> : data && <StatusBadge tone='ok'>En ligne</StatusBadge>}>
        {info.isError && <p className='client-setting-note is-error' role='alert'>Le serveur ne répond pas.</p>}
        {counts.data && <dl className='client-admin-stats'>
            <div><dt>Films</dt><dd>{counts.data.MovieCount ?? 0}</dd></div>
            <div><dt>Séries</dt><dd>{counts.data.SeriesCount ?? 0}</dd></div>
            <div><dt>Épisodes</dt><dd>{counts.data.EpisodeCount ?? 0}</dd></div>
            <div><dt>Collections</dt><dd>{counts.data.BoxSetCount ?? 0}</dd></div>
        </dl>}
        {data && <div className='client-settings-actions'>
            <ConfirmButton label='Redémarrer le serveur' confirm='Confirmer : toutes les lectures s’arrêtent' busy={restart.isPending} onConfirm={() => restart.mutate()} />
            {restart.isSuccess && <p className='client-save-note' role='status'>Redémarrage demandé. Le serveur revient dans une minute environ.</p>}
            {restart.isError && <p className='client-save-note is-error' role='status'>Le redémarrage n’a pas été accepté.</p>}
        </div>}
    </SettingCard>;
}

function Storage() {
    const storage = useStorage();
    const volumes = storageVolumes(storage.data);
    return <SettingCard title='Stockage'>
        {storage.isError && <p className='client-setting-note'>L’espace disque n’est pas disponible sur ce serveur.</p>}
        {storage.isPending && <p className='client-setting-note'>Chargement…</p>}
        {storage.data && !volumes.length && <p className='client-admin-empty'>Le serveur n’a pas mesuré l’espace de ses disques.</p>}
        <ul className='client-admin-list'>{volumes.map(volume => {
            const tone = volumeTone(volume);
            return <li key={volume.key} className='client-admin-volume'>
                <div className='client-admin-stream-head'>
                    <strong>{volume.uses.slice(0, 4).join(', ')}{volume.uses.length > 4 ? '…' : ''}</strong>
                    <StatusBadge tone={tone}>{formatSize(volume.free)} libres</StatusBadge>
                </div>
                <div className={`client-admin-progress is-${tone}`} role='meter' aria-label={`Espace utilisé : ${volume.uses.join(', ')}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(volume.share)}>
                    <i style={{ width: `${volume.share}%` }} />
                </div>
                <small>{formatSize(volume.used)} utilisés sur {formatSize(volume.total)} · {volume.paths[0]}{otherPaths(volume.paths)}</small>
            </li>;
        })}</ul>
    </SettingCard>;
}

function RunningTasks() {
    const tasks = useTasks();
    const running = (tasks.data || []).filter(isRunning);
    return <SettingCard title='Tâches en cours' aside={<Link className='client-admin-text-button' to='/client?view=settings&section=admin-taches' replace>Toutes les tâches</Link>}>
        {tasks.data && !running.length && <p className='client-admin-empty'>Aucune tâche en cours.</p>}
        <ul className='client-admin-list'>{running.map(task => <li key={task.Id} className='client-admin-volume'>
            <div className='client-admin-stream-head'><strong>{task.Name}</strong><StatusBadge tone='busy'>{Math.round(task.CurrentProgressPercentage || 0)} %</StatusBadge></div>
            <div className='client-admin-progress' role='progressbar' aria-label={task.Name || 'Tâche'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(task.CurrentProgressPercentage || 0)}>
                <i style={{ width: `${task.CurrentProgressPercentage || 0}%` }} />
            </div>
        </li>)}</ul>
    </SettingCard>;
}

function Recent() {
    const recent = useRecentActivity();
    return <SettingCard title='Activité récente' aside={<Link className='client-admin-text-button' to='/client?view=settings&section=admin-journal' replace>Journal complet</Link>}>
        {recent.isError && <p className='client-setting-note is-error' role='alert'>Le journal n’a pas pu être lu.</p>}
        <ul className='client-admin-list is-compact'>{(recent.data || []).map(entry => <li key={entry.Id} className='client-admin-log-line'>
            <i className={`client-admin-dot is-${severityTone(entry.Severity)}`} aria-hidden='true' />
            <span><strong>{entry.Name}</strong><small>{relativeTime(entry.Date)}</small></span>
        </li>)}</ul>
    </SettingCard>;
}

/** Administration, overview: what is happening on the server right now. */
export default function AdminOverview() {
    const { user } = useApi();
    if (!user?.Policy?.IsAdministrator) return null;
    return <div className='client-admin'>
        <Streams />
        <div className='client-admin-columns'>
            <Server />
            <Storage />
        </div>
        <div className='client-admin-columns'>
            <RunningTasks />
            <Recent />
        </div>
        <SettingCard title='Réglages avancés (Jellyfin)' description='Les réglages rares restent dans l’administration d’origine de Jellyfin.'>
            <div className='client-admin-links'>
                {ADVANCED.map(([path, title, hint]) => <a key={path} href={serverAdminUrl(path)}>
                    <span><strong>{title}</strong><small>{hint}</small></span><SettingsIcon name='external' />
                </a>)}
            </div>
        </SettingCard>
    </div>;
}
/* eslint-enable react/jsx-no-bind */
