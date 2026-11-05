import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RangeControl from './RangeControl';
import { useRemoteCommands, useRemoteState } from './useRemote';

const mock = vi.hoisted(() => {
    const player = { isLocalPlayer: false, getPlayerState: () => ({}) };
    return {
        client: { getSessions: vi.fn(), getCurrentUserId: () => 'viewer', sendCommand: vi.fn(), sendPlayStateCommand: vi.fn() },
        engine: { getCurrentPlayer: () => player, getPlayerInfo: vi.fn(), setDefaultPlayerActive: vi.fn() }
    };
});
vi.mock('hooks/useApi', () => ({ useApi: () => ({ __legacyApiClient__: mock.client }) }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: mock.engine }));

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
    mock.engine.getPlayerInfo.mockReturnValue({ id: 'screen-b', isLocalPlayer: false });
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
        mock.engine.getPlayerInfo.mockReturnValue({ id: 'screen-c', isLocalPlayer: false });
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
