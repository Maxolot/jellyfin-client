import useMediaQuery from '@mui/material/useMediaQuery';
import React, { createContext, type PropsWithChildren, type RefObject, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { playbackManager } from 'components/playback/playbackmanager';
import { useApi } from 'hooks/useApi';
import { useWebConfig } from 'hooks/useWebConfig';
import type { ClientPreviewSources } from 'types/webConfig';
import Events from 'utils/events';
import { PreviewHandoff } from './previews/handoff';
import { PreviewPlayback } from './previews/playback';

const noSources: ClientPreviewSources = {};
type Owner = { id: string; priority: number; order: number };
type PreviewContextValue = {
    enabled: boolean;
    serverAvailable: boolean;
    playback: PreviewPlayback;
    handoff: PreviewHandoff;
    muted: boolean;
    scope: string;
    sources: ClientPreviewSources;
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
    serverAvailable: boolean;
    enabled: boolean;
    muted: boolean;
    suspended: boolean;
    toggleMuted: () => void;
    onPlayingChange: (playing: boolean) => void;
}>;

export default function PreviewProvider({ children, surface, serverAvailable, enabled, muted, suspended, toggleMuted, onPlayingChange }: Readonly<Props>) {
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
    const playback = useMemo(() => new PreviewPlayback(), []);
    const handoff = useMemo(() => new PreviewHandoff(() => playback.stop()), [playback]);
    useEffect(() => {
        const root = surface.current;
        if (!root) return;
        // Runs before the link navigates: says which media page the viewer is opening.
        const opening = (event: MouseEvent) => {
            const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
            const id = link?.href.match(/[?&]id=([^&#]+)/)?.[1];
            if (id) handoff.intend(decodeURIComponent(id));
        };
        root.addEventListener('click', opening, true);
        return () => root.removeEventListener('click', opening, true);
    }, [surface, handoff]);
    useEffect(() => () => handoff.discard(), [handoff, scope]);
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
    useEffect(() => {
        if (!active) handoff.discard();
    }, [active, handoff]);
    const value = useMemo(() => ({ enabled: active, serverAvailable, playback, handoff, muted, scope, sources, selected, completed, claim, release, report, toggleMuted, mute }), [active, serverAvailable, playback, handoff, muted, scope, sources, selected, completed, claim, release, report, toggleMuted, mute]);
    return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}
