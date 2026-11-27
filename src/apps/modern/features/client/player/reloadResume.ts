import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { playbackManager } from 'components/playback/playbackmanager';

/** What the player needs to pick up again after the tab is reloaded. Kept per tab. */
export type ReloadEntry = {
    itemId: string;
    serverId: string;
    positionTicks: number;
    runtimeTicks?: number;
    mediaSourceId?: string;
    audioStreamIndex?: number;
    subtitleStreamIndex?: number;
    savedAt: number;
};

const KEY = 'client-player-reload';
const MAX_AGE = 6 * 60 * 60 * 1000;
/** Picked up a couple of seconds early, so the last words are heard again. */
const REWIND_TICKS = 2 * 10_000_000;

export function rememberPlayback(entry: ReloadEntry) {
    try {
        sessionStorage.setItem(KEY, JSON.stringify(entry));
    } catch { /* Without storage, a reload simply returns to the catalogue. */ }
}

export function forgetPlayback() {
    try {
        sessionStorage.removeItem(KEY);
    } catch { /* Nothing stored. */ }
}

export function readPlayback(now = Date.now()): ReloadEntry | undefined {
    try {
        const entry = JSON.parse(sessionStorage.getItem(KEY) || 'null') as ReloadEntry | null;
        if (!entry?.itemId || !entry.serverId || now - entry.savedAt > MAX_AGE) return undefined;
        // A title watched to its end is not started again.
        if (entry.runtimeTicks && entry.positionTicks > entry.runtimeTicks * 0.97) return undefined;
        return entry;
    } catch {
        return undefined;
    }
}

export function resumeOptions(entry: ReloadEntry) {
    return {
        ids: [entry.itemId],
        serverId: entry.serverId,
        startPositionTicks: Math.max(0, entry.positionTicks - REWIND_TICKS),
        mediaSourceId: entry.mediaSourceId,
        audioStreamIndex: entry.audioStreamIndex,
        subtitleStreamIndex: entry.subtitleStreamIndex
    };
}

type Current = { hasPlayer: boolean; ended: boolean; entry?: Omit<ReloadEntry, 'savedAt'> };

/**
 * Keeps the playing title in the tab's session storage and, when the player page opens
 * with nothing playing, starts that title again where it was. Quitting the player forgets it.
 */
export function useReloadResume({ hasPlayer, ended, entry }: Current) {
    const navigate = useNavigate();
    const latest = useRef(entry);
    latest.current = entry;

    useEffect(() => {
        // The player page is only opened once playback has started: finding it empty means the
        // tab was reloaded (or reopened from history), whatever the engine reports as navigation.
        const timer = window.setTimeout(() => {
            if (playbackManager.getCurrentPlayer()) return;
            const saved = readPlayback();
            if (!saved) {
                navigate('/client', { replace: true });
                return;
            }
            void Promise.resolve(playbackManager.play(resumeOptions(saved))).catch(() => navigate('/client', { replace: true }));
        }, 900);
        return () => window.clearTimeout(timer);
    }, [navigate]);

    useEffect(() => {
        if (!hasPlayer || ended) return;
        const save = () => {
            if (latest.current) rememberPlayback({ ...latest.current, savedAt: Date.now() });
        };
        save();
        const timer = window.setInterval(save, 3000);
        window.addEventListener('pagehide', save);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('pagehide', save);
        };
    }, [hasPlayer, ended]);

    // Not forgotten on "ended": the player also stops while the page unloads, just before a reload.
}
