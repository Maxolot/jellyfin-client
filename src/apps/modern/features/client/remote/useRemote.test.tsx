import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Events from 'utils/events';
import RangeControl from './RangeControl';
import { chooseTarget, playHere, useRemoteCommands, useRemoteState } from './useRemote';

const mock = vi.hoisted(() => {
    const player = { isLocalPlayer: false, getPlayerState: vi.fn(() => ({})) };
    const client = { getSessions: vi.fn(), getCurrentUserId: vi.fn(() => 'viewer'), serverId: vi.fn(() => 'server'), sendCommand: vi.fn(), sendPlayStateCommand: vi.fn() };
    return {
        player,
        client,
        activeClient: client,
        engine: { getCurrentPlayer: vi.fn(() => player), getPlayerInfo: vi.fn(), setDefaultPlayerActive: vi.fn(), setActivePlayer: vi.fn(), getPlayerState: vi.fn(), play: vi.fn(), stop: vi.fn() }
    };
});
vi.mock('hooks/useApi', () => ({ useApi: () => ({ __legacyApiClient__: mock.client }) }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: mock.engine }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { currentApiClient: () => mock.activeClient } }));

let container: HTMLDivElement;
let root: Root;
let controls: ReturnType<typeof useRemoteCommands>;
let state: ReturnType<typeof useRemoteState>;

function Probe({ mode }: Readonly<{ mode: 'commands' | 'state' }>) {
    const commands = useRemoteCommands();
    const remoteState = useRemoteState(mode === 'state');
    controls = commands;
    state = remoteState;
    return null;
}

beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    mock.activeClient = mock.client;
    mock.client.getCurrentUserId.mockReturnValue('viewer');
    mock.client.serverId.mockReturnValue('server');
    mock.player.isLocalPlayer = false;
    mock.player.getPlayerState.mockReturnValue({});
    mock.engine.getCurrentPlayer.mockReturnValue(mock.player);
    mock.engine.getPlayerInfo.mockReturnValue({ id: 'screen-b', name: 'Remote Control', isLocalPlayer: false });
    mock.engine.setActivePlayer.mockImplementation((name: string, target: { id: string }) => {
        mock.engine.getPlayerInfo.mockReturnValue({ id: target.id, name, isLocalPlayer: false });
        Events.trigger(mock.engine, 'playerchange');
    });
    mock.engine.setDefaultPlayerActive.mockImplementation(() => {
        mock.engine.getPlayerInfo.mockReturnValue({ id: 'local', isLocalPlayer: true });
        Events.trigger(mock.engine, 'playerchange');
    });
    mock.engine.play.mockResolvedValue(undefined);
    mock.engine.stop.mockResolvedValue(undefined);
    mock.client.getSessions.mockResolvedValue([]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
});

describe('remote requests', () => {
    it('addresses commands to the selected session, including seek ticks and track indices', async () => {
        await act(async () => root.render(<Probe mode='commands' />));
        await act(async () => {
            await controls.seek(123456789);
            await controls.audio(2);
        });
        expect(mock.client.sendPlayStateCommand).toHaveBeenCalledWith('screen-b', 'Seek', { SeekPositionTicks: 123456789 });
        expect(mock.client.sendCommand).toHaveBeenCalledWith('screen-b', { Name: 'SetAudioStreamIndex', Arguments: { Index: 2 } });
    });
    it('shows a request failure without leaving an unhandled rejection', async () => {
        mock.client.sendPlayStateCommand.mockRejectedValueOnce(new Error('disconnected'));
        await act(async () => root.render(<Probe mode='commands' />));
        await act(async () => {
            await controls.playPause();
        });
        expect(controls.error).toMatch(/commande n’a pas abouti/);
    });
    it('never sends a remote command to a local player', async () => {
        mock.engine.getPlayerInfo.mockReturnValue({ id: 'local', isLocalPlayer: true });
        await act(async () => root.render(<Probe mode='commands' />));
        await act(async () => {
            await controls.stop();
        });
        expect(mock.client.sendPlayStateCommand).not.toHaveBeenCalled();
        expect(controls.error).toBeTruthy();
    });
});

describe('remote session reports', () => {
    it('reads the selected session even if no engine event arrives', async () => {
        mock.client.getSessions.mockResolvedValue([{ Id: 'screen-b', NowPlayingItem: { Id: 'movie', RunTimeTicks: 900000000 }, PlayState: { PositionTicks: 120000000, IsPaused: true } }]);
        await act(async () => root.render(<Probe mode='state' />));
        expect(state.item?.Id).toBe('movie');
        expect(state.position).toBe(120000000);
        expect(state.paused).toBe(true);
    });
    it('returns to this browser only after a successful report confirms the device left', async () => {
        await act(async () => root.render(<Probe mode='state' />));
        expect(mock.engine.setDefaultPlayerActive).toHaveBeenCalledOnce();
    });
    it('keeps the chosen target when the network fails', async () => {
        mock.client.getSessions.mockRejectedValueOnce(new Error('network'));
        await act(async () => root.render(<Probe mode='state' />));
        expect(state.unreachable).toBe(true);
        expect(mock.engine.setDefaultPlayerActive).not.toHaveBeenCalled();
    });
    it('ignores an old response after selecting another device', async () => {
        let answer!: (value: unknown[]) => void;
        mock.client.getSessions.mockReturnValue(new Promise<unknown[]>(resolve => {
            answer = resolve;
        }));
        await act(async () => root.render(<Probe mode='state' />));
        mock.engine.getPlayerInfo.mockReturnValue({ id: 'screen-c', name: 'Remote Control', isLocalPlayer: false });
        await act(async () => answer([{ Id: 'screen-b', NowPlayingItem: { Id: 'old' } }]));
        expect(state.item).toBeUndefined();
        expect(mock.engine.setDefaultPlayerActive).not.toHaveBeenCalled();
    });
});

describe('remote sliders', () => {
    it('accumulates rapid keyboard steps before device reports arrive and contains the keys', async () => {
        const change = vi.fn();
        const globalKey = vi.fn();
        window.addEventListener('keydown', globalKey);
        try {
            await act(async () => root.render(<RangeControl label='Volume' value={0} max={100} step={5} text='0 %' onChange={change} />));
            const slider = container.querySelector('[role="slider"]')!;
            await act(async () => {
                for (let index = 0; index < 8; index++) slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            });
            expect(change).toHaveBeenLastCalledWith(40);
            expect(slider.getAttribute('aria-valuenow')).toBe('40');
            expect(globalKey).not.toHaveBeenCalled();
        } finally {
            window.removeEventListener('keydown', globalKey);
        }
    });
    it('previews a pointer drag but sends only its final value', async () => {
        const change = vi.fn();
        await act(async () => root.render(<RangeControl label='Position' value={0} max={100} step={5} text='0' onChange={change} />));
        const slider = container.querySelector<HTMLElement>('[role="slider"]')!;
        vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 100 } as DOMRect);
        await act(async () => {
            slider.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, bubbles: true }));
            slider.dispatchEvent(new MouseEvent('pointermove', { clientX: 80, bubbles: true }));
        });
        expect(change).not.toHaveBeenCalled();
        await act(async () => {
            slider.dispatchEvent(new MouseEvent('pointerup', { clientX: 80, bubbles: true }));
        });
        expect(change).toHaveBeenCalledExactlyOnceWith(80);
    });
});

describe('pending local transfers', () => {
    const target = { id: 'screen-b', name: 'B', playerName: 'Remote Control', isLocalPlayer: false };
    function pendingTransfer() {
        mock.player.isLocalPlayer = true;
        mock.engine.getPlayerState.mockReturnValue({ NowPlayingItem: { Id: 'movie' }, PlayState: { PositionTicks: 123 } });
        let resolve!: () => void;
        let reject!: (error: Error) => void;
        mock.engine.play.mockReturnValue(new Promise<void>((yes, no) => {
            resolve = yes;
            reject = no;
        }));
        return { resolve, reject };
    }
    it('does not stop the local source after the user returned to this browser', async () => {
        const request = pendingTransfer();
        const transfer = chooseTarget(target);
        playHere();
        request.resolve();
        await expect(transfer).rejects.toMatchObject({ name: 'AbortError' });
        expect(mock.engine.stop).not.toHaveBeenCalled();
        expect(mock.engine.setDefaultPlayerActive).toHaveBeenCalledOnce();
    });
    it('does not reset a newer target when an old transfer fails', async () => {
        const request = pendingTransfer();
        const transfer = chooseTarget(target);
        mock.engine.getPlayerInfo.mockReturnValue({ id: 'screen-c', name: 'Remote Control', isLocalPlayer: false });
        request.reject(new Error('offline'));
        await expect(transfer).rejects.toThrow('offline');
        expect(mock.engine.setDefaultPlayerActive).not.toHaveBeenCalled();
        expect(mock.engine.stop).not.toHaveBeenCalled();
    });
    it('does not stop the source after an account changes on the same client object', async () => {
        const request = pendingTransfer();
        const transfer = chooseTarget(target);
        mock.client.getCurrentUserId.mockReturnValue('another-viewer');
        request.resolve();
        await expect(transfer).rejects.toMatchObject({ name: 'AbortError' });
        expect(mock.engine.stop).not.toHaveBeenCalled();
        expect(mock.engine.setDefaultPlayerActive).not.toHaveBeenCalled();
    });
    it('stops its local source only after a transfer still owned by this account succeeds', async () => {
        const request = pendingTransfer();
        const transfer = chooseTarget(target);
        request.resolve();
        await transfer;
        expect(mock.engine.stop).toHaveBeenCalledExactlyOnceWith(mock.player);
    });
    it('does not stop the source after replacing the active API client', async () => {
        const request = pendingTransfer();
        const transfer = chooseTarget(target);
        mock.activeClient = { ...mock.client };
        request.resolve();
        await expect(transfer).rejects.toMatchObject({ name: 'AbortError' });
        expect(mock.engine.stop).not.toHaveBeenCalled();
    });
    it('rejects a Cast target before selecting or sending anything', async () => {
        await expect(chooseTarget({ ...target, playerName: 'Chromecast' })).rejects.toThrow('unsupported-target');
        expect(mock.engine.setActivePlayer).not.toHaveBeenCalled();
        expect(mock.engine.play).not.toHaveBeenCalled();
    });
});

describe('target identity of session data', () => {
    it('clears the previous movie and ignores the singleton player cache when changing devices', async () => {
        mock.client.getSessions.mockResolvedValueOnce([{ Id: 'screen-b', NowPlayingItem: { Id: 'old', RunTimeTicks: 900000000, MediaStreams: [{ Type: 'Audio', Index: 7 }] }, PlayState: { PositionTicks: 120000000, IsPaused: true } }]);
        await act(async () => root.render(<Probe mode='state' />));
        expect(state.item?.Id).toBe('old');
        let answer!: (value: unknown[]) => void;
        mock.client.getSessions.mockReturnValue(new Promise<unknown[]>(resolve => {
            answer = resolve;
        }));
        mock.player.getPlayerState.mockReturnValue({ Id: 'screen-b', NowPlayingItem: { Id: 'old' } });
        await act(async () => {
            mock.engine.getPlayerInfo.mockReturnValue({ id: 'screen-c', name: 'Remote Control', isLocalPlayer: false });
            Events.trigger(mock.engine, 'playerchange');
        });
        expect(state.item).toBeUndefined();
        expect(state.audio).toEqual([]);
        expect(state.position).toBe(0);
        await act(async () => answer([{ Id: 'screen-c', NowPlayingItem: { Id: 'new' } }]));
        expect(state.item?.Id).toBe('new');
    });
    it('clears a snapshot when another account uses the same API client', async () => {
        mock.client.getSessions.mockResolvedValueOnce([{ Id: 'screen-b', NowPlayingItem: { Id: 'private-movie' } }]);
        await act(async () => root.render(<Probe mode='state' />));
        expect(state.item?.Id).toBe('private-movie');
        mock.client.getSessions.mockReturnValue(new Promise(() => undefined));
        mock.client.getCurrentUserId.mockReturnValue('another-viewer');
        await act(async () => root.render(<Probe mode='state' />));
        expect(state.item).toBeUndefined();
        expect(state.position).toBe(0);
    });
    it('ignores an earlier overlapping poll that arrives after a newer report', async () => {
        vi.useFakeTimers();
        try {
            let first!: (value: unknown[]) => void;
            let second!: (value: unknown[]) => void;
            mock.client.getSessions.mockReturnValueOnce(new Promise<unknown[]>(resolve => {
                first = resolve;
            })).mockReturnValueOnce(new Promise<unknown[]>(resolve => {
                second = resolve;
            }));
            await act(async () => root.render(<Probe mode='state' />));
            await act(async () => vi.advanceTimersByTimeAsync(2000));
            await act(async () => second([{ Id: 'screen-b', NowPlayingItem: { Id: 'new' } }]));
            await act(async () => first([{ Id: 'screen-b', NowPlayingItem: { Id: 'old' } }]));
            expect(state.item?.Id).toBe('new');
        } finally {
            vi.useRealTimers();
        }
    });
});
