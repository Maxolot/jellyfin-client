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
import RemoteIcon from '../remote/RemoteIcon';
import { TogetherBadge, openConnectivity } from '../remote/ConnectivityLayer';
import { PlayerPreferenceFields } from './PlayerSettings';
import { playerPreferenceKey, usePlayerPreferences } from './preferences';
import { activeSegment, clampSeek, formatTime, SECOND } from './model';
import { usePlaybackSnapshot } from './usePlaybackSnapshot';
import { TimelinePreview } from './TimelinePreview';
import { PlayerEpisodes, PlayerTechnical, PlayerHelp, SubtitleOffset, sleepLabel } from './PlayerExtras';
import { Select } from '../settings/controls';
import './player.scss';
import './polish.scss';

type Panel = 'audio' | 'subtitles' | 'chapters' | 'settings' | 'appearance' | 'episodes' | 'technical' | 'tools' | 'sleep' | 'help';
const SEEK_BURST_MS = 1100;
const segmentLabels: Record<string, string> = { Intro: 'Passer l’intro', Recap: 'Passer le récapitulatif', Outro: 'Passer le générique' };
const panelNames = { audio: 'Pistes audio', subtitles: 'Sous-titres', chapters: 'Chapitres', settings: 'Lecture', appearance: 'Personnaliser le lecteur', episodes: 'Épisodes', technical: 'Informations techniques', tools: 'Outils du lecteur', sleep: 'Minuterie', help: 'Raccourcis clavier' };
function TrackName({ track }: Readonly<{ track: MediaStream }>) {
    return <span>{track.DisplayTitle || track.Title || track.Language || `Piste ${(track.Index || 0) + 1}`}</span>;
}
function PlayerGlyph({ name }: Readonly<{ name: string }>) {
    const paths: Record<string, string> = {
        play: 'M8 5v14l11-7Z', pause: 'M8 5v14M16 5v14', rewind: 'M4 10a8 8 0 1 1 1 8M4 4v6h6', forward: 'M20 10a8 8 0 1 0-1 8M20 4v6h-6',
        subtitles: 'M3 5h18v14H3ZM10 10H7v4h3M17 10h-3v4h3', audio: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-3-3h3M21 16a3 3 0 1 1-3-3h3',
        fullscreen: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5', pip: 'M3 4h18v16H3ZM12 12h7v6h-7Z',
        episodes: 'M3 4h18v12H3ZM7 20h10M10 8l5 2-5 3Z', more: 'M5 12h.01M12 12h.01M19 12h.01', chapters: 'M4 5h16M4 12h16M4 19h16', settings: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6'
    };
    return <svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'><path d={paths[name] || paths.settings} /></svg>;
}
// eslint-disable-next-line sonarjs/cognitive-complexity -- Capability-gated controls share one playback snapshot.
export default function CustomVideoPlayer() {
    const { api, user } = useApi();
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
    const [jumpFeedback, setJumpFeedback] = useState({ offset: 0, serial: 0, at: 0 });
    const jumpTarget = useRef<{ position: number; at: number }>();
    const [sleepAt, setSleepAt] = useState<number>();
    const [sleepEnd, setSleepEnd] = useState(false);
    const stopAfterItem = useRef('');
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
    const nextCancelled = cancelledFor === itemId || sleepEnd;
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
        jumpTarget.current = undefined;
        if (canSeek) action(() => playbackManager.seek(clampSeek(seconds, duration) * SECOND));
    };
    const jump = (offset: number) => {
        if (!canSeek) return;
        const now = Date.now();
        const base = jumpTarget.current && now - jumpTarget.current.at < SEEK_BURST_MS ? jumpTarget.current.position : position;
        const target = clampSeek(base + offset, duration);
        seek(target);
        jumpTarget.current = { position: target, at: now };
        setJumpFeedback(previous => ({ offset: now - previous.at < SEEK_BURST_MS && Math.sign(previous.offset) === Math.sign(offset) ? previous.offset + offset : offset, serial: previous.serial + 1, at: now }));
    };
    const leave = useCallback(() => {
        leaving.current = true;
        if (playbackManager.isPlayingVideo()) playbackManager.stop();
        if (window.history.state?.idx > 0) navigate(-1);
        else navigate('/client', { replace: true });
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
        customVideoPresentation.autoNext = preferences.next > 0 && !nextCancelled && !sleepEnd;
    }, [preferences.next, nextCancelled, sleepEnd]);
    useEffect(() => {
        setEnded(false);
        skipped.current.clear();
        jumpTarget.current = undefined;
        setJumpFeedback({ offset: 0, serial: 0, at: 0 });
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
        if (!jumpFeedback.offset) return;
        const timer = window.setTimeout(() => setJumpFeedback(previous => ({ ...previous, offset: 0 })), SEEK_BURST_MS);
        return () => window.clearTimeout(timer);
    }, [jumpFeedback.serial, jumpFeedback.offset]);
    useEffect(() => {
        if (!sleepAt) return;
        const timer = window.setInterval(() => {
            if (Date.now() < sleepAt) return;
            setSleepAt(undefined);
            action(() => playbackManager.pause());
            setVisible(true);
        }, 500);
        return () => window.clearInterval(timer);
    }, [sleepAt, action]);
    useEffect(() => {
        if (stopAfterItem.current && stopAfterItem.current !== itemId) setSleepEnd(false);
        stopAfterItem.current = itemId;
    }, [itemId]);
    useEffect(() => {
        const timer = window.setInterval(() => {
            const focusInside = keyboardFocus.current && root.current?.contains(document.activeElement) && document.activeElement !== root.current;
            if (Date.now() - activity.current > latest.current.preferences.hideAfter * 1000 && !latest.current.panel && !latest.current.snapshot?.state.PlayState.IsPaused && !focusInside) setVisible(false);
        }, 500);
        return () => window.clearInterval(timer);
    }, []);
    useEffect(() => {
        const keydown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.repeat || document.querySelector('dialog[open]')) return;
