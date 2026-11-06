/* eslint-disable react/jsx-no-bind -- These controls dispatch local player actions. */
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api';
import type { BaseItemDto, SessionInfoDto } from '@jellyfin/sdk/lib/generated-client';
import type { PlayerState } from 'types/playbackStopInfo';
import { useApi } from 'hooks/useApi';
import { playbackManager } from 'components/playback/playbackmanager';
import { formatTime, SECOND } from './model';

export function SubtitleOffset({ run }: Readonly<{ run: (action: () => unknown) => void }>) {
    const [offset, setOffset] = useState(() => -(playbackManager.getPlayerSubtitleOffset() || 0));
    const change = (value: number) => {
        const next = Math.max(-120, Math.min(120, Math.round(value * 10) / 10));
        setOffset(next);
        run(() => playbackManager.setSubtitleOffset(-next));
    };
    return <section className='client-player-offset' aria-label='Décalage des sous-titres'><h3>Décalage des sous-titres</h3><p>Une valeur positive les affiche plus tard.</p><div><button type='button' aria-label='Sous-titres 0,1 seconde plus tôt' disabled={offset <= -120} onClick={() => change(offset - 0.1)}>−</button><output aria-live='polite'>{offset > 0 ? '+' : ''}{offset.toFixed(1)} s</output><button type='button' aria-label='Sous-titres 0,1 seconde plus tard' disabled={offset >= 120} onClick={() => change(offset + 0.1)}>+</button><button type='button' onClick={() => change(0)}>Réinitialiser</button></div></section>;
}

export function PlayerEpisodes({ item, play }: Readonly<{ item?: BaseItemDto; play: (items: BaseItemDto[], start: number) => void }>) {
    const { api, user, __legacyApiClient__: client } = useApi();
    const [season, setSeason] = useState(item?.SeasonId || '');
    const seasons = useQuery({
        queryKey: ['PlayerSeasons', api?.basePath, user?.Id, item?.SeriesId],
        enabled: !!api && !!user?.Id && !!item?.SeriesId,
        queryFn: async ({ signal }) => (await getShowApi(api!).getSeasons({ seriesId: item!.SeriesId!, userId: user!.Id }, { signal })).data.Items || []
    });
    const selected = season || seasons.data?.[0]?.Id;
    const episodes = useQuery({
        queryKey: ['PlayerEpisodes', api?.basePath, user?.Id, item?.SeriesId, selected],
        enabled: !!api && !!user?.Id && !!item?.SeriesId && !!selected,
        queryFn: async ({ signal }) => (await getShowApi(api!).getEpisodes({ seriesId: item!.SeriesId!, seasonId: selected, userId: user!.Id, isMissing: false }, { signal })).data.Items?.filter(episode => episode.LocationType !== 'Virtual') || []
    });
    if (seasons.isError || episodes.isError) {
        return <div role='alert'><p>Impossible de charger les épisodes.</p><button type='button' onClick={() => {
            void seasons.refetch();
            void episodes.refetch();
        }}>Réessayer</button></div>;
    }
    return <div className='client-player-episodes'><div className='client-player-season-list' aria-label='Saisons'>{seasons.data?.map(value => <button type='button' key={value.Id} aria-pressed={selected === value.Id} onClick={() => setSeason(value.Id || '')}>{value.Name}</button>)}</div>
        {(seasons.isLoading || episodes.isLoading) && <p role='status'>Chargement des épisodes…</p>}
        {episodes.data?.length === 0 && <p>Aucun épisode disponible dans cette saison.</p>}
        {episodes.data?.map((episode, index) => <button type='button' className='client-player-episode' key={episode.Id} aria-current={episode.Id === item?.Id ? 'true' : undefined} onClick={() => play(episodes.data!, index)}>
            {episode.ImageTags?.Primary && client && <img loading='lazy' alt='' src={client.getUrl(`Items/${episode.Id}/Images/Primary`, { maxWidth: 320, tag: episode.ImageTags.Primary })} />}
            <span><small>{episode.Id === item?.Id ? 'EN LECTURE · ' : ''}Épisode {episode.IndexNumber} {episode.UserData?.Played ? '· Vu' : ''}</small><strong>{episode.Name}</strong><small>{episode.RunTimeTicks ? `${Math.round(episode.RunTimeTicks / SECOND / 60)} min` : ''}</small></span>
        </button>)}
    </div>;
}

function bitRate(value?: number | null) {
    return value !== undefined && value !== null && Number.isFinite(value) ? `${(value / 1000000).toFixed(2)} Mbit/s` : 'Non disponible';
}
export function PlayerTechnical({ itemId, state }: Readonly<{ itemId: string; state?: PlayerState }>) {
    const { __legacyApiClient__: client } = useApi();
    const [session, setSession] = useState<SessionInfoDto>();
    const [sample, setSample] = useState({ buffer: undefined as number | undefined, width: 0, height: 0, dropped: undefined as number | undefined, total: undefined as number | undefined, decoded: undefined as number | undefined, network: undefined as number | undefined });
    useEffect(() => {
        let active = true;
        let previous: { bytes: number; time: number; source: string } | undefined;
        const update = () => {
            const video = document.querySelector<HTMLVideoElement>('.videoPlayerContainer video');
            if (!video) return;
            const quality = video.getVideoPlaybackQuality?.();
            let buffer = 0;
            for (let i = 0; i < video.buffered.length; i++) {
                if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) buffer = video.buffered.end(i) - video.currentTime;
            }
            const bytes = (video as HTMLVideoElement & { webkitVideoDecodedByteCount?: number }).webkitVideoDecodedByteCount;
            const now = performance.now();
            const decoded = bytes !== undefined && previous && previous.source === video.currentSrc && bytes >= previous.bytes && now > previous.time ? (bytes - previous.bytes) * 8000 / (now - previous.time) : undefined;
            previous = bytes === undefined ? undefined : { bytes, time: now, source: video.currentSrc };
            // eslint-disable-next-line compat/compat -- Optional timing API; older browsers keep the measurement unavailable.
            const resources = (performance.getEntriesByType?.('resource') || []) as PerformanceResourceTiming[];
            const fragments = itemId ? resources.filter(entry => {
                if (entry.responseEnd < now - 5000 || entry.transferSize <= 0 || entry.duration <= 0) return false;
                const path = new URL(entry.name, window.location.href).pathname.toLowerCase();
                return path.includes(`/videos/${itemId.toLowerCase()}/`) && /\.(?:ts|mp4|m4s)$/.test(path);
            }) : [];
            const transfer = fragments.reduce((sum, entry) => sum + entry.transferSize, 0);
            const elapsed = fragments.reduce((sum, entry) => sum + entry.duration, 0);
            const network = elapsed ? transfer * 8000 / elapsed : undefined;
            setSample({ buffer, width: video.videoWidth, height: video.videoHeight, dropped: quality?.droppedVideoFrames, total: quality?.totalVideoFrames, decoded, network });
        };
        const refreshSession = () => {
            if (!client || !itemId) return;
            client.getSessions({ deviceId: client.deviceId() }).then((sessions: SessionInfoDto[]) => {
                if (active) setSession(sessions.find(value => value.NowPlayingItem?.Id === itemId));
            }).catch(() => { if (active) setSession(undefined); });
        };
        update();
        refreshSession();
        const timer = window.setInterval(update, 1000);
        const serverTimer = window.setInterval(refreshSession, 5000);
        return () => {
            active = false;
            window.clearInterval(timer);
            window.clearInterval(serverTimer);
        };
    }, [client, itemId]);
    const source = state?.MediaSource;
    const transcode = session?.TranscodingInfo;
    const video = source?.MediaStreams?.find(stream => stream.Type === 'Video');
    const rows = [
        ['Méthode', session?.PlayState?.PlayMethod || state?.PlayState?.PlayMethod || 'Non disponible'],
        ['Image affichée', sample.width ? `${sample.width} × ${sample.height}` : 'Non disponible'],
        ['Vidéo source', [video?.Codec, video?.VideoRange].filter(Boolean).join(' · ') || 'Non disponible'],
        ['Conteneur source', source?.Container || 'Non disponible'],
        ['Débit du média', bitRate(source?.Bitrate)],
        ['Débit de sortie serveur', bitRate(transcode?.Bitrate)],
        ['Débit de réception des fragments', bitRate(sample.network)],
        ['Débit vidéo décodé (1 s)', bitRate(sample.decoded)],
        ['Tampon disponible', sample.buffer === undefined ? 'Non disponible' : `${sample.buffer.toFixed(1)} s`],
        ['Images perdues / traitées', sample.dropped === undefined ? 'Non disponible' : `${sample.dropped} / ${sample.total ?? '—'}`],
        ['Transcodage', transcode ? [transcode.VideoCodec, transcode.AudioCodec, transcode.HardwareAccelerationType].filter(Boolean).join(' · ') : 'Aucun signalé'],
        ['Raisons du transcodage', transcode?.TranscodeReasons?.join(', ') || 'Aucune signalée'],
        ['Avancement du transcodage', transcode?.CompletionPercentage == null ? 'Non disponible' : `${transcode.CompletionPercentage.toFixed(1)} %`]
    ];
    return <div className='client-player-technical'><dl>{rows.map(([name, value]) => <React.Fragment key={name}><dt>{name}</dt><dd>{value}</dd></React.Fragment>)}</dl><p className='client-player-hint'>Le média et le serveur annoncent leur débit. Réception sur les fragments des cinq dernières secondes et décodage sur une seconde : mesures disponibles selon le navigateur.</p></div>;
}

export function PlayerHelp() {
    return <dl className='client-player-help'>{[['Espace / K', 'Lecture et pause'], ['← / →', 'Reculer et avancer'], ['↑ / ↓', 'Volume'], ['M', 'Couper ou rétablir le son'], ['F', 'Plein écran'], ['C', 'Sous-titres'], ['Échap', 'Fermer le panneau, sortir du plein écran ou quitter']].map(([key, description]) => <React.Fragment key={key}><dt><kbd>{key}</kbd></dt><dd>{description}</dd></React.Fragment>)}</dl>;
}
export function sleepLabel(deadline?: number) {
    return deadline ? `Arrêt dans ${formatTime(Math.max(0, (deadline - Date.now()) / 1000))}` : 'Minuterie désactivée';
}
/* eslint-enable react/jsx-no-bind */
