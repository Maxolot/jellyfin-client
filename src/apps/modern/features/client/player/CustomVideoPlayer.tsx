/* eslint-disable react/jsx-no-bind -- Player controls dispatch their own typed actions. */
import React, { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BaseItemDto, MediaSegmentDto, MediaStream } from '@jellyfin/sdk/lib/generated-client';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getMediaSegmentApi } from '@jellyfin/sdk/lib/utils/api/media-segment-api';
import { useQueryClient } from '@tanstack/react-query';
import Page from 'components/Page';
import { playbackManager } from 'components/playback/playbackmanager';
import { customVideoPresentation } from 'components/playback/customVideoPresentation';
import { setBackdropTransparency, TRANSPARENCY_LEVEL } from 'components/backdrop/backdrop';
import shell from 'scripts/shell';
import { useApi } from 'hooks/useApi';
import Events, { type Event as PlaybackEvent } from 'utils/events';
import type { PlaybackStopInfo } from 'types/playbackStopInfo';
import ClientIcon from '../ClientIcon';
import { PlayerPreferenceFields } from './PlayerSettings';
import { playerPreferenceKey, usePlayerPreferences } from './preferences';
import { activeSegment, clampSeek, formatTime, SECOND, trickplayTile } from './model';
import { usePlaybackSnapshot } from './usePlaybackSnapshot';
import './player.scss';
import { isPlayingOffline } from '../offline/playback';

type Panel = 'audio' | 'subtitles' | 'chapters' | 'settings' | 'appearance';
const segmentLabels: Record<string, string> = { Intro: 'Passer l’intro', Recap: 'Passer le récapitulatif', Outro: 'Passer le générique' };
const panelNames = { audio: 'Pistes audio', subtitles: 'Sous-titres', chapters: 'Chapitres', settings: 'Lecture', appearance: 'Personnaliser le lecteur' };
function TrackName({ track }: Readonly<{ track: MediaStream }>) {
    return <span>{track.DisplayTitle || track.Title || track.Language || `Piste ${(track.Index || 0) + 1}`}</span>;
}
function PlayerGlyph({ name }: Readonly<{ name: string }>) {
    const paths: Record<string, string> = {
        play: 'M8 5v14l11-7Z', pause: 'M8 5v14M16 5v14', rewind: 'M4 10a8 8 0 1 1 1 8M4 4v6h6', forward: 'M20 10a8 8 0 1 0-1 8M20 4v6h-6',
        subtitles: 'M3 5h18v14H3ZM10 10H7v4h3M17 10h-3v4h3', audio: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-3-3h3M21 16a3 3 0 1 1-3-3h3',
        fullscreen: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5', pip: 'M3 4h18v16H3ZM12 12h7v6h-7Z',
        chapters: 'M4 5h16M4 12h16M4 19h16', settings: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6'
    };
    return <svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'><path d={paths[name] || paths.settings} /></svg>;
}
// eslint-disable-next-line sonarjs/cognitive-complexity -- Capability-gated controls share one playback snapshot.
export default function CustomVideoPlayer() {
    const { api, user, __legacyApiClient__: client } = useApi();
    const navigate = useNavigate();
    const cache = useQueryClient();
    const snapshot = usePlaybackSnapshot();
    const [preferences, savePreferences] = usePlayerPreferences(playerPreferenceKey(api?.basePath || '', user?.Id || ''));
    const [visible, setVisible] = useState(true);
    const [panel, setPanel] = useState<Panel>();
    const [details, setDetails] = useState<{ id: string; item: BaseItemDto; segments: MediaSegmentDto[] }>();
    const [error, setError] = useState('');
    const [cancelledFor, setCancelledFor] = useState('');
    const [hover, setHover] = useState<number>();
    const [scrub, setScrub] = useState<number>();
    const [notice, setNotice] = useState('');
    const [ended, setEnded] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const dialog = useRef<HTMLDialogElement>(null);
    const activity = useRef(Date.now());
    const keyboardFocus = useRef(false);
    const leaving = useRef(false);
    const lifecycle = useRef<object>();
    const skipped = useRef(new Set<string>());
    const lastTouch = useRef({ time: 0, side: 0 });
    const latest = useRef({ preferences, snapshot, panel, cache, server: api?.basePath, userId: user?.Id });
    latest.current = { preferences, snapshot, panel, cache, server: api?.basePath, userId: user?.Id };
    const itemId = snapshot?.item?.Id || '';
    const item = details?.id === itemId ? details.item : snapshot?.item;
    const segments = details?.id === itemId ? details.segments : [];
    const playState = snapshot?.state.PlayState;
    const position = (playState?.PositionTicks || 0) / SECOND;
    const duration = snapshot?.duration || 0;
    const paused = playState?.IsPaused !== false;
    const hasPlayer = !!snapshot && !ended;
    const canSeek = hasPlayer && playState?.CanSeek === true && duration > 0;
    const next = snapshot?.next;
    const nextCancelled = cancelledFor === itemId;
    const secondsLeft = Math.max(0, duration - position);
    const showNext = hasPlayer && item?.Type === 'Episode' && !!next && !nextCancelled && secondsLeft <= Math.max(30, preferences.next) && duration > 0;
    const segment = activeSegment(segments, position);
    const commands: string[] = hasPlayer ? playbackManager.getSupportedCommands() : [];
    const wake = useCallback(() => {
        activity.current = Date.now();
        setVisible(true);
    }, []);
    const action = useCallback((run: () => unknown) => {
        setError('');
        try {
            Promise.resolve(run()).catch(() => setError('Cette commande n’a pas abouti. Réessayez.'));
        } catch { setError('Cette commande n’est pas disponible pour le moment.'); }
        wake();
    }, [wake]);
    const seek = (seconds: number) => {
        if (canSeek) action(() => playbackManager.seek(clampSeek(seconds, duration) * SECOND));
    };
    const jump = (offset: number) => {
        seek(position + offset);
        setNotice(`${offset > 0 ? '+' : '−'} ${Math.abs(offset)} s`);
    };
    const leave = useCallback(() => {
        leaving.current = true;
        const offline = isPlayingOffline();
        if (playbackManager.isPlayingVideo()) playbackManager.stop();
        if (window.history.state?.idx > 0) navigate(-1);
        else navigate(offline ? '/offline' : '/client', { replace: true });
    }, [navigate]);
    useEffect(() => {
        // Defer final cleanup so React StrictMode's setup/cleanup rehearsal cannot stop playback.
        leaving.current = false;
        const owner = {};
        lifecycle.current = owner;
        customVideoPresentation.active = true;
        document.documentElement.classList.add('client-video-active');
        setBackdropTransparency(TRANSPARENCY_LEVEL.Full);
        shell.enableFullscreen();
        const onStop = (_event: PlaybackEvent, info: PlaybackStopInfo) => {
            const identity = latest.current;
            if (identity.server && identity.userId) {
                const stoppedItem = info.state.NowPlayingItem;
                if (stoppedItem?.Id) identity.cache.removeQueries({ queryKey: ['Client', identity.server, identity.userId, 'Detail', stoppedItem.Id], exact: true });
                void identity.cache.invalidateQueries({ queryKey: ['Client', identity.server, identity.userId] });
            }
            if (info.nextMediaType !== 'Video' && !leaving.current) {
                setEnded(true);
                setVisible(true);
            }
        };
        const onError = () => {
            setError('La lecture a été interrompue. Vous pouvez réessayer ou revenir à la fiche.');
            setEnded(true);
            setVisible(true);
        };
        Events.on(playbackManager, 'playbackstop', onStop);
        Events.on(playbackManager, 'playbackerror', onError);
        return () => {
            Events.off(playbackManager, 'playbackstop', onStop);
            Events.off(playbackManager, 'playbackerror', onError);
            void Promise.resolve().then(() => {
                if (lifecycle.current !== owner) return;
                document.documentElement.classList.remove('client-video-active');
                customVideoPresentation.active = false;
                customVideoPresentation.autoNext = true;
                setBackdropTransparency(TRANSPARENCY_LEVEL.None);
                shell.disableFullscreen();
                if (!leaving.current && playbackManager.isPlayingVideo()) playbackManager.stop();
            });
        };
    }, []);
    useEffect(() => {
        customVideoPresentation.autoNext = preferences.next > 0 && !nextCancelled;
    }, [preferences.next, nextCancelled]);
    useEffect(() => {
        setEnded(false);
        skipped.current.clear();
    }, [itemId]);
    useEffect(() => {
        if (!api || !user?.Id || !itemId) return;
        let active = true;
        Promise.all([
            getLibraryApi(api).getItem({ userId: user.Id, itemId }).then(result => result.data),
            getMediaSegmentApi(api).getItemSegments({ itemId }).then(result => result.data.Items || []).catch(() => [])
        ]).then(([fullItem, mediaSegments]) => {
            if (active) setDetails({ id: itemId, item: fullItem, segments: mediaSegments });
        }).catch(() => { /* Basic playback does not depend on optional metadata. */ });
        return () => {
            active = false;
        };
    }, [api, user?.Id, itemId]);
    useEffect(() => {
        if (preferences.intro !== 'auto' || paused || segment?.Type !== 'Intro' || !segment.EndTicks || !canSeek) return;
        const key = `${itemId}-${segment.StartTicks}`;
        if (skipped.current.has(key)) return;
        skipped.current.add(key);
        action(() => playbackManager.seek(segment.EndTicks));
    }, [preferences.intro, segment, paused, itemId, canSeek, action]);
    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(''), 1200);
        return () => window.clearTimeout(timer);
    }, [notice]);
    useEffect(() => {
        const timer = window.setInterval(() => {
            const focusInside = keyboardFocus.current && root.current?.contains(document.activeElement) && document.activeElement !== root.current;
            if (Date.now() - activity.current > latest.current.preferences.hideAfter * 1000 && !latest.current.panel && !latest.current.snapshot?.state.PlayState.IsPaused && !focusInside) setVisible(false);
        }, 500);
        return () => window.clearInterval(timer);
    }, []);
    useEffect(() => {
        const keydown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
            keyboardFocus.current = true;
            wake();
            const target = event.target as HTMLElement;
            if (target.closest('input, select, textarea, button:not(.client-player-surface), a, [contenteditable=true], dialog')) return;
            const current = latest.current;
            if (!current.snapshot || current.panel) return;
            const state = current.snapshot.state.PlayState;
            const player = playbackManager.getCurrentPlayer();
            if (!player || !playbackManager.isPlayingVideo(player)) return;
            const key = event.key.toLowerCase();
            const offset = key === 'arrowleft' ? -current.preferences.skip : current.preferences.skip;
            if (key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                action(() => playbackManager.playPause());
                return;
            }
            const shortcuts: Record<string, () => unknown> = { k: () => playbackManager.playPause(),
                arrowleft: () => state.CanSeek && playbackManager.seek(clampSeek((state.PositionTicks || 0) / SECOND + offset, current.snapshot?.duration || 0) * SECOND),
                arrowright: () => state.CanSeek && playbackManager.seek(clampSeek((state.PositionTicks || 0) / SECOND + offset, current.snapshot?.duration || 0) * SECOND),
                arrowup: () => playbackManager.setVolume(Math.min(100, (state.VolumeLevel || 0) + 5)),
                arrowdown: () => playbackManager.setVolume(Math.max(0, (state.VolumeLevel || 0) - 5)),
                m: () => playbackManager.toggleMute(), f: () => playbackManager.toggleFullscreen(),
                c: () => {
                    const tracks = playbackManager.subtitleTracks();
                    if (tracks.length) return playbackManager.setSubtitleStreamIndex((state.SubtitleStreamIndex ?? -1) < 0 ? tracks[0].Index : -1);
                }, escape: () => playbackManager.isFullscreen() ? playbackManager.toggleFullscreen() : leave()
            };
            if (shortcuts[key]) {
                event.preventDefault();
                event.stopPropagation();
                action(shortcuts[key]);
            }
        };
        document.addEventListener('keydown', keydown);
        return () => document.removeEventListener('keydown', keydown);
    }, [action, leave, wake]);
    useEffect(() => {
        if (!panel) return;
        const element = dialog.current;
        element?.showModal();
        return () => element?.close();
    }, [panel]);
    useEffect(() => {
        const video = document.querySelector<HTMLVideoElement>('.videoPlayerContainer video');
        if (!video) return;
        const positions = new Map<VTTCue, { line: VTTCue['line']; snap: boolean }>();
        const apply = () => {
            for (const track of Array.from(video.textTracks)) {
                for (const cue of Array.from(track.cues || [])) {
                    if (!('line' in cue)) continue;
                    const textCue = cue as VTTCue;
                    if (!positions.has(textCue)) positions.set(textCue, { line: textCue.line, snap: textCue.snapToLines });
                    textCue.snapToLines = false;
                    textCue.line = 100 - preferences.subtitlePosition;
                }
            }
        };
        apply();
        video.textTracks.addEventListener('change', apply);
        video.addEventListener('timeupdate', apply);
        return () => {
            video.textTracks.removeEventListener('change', apply);
            video.removeEventListener('timeupdate', apply);
            positions.forEach((original, cue) => {
                cue.line = original.line;
                cue.snapToLines = original.snap;
            });
        };
    }, [preferences.subtitlePosition, itemId, playState?.SubtitleStreamIndex, playState?.MediaSourceId]);
    const openPanel = (name: Panel) => {
        setPanel(name);
        wake();
    };
    const button = (label: string, glyph: string, run: () => unknown, disabled = false) => <button type='button' title={label} aria-label={label} disabled={disabled} onClick={() => action(run)}><PlayerGlyph name={glyph} /></button>;
    const audio: MediaStream[] = hasPlayer ? playbackManager.audioTracks() : [];
    const subtitles: MediaStream[] = hasPlayer ? playbackManager.subtitleTracks() : [];
    const chapters = item?.Chapters || [];
    const displayPosition = scrub ?? position;
    const endTime = new Date(Date.now() + secondsLeft / (playState?.PlaybackRate || 1) * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const alternateTime = preferences.time === 'end' ? `Fin à ${endTime}` : `− ${formatTime(secondsLeft)}`;
    const timeLabel = preferences.time === 'total' ? formatTime(duration) : alternateTime;
    const trickplay = Object.values(item?.Trickplay?.[playState?.MediaSourceId || ''] || {}).sort((a, b) => (a.Width || 0) - (b.Width || 0))[0];
    const tile = preferences.previews && hover !== undefined && trickplay ? trickplayTile(trickplay, hover) : undefined;
    const tileUrl = tile && client && itemId ? client.getUrl(`Videos/${itemId}/Trickplay/${tile.width}/${tile.index}.jpg`, { ApiKey: client.accessToken(), MediaSourceId: playState?.MediaSourceId }) : '';
    const replay = () => action(async () => {
        if (!snapshot?.item) return;
        setEnded(false);
        await playbackManager.play({ items: [snapshot.item], startPositionTicks: 0 });
    });
    return <Page id='customVideoPage' className='client-video-page' isNowPlayingBarEnabled={false} isThemeMediaSupported>
        <style>{`html.client-video-active video::cue { font-size: ${preferences.subtitleSize}%; background-color: ${preferences.subtitleBackground ? 'rgba(0,0,0,.7)' : 'transparent'}; }`}</style>
        <div ref={root} className={`client-player style-${preferences.style} accent-${preferences.accent} ${visible || paused || panel || ended ? 'controls-visible' : 'controls-hidden'}`} style={{ '--player-scale': preferences.size / 100 } as CSSProperties} onPointerMove={wake} onPointerDown={() => { keyboardFocus.current = false; }} onFocusCapture={wake}>
            <button className='client-player-surface' tabIndex={-1} aria-label='Afficher les commandes' onClick={wake} onDoubleClick={event => {
                if (event.detail > 0) action(() => playbackManager.playPause());
            }} onTouchEnd={event => {
                const x = event.changedTouches[0]?.clientX || 0;
                const rightSide = x > window.innerWidth * 0.65 ? 1 : 0;
                const side = x < window.innerWidth * 0.35 ? -1 : rightSide;
                if (side && lastTouch.current.side === side && Date.now() - lastTouch.current.time < 350) {
                    event.preventDefault();
                    jump(side * preferences.skip);
                    lastTouch.current.time = 0;
                } else {
                    lastTouch.current = { time: Date.now(), side };
                }
                wake();
            }} />
            <header className='client-player-top'>
                <button type='button' onClick={leave} aria-label='Quitter le lecteur' title='Retour'><ClientIcon name='back' /></button>
                <div><small>{item?.Type === 'Episode' ? `${item.SeriesName || ''} · Saison ${item.ParentIndexNumber || 1}, épisode ${item.IndexNumber || 1}` : 'EN LECTURE'}</small><h1>{item?.Name || 'Préparation de la lecture…'}</h1></div>
                {button('Personnaliser le lecteur', 'settings', () => openPanel('appearance'))}
            </header>
            {!hasPlayer && !ended && <p className='client-player-loading' role='status'>Préparation de la lecture…</p>}
            {snapshot?.buffering && hasPlayer && !paused && <p className='client-player-loading' role='status'>Chargement de la vidéo…</p>}
            {notice && <div className='client-player-notice' role='status'>{notice}</div>}
            {ended ? <div className='client-player-ended'><h2>{error ? 'Lecture interrompue' : 'Lecture terminée'}</h2><button type='button' onClick={replay}>{error ? 'Réessayer' : 'Revoir'}</button>{next && <button type='button' onClick={() => action(() => {
                setEnded(false);
                return playbackManager.play({ items: [next] });
            })}>Épisode suivant · {next.Name}</button>}<button type='button' onClick={leave}>Retour à la fiche</button></div> : <div className='client-player-center'>
                {button(`Reculer de ${preferences.skip} secondes`, 'rewind', () => jump(-preferences.skip), !canSeek)}
                <button type='button' className='client-player-main-play' aria-label={paused ? 'Reprendre la lecture' : 'Mettre en pause'} disabled={!hasPlayer} onClick={() => action(() => playbackManager.playPause())}>{paused ? <ClientIcon name='play' /> : <PlayerGlyph name='pause' />}</button>
                {button(`Avancer de ${preferences.skip} secondes`, 'forward', () => jump(preferences.skip), !canSeek)}
            </div>}
            {segment && canSeek && !(showNext && segment.Type === 'Outro') && (segment.Type !== 'Intro' || preferences.intro === 'button') && <button className='client-player-skip' type='button' onClick={() => seek((segment.EndTicks || 0) / SECOND)}>{segmentLabels[segment.Type || 'Outro']} <ClientIcon name='next' /></button>}
            {showNext && <aside className='client-player-next'><small>À SUIVRE</small><strong>{next.SeriesName || item?.SeriesName}</strong><span>{next.Name}</span>{preferences.next > 0 && secondsLeft <= preferences.next && <span role='status'>{paused ? 'Compte à rebours en pause' : `Dans ${Math.ceil(secondsLeft)} s`}</span>}<div><button type='button' onClick={() => action(() => playbackManager.nextTrack())}>Épisode suivant <ClientIcon name='next' /></button><button type='button' onClick={() => setCancelledFor(itemId)}>Annuler</button></div></aside>}
            <footer className='client-player-bottom'>
                {error && <p role='alert' className='client-player-error'>{error}</p>}
                <div className='client-player-timeline'>
                    {hover !== undefined && <div className='client-player-scrub-preview' style={{ left: `${Math.max(12, Math.min(88, duration ? hover / duration * 100 : 0))}%` }}>{tile && tileUrl && <div style={{ width: tile.width, height: tile.height, backgroundImage: `url("${tileUrl}")`, backgroundPosition: `${tile.x}px ${tile.y}px` }} />}<span>{formatTime(hover)}</span></div>}
                    <div className='client-player-chapter-markers' aria-hidden='true'>{chapters.slice(1).map(chapter => <i key={chapter.StartPositionTicks} style={{ left: `${duration ? (chapter.StartPositionTicks || 0) / SECOND / duration * 100 : 0}%` }} />)}</div>
                    <input type='range' aria-label='Progression de la lecture' min={0} max={duration || 1} step={0.1} value={Math.min(displayPosition, duration || 1)} disabled={!canSeek} aria-valuetext={`${formatTime(displayPosition)} sur ${formatTime(duration)}`} style={{ '--progress': `${duration ? displayPosition / duration * 100 : 0}%` } as CSSProperties} onChange={event => setScrub(Number(event.target.value))} onPointerUp={event => {
                        seek(Number(event.currentTarget.value));
                        setScrub(undefined);
                    }} onKeyUp={event => {
                        if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                            seek(Number(event.currentTarget.value));
                            setScrub(undefined);
                        }
                    }} onBlur={() => setScrub(undefined)} onPointerMove={event => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setHover(Math.max(0, Math.min(duration, (event.clientX - rect.left) / rect.width * duration)));
                    }} onPointerLeave={() => setHover(undefined)} />
                </div>
                <div className='client-player-toolbar'>
                    {button(paused ? 'Lecture' : 'Pause', paused ? 'play' : 'pause', () => playbackManager.playPause(), !hasPlayer)}
                    <div className='client-player-volume'><button type='button' aria-label={playState?.IsMuted ? 'Activer le son' : 'Couper le son'} onClick={() => action(() => playbackManager.toggleMute())}><ClientIcon name={playState?.IsMuted ? 'muted' : 'volume'} /></button><input type='range' aria-label='Volume' min={0} max={100} value={playState?.IsMuted ? 0 : playState?.VolumeLevel || 0} disabled={!commands.includes('SetVolume')} onChange={event => action(() => playbackManager.setVolume(Number(event.target.value)))} /></div>
                    <span className='client-player-time'>{formatTime(displayPosition)} <span>/ {timeLabel}</span></span>
                    <div className='client-player-tools'>
                        {audio.length > 0 && button('Pistes audio', 'audio', () => openPanel('audio'))}
                        {subtitles.length > 0 && button('Sous-titres', 'subtitles', () => openPanel('subtitles'))}
                        {chapters.length > 0 && button('Chapitres', 'chapters', () => openPanel('chapters'))}
                        {button('Réglages de lecture', 'settings', () => openPanel('settings'), !hasPlayer)}
                        {commands.includes('PictureInPicture') && button('Image dans l’image', 'pip', () => playbackManager.togglePictureInPicture())}
                        {commands.includes('ToggleFullscreen') && button('Plein écran', 'fullscreen', () => playbackManager.toggleFullscreen())}
                    </div>
                </div>
            </footer>
            <dialog ref={dialog} className={`client-player-panel style-${preferences.style} accent-${preferences.accent}`} aria-labelledby='client-player-panel-title' onClose={() => {
                setPanel(undefined);
                wake();
            }}>
                <header><h2 id='client-player-panel-title'>{panel ? panelNames[panel] : ''}</h2><button type='button' aria-label='Fermer le panneau' onClick={() => dialog.current?.close()}><ClientIcon name='close' /></button></header>
                {panel === 'audio' && <div className='client-player-choices'>{audio.map(track => <button type='button' key={track.Index} aria-pressed={playState?.AudioStreamIndex === track.Index} onClick={() => action(() => playbackManager.setAudioStreamIndex(track.Index))}><TrackName track={track} />{playState?.AudioStreamIndex === track.Index && <ClientIcon name='check' />}</button>)}</div>}
                {panel === 'subtitles' && <div className='client-player-choices'>{playbackManager.supportSubtitleOffset() && playbackManager.canHandleOffsetOnCurrentSubtitle() && <label>Décalage des sous-titres (secondes)<input aria-label='Décalage des sous-titres' type='number' min={-120} max={120} step={0.1} defaultValue={playbackManager.getPlayerSubtitleOffset() || 0} onBlur={event => {
                    const offset = Number(event.target.value);
                    if (Number.isFinite(offset)) action(() => playbackManager.setSubtitleOffset(Math.max(-120, Math.min(120, offset))));
                }} /></label>}<button type='button' aria-pressed={(playState?.SubtitleStreamIndex ?? -1) < 0} onClick={() => action(() => playbackManager.setSubtitleStreamIndex(-1))}>Désactivés</button>{subtitles.map(track => <button type='button' key={track.Index} aria-pressed={playState?.SubtitleStreamIndex === track.Index} onClick={() => action(() => playbackManager.setSubtitleStreamIndex(track.Index))}><TrackName track={track} />{playState?.SubtitleStreamIndex === track.Index && <ClientIcon name='check' />}</button>)}</div>}
                {panel === 'chapters' && <div className='client-player-choices'>{chapters.map((chapter, index) => <button type='button' key={chapter.StartPositionTicks} disabled={!canSeek} onClick={() => {
                    seek((chapter.StartPositionTicks || 0) / SECOND);
                    dialog.current?.close();
                }}><span>{chapter.Name || `Chapitre ${index + 1}`}</span><small>{formatTime((chapter.StartPositionTicks || 0) / SECOND)}</small></button>)}</div>}
                {panel === 'settings' && <div className='client-player-fields'>
                    <label>Vitesse<select aria-label='Vitesse' value={playState?.PlaybackRate || 1} onChange={event => action(() => playbackManager.setPlaybackRate(Number(event.target.value)))}>{[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(rate => <option key={rate} value={rate}>{rate === 1 ? 'Normale' : `${rate} ×`}</option>)}</select></label>
                    <label>Qualité<select aria-label='Qualité' value={playbackManager.enableAutomaticBitrateDetection() ? 0 : playState?.MaxStreamingBitrate || 0} onChange={event => action(() => playbackManager.setMaxStreamingBitrate({ enableAutomaticBitrateDetection: Number(event.target.value) === 0, maxBitrate: Number(event.target.value) }))}><option value={0}>Automatique</option>{Array.from(new Set([playState?.MaxStreamingBitrate || 0, 120000000, 40000000, 20000000, 10000000, 4000000, 1500000])).filter(Boolean).sort((a, b) => b - a).map(bitrate => <option key={bitrate} value={bitrate}>Maximum {bitrate / 1000000} Mbit/s</option>)}</select></label>
                    <label>Format de l’image<select aria-label='Format de l’image' value={playbackManager.getAspectRatio()} onChange={event => action(() => playbackManager.setAspectRatio(event.target.value))}>{playbackManager.getSupportedAspectRatios().map((ratio: { id: string; name: string }) => <option key={ratio.id} value={ratio.id}>{ratio.name}</option>)}</select></label>
                    <details className='client-player-stream-info'><summary>Informations de lecture</summary><dl><dt>Mode</dt><dd>{playState?.PlayMethod || '—'}</dd><dt>Vidéo</dt><dd>{snapshot?.state.MediaSource?.MediaStreams?.find(stream => stream.Type === 'Video')?.Codec || '—'}</dd><dt>Débit du média</dt><dd>{snapshot?.state.MediaSource?.Bitrate ? `${Math.round(snapshot.state.MediaSource.Bitrate / 1000)} kbit/s` : '—'}</dd></dl></details>
                    <p className='client-player-hint'>Le serveur adapte le flux aux capacités du navigateur. Une limite de débit peut déclencher un transcodage.</p>
                    <button type='button' onClick={() => setPanel('appearance')}>Personnaliser le lecteur</button>
                </div>}
                {panel === 'appearance' && <PlayerPreferenceFields value={preferences} save={savePreferences} />}
            </dialog>
        </div>
    </Page>;
}

/* eslint-enable react/jsx-no-bind */
