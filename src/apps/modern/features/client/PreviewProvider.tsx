import useMediaQuery from '@mui/material/useMediaQuery';
import React, { createContext, type PropsWithChildren, type RefObject, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { playbackManager } from 'components/playback/playbackmanager';
import { useApi } from 'hooks/useApi';
import { useWebConfig } from 'hooks/useWebConfig';
import Events from 'utils/events';

const noSources: Record<string, string> = {};
type Owner = { id: string; priority: number; order: number };
type PreviewContextValue = {
    enabled: boolean;
    muted: boolean;
    scope: string;
    sources: Record<string, string>;
    selected?: string;
    completed: Set<string>;
    claim: (id: string, priority: number) => void;
    release: (id: string) => void;
    report: (id: string, playing: boolean) => void;
    toggleMuted: () => void;
    mute: () => void;
};
const PreviewContext = createContext<PreviewContextValue | undefined>(undefined);
export const usePreviews = () => useContext(PreviewContext);

type Props = PropsWithChildren<{
    surface: RefObject<HTMLDivElement>;
    enabled: boolean;
    muted: boolean;
    suspended: boolean;
    toggleMuted: () => void;
    onPlayingChange: (playing: boolean) => void;
}>;

export default function PreviewProvider({ children, surface, enabled, muted, suspended, toggleMuted, onPlayingChange }: Readonly<Props>) {
    const config = useWebConfig();
    const { user } = useApi();
    const sources = config.clientPreviews?.[user?.ServerId || ''] || noSources;
    const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
    const [hidden, setHidden] = useState(false);
    const [realPlayback, setRealPlayback] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [owners, setOwners] = useState<Owner[]>([]);
    const [playing, setPlaying] = useState<string>();
    const scope = `${user?.ServerId || ''}/${user?.Id || ''}`;
    const completion = useMemo(() => ({ scope, items: new Set<string>() }), [scope]);
    const completed = completion.items;
    const order = useRef(0);
    const muting = useRef({ muted, toggleMuted });
    useEffect(() => {
        muting.current = { muted, toggleMuted };
    }, [muted, toggleMuted]);
    const mute = useCallback(() => {
        if (!muting.current.muted) {
            muting.current.muted = true;
            muting.current.toggleMuted();
        }
    }, []);
    const claim = useCallback((id: string, priority: number) => {
        const owner = { id, priority, order: order.current++ };
        setOwners(previous => [...previous.filter(entry => entry.id !== id), owner]);
    }, []);
    const release = useCallback((id: string) => setOwners(previous => previous.filter(entry => entry.id !== id)), []);
    const report = useCallback((id: string, active: boolean) => setPlaying(previous => {
        if (active) return id;
        return previous === id ? undefined : previous;
    }), []);
    useEffect(() => {
        const root = surface.current;
        if (!root) return;
        const check = () => setDialogOpen(!!root.querySelector('dialog[open]'));
        check();
        const observer = new MutationObserver(check);
        observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
        return () => observer.disconnect();
    }, [surface]);
    useEffect(() => {
        // eslint-disable-next-line compat/compat -- Visibility is a progressive enhancement.
        const visibility = () => setHidden(document.visibilityState === 'hidden');
        const start = () => setRealPlayback(true);
        const stop = () => setRealPlayback(false);
        visibility();
        document.addEventListener('visibilitychange', visibility);
        Events.on(playbackManager, 'playbackstart', start);
        Events.on(playbackManager, 'playbackstop', stop);
        return () => {
            document.removeEventListener('visibilitychange', visibility);
            Events.off(playbackManager, 'playbackstart', start);
            Events.off(playbackManager, 'playbackstop', stop);
        };
    }, []);
    const busy = !!playing;
    useEffect(() => {
        onPlayingChange(busy);
        return () => onPlayingChange(false);
    }, [busy, onPlayingChange]);
    const selected = [...owners].sort((a, b) => a.priority - b.priority || a.order - b.order).pop()?.id;
    const active = enabled && !hidden && !reduced && !suspended && !realPlayback && !dialogOpen;
    const value = useMemo(() => ({ enabled: active, muted, scope, sources, selected, completed, claim, release, report, toggleMuted, mute }), [active, muted, scope, sources, selected, completed, claim, release, report, toggleMuted, mute]);
    return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}
