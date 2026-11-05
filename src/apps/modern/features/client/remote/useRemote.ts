import type { BaseItemDto, MediaStream, PlaystateCommand } from '@jellyfin/sdk/lib/generated-client';
import { useCallback, useEffect, useState } from 'react';

import { playbackManager } from 'components/playback/playbackmanager';
import Events from 'utils/events';
import { useApi } from 'hooks/useApi';

import { livePosition, videoTargets, type PlayTarget } from './remoteModel';

type PlayerInfo = { name?: string; isLocalPlayer?: boolean; id?: string; deviceName?: string } | null;

/** The device that plays when « Lecture » is pressed: this browser, or another one this account controls. */
export function useActiveTarget() {
    const [info, setInfo] = useState<PlayerInfo>(() => playbackManager.getPlayerInfo());
    useEffect(() => {
        const update = () => setInfo(playbackManager.getPlayerInfo());
        Events.on(playbackManager, 'playerchange', update);
        return () => Events.off(playbackManager, 'playerchange', update);
    }, []);
    const remote = !!info && info.isLocalPlayer === false;
    return { info, remote };
}

export async function loadTargets(): Promise<PlayTarget[]> {
    return videoTargets(await playbackManager.getTargets() as PlayTarget[]);
}

export async function chooseTarget(target: PlayTarget) {
    const source = playbackManager.getCurrentPlayer();
    const local = source?.isLocalPlayer ? playbackManager.getPlayerState(source) : undefined;
    await new Promise<void>((resolve, reject) => {
        const clear = () => {
            window.clearTimeout(timer);
            Events.off(playbackManager, 'playerchange', changed);
            Events.off(playbackManager, 'pairerror', failed);
        };
        const changed = () => {
            if (playbackManager.getPlayerInfo()?.id !== target.id) return;
            clear();
            resolve();
        };
        const failed = () => {
            clear();
            reject(new Error('L’appareil ne répond pas.'));
        };
        const timer = window.setTimeout(failed, 10000);
        Events.on(playbackManager, 'playerchange', changed);
        Events.on(playbackManager, 'pairerror', failed);
        try {
            playbackManager.trySetActivePlayer(target.playerName, target);
            changed();
        } catch (error) {
            clear();
            reject(error);
        }
    });
    // When selected in the player, continue the same title at its current position there.
    if (local?.NowPlayingItem?.Id) {
        try {
            await playbackManager.play({ items: [local.NowPlayingItem], startPositionTicks: local.PlayState?.PositionTicks || 0 });
            await playbackManager.stop(source);
        } catch (error) {
            playbackManager.setDefaultPlayerActive();
            throw error;
        }
    }
}

/** Back to this browser: the other device keeps whatever it was doing. */
export function playHere() {
    playbackManager.setDefaultPlayerActive();
}

type RemotePlayState = { PositionTicks?: number; IsPaused?: boolean; VolumeLevel?: number; IsMuted?: boolean; AudioStreamIndex?: number; SubtitleStreamIndex?: number };
type RemoteSession = { NowPlayingItem?: BaseItemDto & { MediaStreams?: MediaStream[] }; PlayState?: RemotePlayState };
type RemotePlayer = { getPlayerState?: () => RemoteSession; isLocalPlayer?: boolean };

const EVENTS = ['timeupdate', 'pause', 'unpause', 'volumechange', 'playbackstart', 'playbackstop', 'statechange', 'playstatechange'];

/** What the controlled device reports, refreshed on its events and moving smoothly between them. */
export function useRemoteState(enabled: boolean) {
    const { __legacyApiClient__: client } = useApi();
    const [unreachable, setUnreachable] = useState(false);
    const [session, setSession] = useState<RemoteSession>({});
    const [reportedAt, setReportedAt] = useState(Date.now());
    const [now, setNow] = useState(Date.now());
    const read = useCallback(() => {
        const player = playbackManager.getCurrentPlayer() as RemotePlayer | undefined;
        if (!player || player.isLocalPlayer) return;
        setSession({ ...player.getPlayerState?.() });
        setReportedAt(Date.now());
    }, []);
    useEffect(() => {
        if (!enabled) return;
        const player = playbackManager.getCurrentPlayer();
        read();
        for (const name of EVENTS) Events.on(player, name, read);
        const tick = window.setInterval(() => setNow(Date.now()), 500);
        // Reports can be missed: a slow refresh keeps the remote honest.
        let cancelled = false;
        const poll = async () => {
            const id = playbackManager.getPlayerInfo()?.id;
            if (!client || !id) return;
            try {
                const sessions = await client.getSessions({ ControllableByUserId: client.getCurrentUserId() });
                if (cancelled || playbackManager.getPlayerInfo()?.id !== id) return;
                const selected = sessions.find((entry: { Id?: string }) => entry.Id === id);
                if (!selected) {
                    playbackManager.setDefaultPlayerActive();
                    return;
                }
                setSession({ ...selected });
                setReportedAt(Date.now());
                setUnreachable(false);
            } catch {
                if (!cancelled) setUnreachable(true);
            }
        };
        void poll();
        const refresh = window.setInterval(() => {
            void poll();
        }, 2000);
        return () => {
            cancelled = true;
            for (const name of EVENTS) Events.off(player, name, read);
            window.clearInterval(tick);
            window.clearInterval(refresh);
        };
    }, [enabled, read, client]);
    const item = session.NowPlayingItem;
    const state = session.PlayState || {};
    const streams = item?.MediaStreams || [];
    return {
        item,
        unreachable,
        paused: !!state.IsPaused,
        position: livePosition(state.PositionTicks, reportedAt, !!state.IsPaused, now, item?.RunTimeTicks || undefined),
        duration: item?.RunTimeTicks || 0,
        volume: state.VolumeLevel ?? 100,
        muted: !!state.IsMuted,
        audio: streams.filter(stream => stream.Type === 'Audio'),
        subtitles: streams.filter(stream => stream.Type === 'Subtitle'),
        audioIndex: state.AudioStreamIndex,
        subtitleIndex: state.SubtitleStreamIndex ?? -1,
        refresh: read
    };
}

/** Commands use the selected session and expose request failures in our own panel. */
export function useRemoteCommands() {
    const { __legacyApiClient__: client } = useApi();
    const [error, setError] = useState('');
    const send = (command: string, parameters: Record<string, string | number> = {}, general = false) => {
        setError('');
        return Promise.resolve().then(() => {
            const info = playbackManager.getPlayerInfo();
            if (!client || !info?.id || info.isLocalPlayer) throw new Error('missing-device');
            return general ? client.sendCommand(info.id, { Name: command, Arguments: parameters }) : client.sendPlayStateCommand(info.id, command as PlaystateCommand, parameters);
        }).catch(() => setError('La commande n’a pas abouti. Vérifiez que l’appareil est toujours connecté.'));
    };
    return {
        error,
        playPause: () => send('PlayPause'),
        seek: (ticks: number) => send('Seek', { SeekPositionTicks: Math.max(0, Math.round(ticks)) }),
        stop: () => send('Stop'),
        next: () => send('NextTrack'),
        previous: () => send('PreviousTrack'),
        volume: (level: number) => send('SetVolume', { Volume: Math.max(0, Math.min(100, Math.round(level))) }, true),
        mute: () => send('ToggleMute', {}, true),
        audio: (index: number) => send('SetAudioStreamIndex', { Index: index }, true),
        subtitles: (index: number) => send('SetSubtitleStreamIndex', { Index: index }, true)
    };
}
