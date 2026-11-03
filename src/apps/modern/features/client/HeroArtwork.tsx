/* eslint-disable react/jsx-no-bind -- Image lifecycle is local to this component. */
import React, { useEffect, useRef, useState } from 'react';

import { ImageSkeleton } from './ClientSkeleton';

type Frame = { source: string; visible: boolean; failed?: boolean };

/** Keep the previous artwork until its replacement has loaded and finished fading. */
export default function HeroArtwork({ source, fadeMs = 900 }: { readonly source: string; readonly fadeMs?: number }) {
    const scheduled = useRef(new Set<number>());
    const disposed = useRef(false);
    useEffect(() => {
        disposed.current = false;
        const callbacks = scheduled.current;
        return () => {
            disposed.current = true;
            callbacks.forEach(cancelAnimationFrame);
            callbacks.clear();
        };
    }, []);
    const [frames, setFrames] = useState<Frame[]>([{ source, visible: false }]);
    useEffect(() => {
        setFrames(previous => {
            const last = previous[previous.length - 1];
            const visible = [...previous].reverse().find(frame => frame.visible && !frame.failed);
            if (visible?.source === source) return [visible];
            return last.source === source ? previous : [...(visible ? [visible] : []), { source, visible: false }];
        });
    }, [source]);
    useEffect(() => {
        if (frames.length < 2 || !frames[frames.length - 1].visible) return;
        const timer = window.setTimeout(() => setFrames(previous => [previous[previous.length - 1]]), fadeMs);
        return () => window.clearTimeout(timer);
    }, [frames, fadeMs]);
    async function loaded(frameSource: string, image: HTMLImageElement) {
        try {
            if (typeof image.decode === 'function') await image.decode();
        } catch { return; }
        if (disposed.current) return;
        // Two frames give even cached images a painted transparent starting state.
        const first = requestAnimationFrame(() => {
            scheduled.current.delete(first);
            const second = requestAnimationFrame(() => {
                scheduled.current.delete(second);
                if (!disposed.current) reveal(frameSource);
            });
            scheduled.current.add(second);
        });
        scheduled.current.add(first);
    }
    function reveal(frameSource: string) {
        setFrames(previous => previous.map(entry => entry.source === frameSource ? { ...entry, visible: true } : entry));
    }
    function failed(frameSource: string) {
        setFrames(previous => previous.length > 1 ? previous.filter(entry => entry.source !== frameSource) : [{ source: frameSource, visible: true, failed: true }]);
    }
    return <>{source && !frames.some(frame => frame.visible || frame.failed) && <ImageSkeleton />}{frames.map(frame => <img key={frame.source} ref={element => element?.setAttribute('fetchpriority', 'high')} className={`client-background${frame.visible ? ' artwork-loaded' : ''}`} src={frame.source} alt='' decoding='async' hidden={frame.failed} onLoad={event => {
        void loaded(frame.source, event.currentTarget);
    }} onError={() => failed(frame.source)} />)}</>;
}
/* eslint-enable react/jsx-no-bind */
