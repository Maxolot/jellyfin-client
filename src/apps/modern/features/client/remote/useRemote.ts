import type { BaseItemDto, MediaStream, PlaystateCommand } from '@jellyfin/sdk/lib/generated-client';
import { useCallback, useEffect, useState } from 'react';

import { playbackManager } from 'components/playback/playbackmanager';
import Events from 'utils/events';
import { useApi } from 'hooks/useApi';
import { ServerConnections } from 'lib/jellyfin-apiclient';

import { livePosition, SESSION_PLAYER, videoTargets, type PlayTarget } from './remoteModel';

type PlayerInfo = { name?: string; isLocalPlayer?: boolean; id?: string; deviceName?: string } | null;

/** The device that plays when « Lecture » is pressed: this browser, or another one this account controls. */
export function useActiveTarget() {
    const [info, setInfo] = useState<PlayerInfo>(() => playbackManager.getPlayerInfo());
    useEffect(() => {
        const update = () => setInfo(playbackManager.getPlayerInfo());
        Events.on(playbackManager, 'playerchange', update);
        return () => Events.off(playbackManager, 'playerchange', update);
    }, []);
    const remote = !!info && info.name === SESSION_PLAYER && info.isLocalPlayer === false;
    return { info, remote };
}

export async function loadTargets(): Promise<PlayTarget[]> {
    return videoTargets(await playbackManager.getTargets() as PlayTarget[]);
}

let selectionGeneration = 0;

/** Changing destination invalidates pending transfers before they can stop a local source. */
export async function chooseTarget(target: PlayTarget) {
    if (target.playerName !== SESSION_PLAYER || target.isLocalPlayer) throw new Error('unsupported-target');
    const generation = ++selectionGeneration;
    const client = ServerConnections.currentApiClient();
    const userId = client?.getCurrentUserId();
    const serverId = client?.serverId();
    const identity = () => generation === selectionGeneration && client === ServerConnections.currentApiClient()
        && client?.getCurrentUserId() === userId && client?.serverId() === serverId;
    const ownsTarget = () => identity() && playbackManager.getPlayerInfo()?.id === target.id && playbackManager.getPlayerInfo()?.name === SESSION_PLAYER;
    const cancelled = () => new DOMException('Selection changed', 'AbortError');
    const source = playbackManager.getCurrentPlayer();
    const local = source?.isLocalPlayer ? playbackManager.getPlayerState(source) : undefined;
    if (!client || !userId) throw cancelled();
    // SessionPlayer has no pairing handshake. A synchronous selection avoids a late native
    // pairing callback restoring a destination after the user chose this browser instead.
    playbackManager.setActivePlayer(target.playerName, target);
    if (!ownsTarget()) throw cancelled();
    if (local?.NowPlayingItem?.Id) {
        try {
            await playbackManager.play({ items: [local.NowPlayingItem], startPositionTicks: local.PlayState?.PositionTicks || 0 });
            if (!ownsTarget()) throw cancelled();
            await playbackManager.stop(source);
        } catch (error) {
            // A failed old transfer must never reset the user's newer destination or account.
            if (ownsTarget()) playbackManager.setDefaultPlayerActive();
            throw error;
        }
    }
    if (!ownsTarget()) throw cancelled();
}

/** Back to this browser: the other device keeps whatever it was doing. */
export function playHere() {
    selectionGeneration++;
    playbackManager.setDefaultPlayerActive();
}

type RemotePlayState = { PositionTicks?: number; IsPaused?: boolean; VolumeLevel?: number; IsMuted?: boolean; AudioStreamIndex?: number; SubtitleStreamIndex?: number };
type RemoteSession = { Id?: string; NowPlayingItem?: BaseItemDto & { MediaStreams?: MediaStream[] }; PlayState?: RemotePlayState };
type RemotePlayer = { getPlayerState?: () => RemoteSession; isLocalPlayer?: boolean };

const EVENTS = ['timeupdate', 'pause', 'unpause', 'volumechange', 'playbackstart', 'playbackstop', 'statechange', 'playstatechange'];

/** What the controlled device reports, refreshed on its events and moving smoothly between them. */
export function useRemoteState(enabled: boolean) {
    const { __legacyApiClient__: client } = useApi();
    const { info, remote: isRemote } = useActiveTarget();
    const targetId = isRemote ? info?.id : undefined;
    const userId = client?.getCurrentUserId();
    const [sessionTarget, setSessionTarget] = useState<string>();
    const [sessionClient, setSessionClient] = useState<typeof client>();
    const [sessionUser, setSessionUser] = useState<string>();
    const [unreachable, setUnreachable] = useState(false);
    const [session, setSession] = useState<RemoteSession>({});
    const [reportedAt, setReportedAt] = useState(Date.now());
    const [now, setNow] = useState(Date.now());
    const read = useCallback(() => {
        const player = playbackManager.getCurrentPlayer() as RemotePlayer | undefined;
        if (!player || player.isLocalPlayer || playbackManager.getPlayerInfo()?.id !== targetId || client !== ServerConnections.currentApiClient() || client?.getCurrentUserId() !== userId) return;
        const cached = player.getPlayerState?.();
        if (!targetId || cached?.Id !== targetId) return;
        setSession({ ...cached });
        setSessionTarget(targetId);
        setSessionClient(() => client);
        setSessionUser(userId);
        setReportedAt(Date.now());
    }, [targetId, client, userId]);
    useEffect(() => {
        setSession({});
        setSessionTarget(undefined);
        setUnreachable(false);
        if (!enabled || !targetId) return;
        const player = playbackManager.getCurrentPlayer();
        read();
        for (const name of EVENTS) Events.on(player, name, read);
        const tick = window.setInterval(() => setNow(Date.now()), 500);
        // Reports can be missed: a slow refresh keeps the remote honest.
        let cancelled = false;
        let sequence = 0;
        let appliedSequence = 0;
        const poll = async () => {
            const id = targetId;
            const request = ++sequence;
            if (!client || client !== ServerConnections.currentApiClient() || playbackManager.getPlayerInfo()?.id !== id || client.getCurrentUserId() !== userId) return;
            try {
                const sessions = await client.getSessions({ ControllableByUserId: client.getCurrentUserId() });
                if (cancelled || request < appliedSequence || client !== ServerConnections.currentApiClient() || playbackManager.getPlayerInfo()?.id !== id || client.getCurrentUserId() !== userId) return;
                appliedSequence = request;
                const selected = sessions.find((entry: { Id?: string }) => entry.Id === id);
                if (!selected) {
                    playbackManager.setDefaultPlayerActive();
                    return;
                }
                setSession({ ...selected });
                setSessionTarget(id);
                setSessionClient(() => client);
                setSessionUser(userId);
                setReportedAt(Date.now());
                setUnreachable(false);
            } catch {
                if (!cancelled && request >= appliedSequence) setUnreachable(true);
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
    }, [enabled, read, client, userId, targetId]);
    // No frame may show the previous device's movie or track indices under the new name.
    const current = sessionTarget === targetId && sessionClient === client && sessionUser === userId ? session : {};
    const item = current.NowPlayingItem;
    const state = current.PlayState || {};
    const streams = item?.MediaStreams || [];
    return {
        item,
        unreachable,
        paused: !!state.IsPaused,
        position: item ? livePosition(state.PositionTicks, reportedAt, !!state.IsPaused, now, item.RunTimeTicks || undefined) : 0,
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
