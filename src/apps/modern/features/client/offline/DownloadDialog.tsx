/* eslint-disable compat/compat -- Offline mode requires modern storage/stream APIs; capability checks and the UI explain unsupported browsers. */
/* eslint-disable react/jsx-no-bind -- Dialog actions are local to this component. */
import type { BaseItemDto, MediaSourceInfo, MediaStream } from '@jellyfin/sdk/lib/generated-client';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import ClientDialog from '../ClientDialog';
import { downloader, type DownloadRequest } from './downloader';
import { formatBytes, qualityOptions, type Quality } from './model';
import { prepareShell } from './shell';
import './offline.scss';

type Seasons = { Id?: string | null; Name?: string | null }[];
const streamLabel = (stream: MediaStream) => stream.DisplayTitle || stream.Title || stream.Language || `Piste ${(stream.Index || 0) + 1}`;

function matchingTrack(media: MediaSourceInfo, type: string, selected?: MediaStream) {
    if (!selected) return undefined;
    const candidates = media.MediaStreams?.filter(stream => stream.Type === type && stream.Language === selected.Language && stream.Codec === selected.Codec) || [];
    return candidates.find(stream => stream.Index === selected.Index && stream.DisplayTitle === selected.DisplayTitle)
        || candidates.find(stream => stream.DisplayTitle === selected.DisplayTitle) || candidates[0];
}

async function json<T>(base: string, path: string, token: string, signal?: AbortSignal): Promise<T> {
    const result = await fetch(`${base}${path}`, { headers: { Authorization: `MediaBrowser Token="${token}"` }, signal });
    if (!result.ok) throw new Error(result.status === 403 ? 'Ce compte n’a pas accès à ces fichiers.' : 'Impossible de préparer les téléchargements. Réessayez.');
    return result.json();
}

export default function DownloadDialog({ item, open, onClose }: Readonly<{ item: BaseItemDto; open: boolean; onClose: () => void }>) {
    return <ClientDialog controlled={{ open, onClose }} label='Télécharger' title='Garder sur cet appareil' subtitle={item.Name || ''}>
        {() => <DownloadForm item={item} onClose={onClose} />}
    </ClientDialog>;
}

function DownloadForm({ item, onClose }: Readonly<{ item: BaseItemDto; onClose: () => void }>) {
    const { api, user } = useApi();
    const [seasons, setSeasons] = useState<Seasons>([]);
    const [season, setSeason] = useState('');
    const [unwatched, setUnwatched] = useState(false);
    const [items, setItems] = useState<BaseItemDto[]>([]);
    const [omitted, setOmitted] = useState<Set<string>>(() => new Set());
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [quality, setQuality] = useState<Quality>('standard');
    const [audio, setAudio] = useState<number>();
    const [subtitle, setSubtitle] = useState(-1);
    const [shell, setShell] = useState(0);
    const [added, setAdded] = useState<number>();
    const series = item.Type === 'Series';
    useEffect(() => {
        if (!series || !api || !user?.Id) return;
        const controller = new AbortController();
        json<{ Items?: Seasons }>(api.basePath, `/Shows/${item.Id}/Seasons?userId=${user.Id}`, api.accessToken || '', controller.signal)
            .then(result => {
                const choices = result.Items || [];
                setSeasons(choices);
                setSeason(choices[0]?.Id || '');
                if (!choices.length) setLoading(false);
            }).catch(reason => {
                if (!controller.signal.aborted) {
                    setError(String(reason.message));
                    setLoading(false);
                }
            });
        return () => controller.abort();
    }, [api, user?.Id, item.Id, series]);
    useEffect(() => {
        if (!api || !user?.Id || (series && !season)) return;
        const controller = new AbortController();
        setLoading(true);
        setError('');
        const path = series ? `/Shows/${item.Id}/Episodes?seasonId=${season}&userId=${user.Id}&Fields=MediaSources,MediaStreams,Overview,CanDownload` : `/Users/${user.Id}/Items/${item.Id}`;
        json<BaseItemDto | { Items: BaseItemDto[] }>(api.basePath, path, api.accessToken || '', controller.signal).then(result => {
            const list = 'Items' in result ? result.Items : [result];
            setItems(list.filter(entry => entry.CanDownload !== false && entry.LocationType !== 'Virtual'));
            setOmitted(new Set());
            setAudio(undefined);
            setSubtitle(-1);
            setLoading(false);
        }).catch(reason => {
            if (!controller.signal.aborted) {
                setError(String(reason.message));
                setLoading(false);
            }
        });
        return () => controller.abort();
    }, [api, user?.Id, item.Id, season, series]);
    const selected = items.filter(entry => (!unwatched || !entry.UserData?.Played) && !omitted.has(entry.Id || ''));
    const source = selected[0]?.MediaSources?.[0];
    const rights = { download: user?.Policy?.EnableContentDownloading === true,
        transcode: user?.Policy?.EnableVideoPlaybackTranscoding === true && user?.Policy?.EnableAudioPlaybackTranscoding === true };
    const canPlay = (mime: string) => !!document.createElement('video').canPlayType(mime);
    const choices = source ? qualityOptions(source, selected[0]?.RunTimeTicks || 0, rights, canPlay) : [];
    const chosen = choices.find(option => option.quality === quality) || choices[0];
    const size = selected.reduce((sum, entry) => sum + (chosen ? qualityOptions(entry.MediaSources?.[0] || {}, entry.RunTimeTicks || 0, rights, canPlay).find(option => option.quality === chosen.quality)?.bytes || 0 : 0), 0);
    const audios = source?.MediaStreams?.filter(stream => stream.Type === 'Audio') || [];
    const subtitles = source?.MediaStreams?.filter(stream => stream.Type === 'Subtitle') || [];
    const enqueue = async () => {
        if (!api || !user?.Id || !chosen || !source || !selected.length) return;
        setBusy(true);
        setError('');
        try {
            await prepareShell(setShell);
            const chosenAudio = audios.find(stream => stream.Index === audio);
            const chosenSubtitle = subtitles.find(stream => stream.Index === subtitle);
            const requests: DownloadRequest[] = selected.map(entry => {
                const media = entry.MediaSources?.[0] as MediaSourceInfo | undefined;
                if (!media?.Id || !qualityOptions(media, entry.RunTimeTicks || 0, rights, canPlay).some(option => option.quality === chosen.quality)) {
                    throw new Error('Cette qualité ne convient pas à tous les épisodes. Choisissez une autre qualité ou un seul épisode.');
                }
                const audioTrack = matchingTrack(media, 'Audio', chosenAudio);
                const subtitleTrack = matchingTrack(media, 'Subtitle', chosenSubtitle);
                if (chosenSubtitle && !subtitleTrack) throw new Error('Les sous-titres choisis manquent dans certains épisodes. Choisissez une autre piste.');
                return { item: entry, quality: chosen.quality, mediaSourceId: media.Id,
                    videoCodec: media.MediaStreams?.find(stream => stream.Type === 'Video')?.Codec || undefined,
                    audioCodec: media.MediaStreams?.find(stream => stream.Type === 'Audio')?.Codec || undefined,
                    sourceSize: media.Size || undefined, audioIndex: chosen.quality === 'original' ? undefined : audioTrack?.Index ?? media.DefaultAudioStreamIndex ?? undefined,
                    subtitleIndex: subtitleTrack?.Index ?? -1, subtitleLabel: subtitleTrack ? streamLabel(subtitleTrack) : undefined,
                    burnSubtitle: !!subtitleTrack && subtitleTrack.IsTextSubtitleStream === false };
            });
            if (chosen.quality === 'original' && requests.some(request => request.burnSubtitle)) throw new Error('Choisissez une qualité convertie pour incruster ces sous-titres.');
            setAdded(await downloader.enqueue(requests));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Le téléchargement n’a pas pu démarrer.');
        } finally {
            setBusy(false);
        }
    };
    const plural = added && added > 1 ? 's' : '';
    const addedMessage = added ? `${added} titre${plural} ajouté${plural}` : 'Déjà dans vos téléchargements';
    if (added !== undefined) return <div className='client-offline-form'><h3>{addedMessage}</h3><p>Gardez cette fenêtre ouverte pendant la préparation. La lecture sera disponible dès que le fichier sera complet.</p><Link className='client-offline-button is-primary' to='/offline' onClick={onClose}>Voir mes téléchargements</Link></div>;
    return <div className='client-offline-form'>
        {series && <><h3>Saison</h3><div className='client-offline-choices'>{seasons.map(entry => <button key={entry.Id} type='button' aria-pressed={season === entry.Id} disabled={busy} onClick={() => setSeason(entry.Id || '')}>{entry.Name}</button>)}</div><div className='client-offline-choices' role='group' aria-label='Épisodes à garder'><button type='button' aria-pressed={!unwatched} onClick={() => setUnwatched(false)}>Toute la saison</button><button type='button' aria-pressed={unwatched} onClick={() => setUnwatched(true)}>Non vus seulement</button></div></>}
        {series && !loading && <details className='client-offline-episode-picker'><summary>Choisir des épisodes</summary><div className='client-offline-choices' role='group' aria-label='Épisodes à télécharger'>{items.filter(entry => !unwatched || !entry.UserData?.Played).map(entry => <button key={entry.Id} type='button' aria-pressed={!omitted.has(entry.Id || '')} onClick={() => setOmitted(current => {
            const next = new Set(current);
            if (next.has(entry.Id || '')) next.delete(entry.Id || '');
            else next.add(entry.Id || '');
            return next;
        })}>Épisode {entry.IndexNumber} · {entry.Name}</button>)}</div></details>}
        {loading ? <p role='status'>Lecture des fichiers disponibles…</p> : <><h3>Qualité</h3><div className='client-offline-choices' role='group' aria-label='Qualité du téléchargement'>{choices.map(option => <button key={option.quality} type='button' disabled={busy} aria-pressed={chosen?.quality === option.quality} onClick={() => setQuality(option.quality)}><strong>{option.label}</strong><small>{option.detail}</small></button>)}</div>
            {!choices.length && <p>Aucun format téléchargeable compatible n’est disponible pour cette sélection. Vérifiez les droits de téléchargement et de conversion du compte.</p>}
            {audios.length > 1 && <><h3>Audio</h3><div className='client-offline-choices' role='group' aria-label='Audio du téléchargement'>{chosen?.quality === 'original' ? <p>La piste par défaut du fichier original sera utilisée.</p> : audios.map(stream => <button key={stream.Index} type='button' aria-pressed={(audio ?? source?.DefaultAudioStreamIndex ?? audios[0]?.Index) === stream.Index} onClick={() => setAudio(stream.Index)}>{streamLabel(stream)}</button>)}</div></>}
            {subtitles.length > 0 && <><h3>Sous-titres</h3><div className='client-offline-choices' role='group' aria-label='Sous-titres du téléchargement'><button type='button' aria-pressed={subtitle === -1} onClick={() => setSubtitle(-1)}>Aucun</button>{subtitles.map(stream => <button type='button' key={stream.Index} aria-pressed={subtitle === stream.Index} onClick={() => setSubtitle(stream.Index ?? -1)}>{streamLabel(stream)}</button>)}</div></>}
            <p>{selected.length} titre{selected.length > 1 ? 's' : ''} · environ {formatBytes(size)}. La conversion peut réduire la qualité et prend du temps sur le serveur.</p></>}
        {error && <p role='alert'>{error}</p>}
        {busy && <p role='status'>{shell < 1 ? `Préparation de l’application… ${Math.round(shell * 100)} %` : 'Ajout à la file…'}</p>}
        <button className='client-offline-button is-primary' type='button' disabled={busy || loading || !chosen || !selected.length} onClick={enqueue}>Télécharger sur cet appareil</button>
        <p className='client-offline-note'>Les fichiers restent privés à ce compte dans ce navigateur. Sur iPad, gardez l’application au premier plan ; le navigateur peut libérer son stockage. Utilisez HTTPS pour pouvoir rouvrir l’application sans connexion.</p>
    </div>;
}
/* eslint-enable react/jsx-no-bind */

/* eslint-enable compat/compat */
