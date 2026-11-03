import { useEffect, useState } from 'react';
import { playbackManager } from 'components/playback/playbackmanager';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import type { PlayerState } from 'types/playbackStopInfo';
import Events from 'utils/events';

export function usePlaybackSnapshot() {
    const [snapshot, setSnapshot] = useState<{ state: PlayerState; item?: BaseItemDto; next?: BaseItemDto; duration: number; buffering: boolean }>();
    useEffect(() => {
        const update = () => {
            const player = playbackManager.getCurrentPlayer();
            if (!player || !playbackManager.isPlayingVideo(player)) return;
            try {
                setSnapshot({
                    state: playbackManager.getPlayerState(player),
                    item: playbackManager.currentItem(player),
                    next: playbackManager.getNextItem()?.item,
                    duration: playbackManager.duration(player) / 10000000,
                    buffering: (document.querySelector<HTMLVideoElement>('.videoPlayerContainer video')?.readyState ?? 4) < 3
                });
            } catch { /* A stream may be between teardown and its replacement. */ }
        };
        update();
        const timer = window.setInterval(update, 500);
        Events.on(playbackManager, 'playbackstart', update);
        Events.on(playbackManager, 'playerchange', update);
        return () => {
            window.clearInterval(timer);
            Events.off(playbackManager, 'playbackstart', update);
            Events.off(playbackManager, 'playerchange', update);
        };
    }, []);
    return snapshot;
}
