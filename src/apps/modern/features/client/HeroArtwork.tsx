/* eslint-disable react/jsx-no-bind -- Image lifecycle is local to this component. */
import React, { useEffect, useRef, useState } from 'react';

import { ImageSkeleton } from './ClientSkeleton';

type Frame = { source: string; visible: boolean; failed?: boolean };

/** Keep the previous artwork until its replacement has loaded and finished fading. */
/**
 * `crossfade`: for see-through layers (the blurred page background). The previous image fades out while the new one
 * fades in, and images still fading are kept: dropping a translucent layer at once is a visible jump.
 */
export default function HeroArtwork({ source, fadeMs = 900, fullBackground = false, crossfade = false }: { readonly source: string; readonly fadeMs?: number; readonly fullBackground?: boolean; readonly crossfade?: boolean }) {
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
            if (crossfade) {
                if (last.source === source) return previous;
                const shown = previous.filter(frame => frame.visible && !frame.failed);
                // Coming back to an image still on screen: it simply fades back in, nothing is reloaded or moved.
                if (shown.some(frame => frame.source === source)) return previous.filter(frame => frame.visible && !frame.failed);
                return [...shown.slice(-3), { source, visible: false }];
            }
            if (visible?.source === source) return [visible];
            return last.source === source ? previous : [...(visible ? [visible] : []), { source, visible: false }];
        });
    }, [source, crossfade]);
    useEffect(() => {
        if (frames.length < 2) return;
        if (crossfade) {
            // Once the wanted image is in front and the others have faded out, only it is kept.
            if (!frames.some(frame => frame.source === source && frame.visible)) return;
            const timer = window.setTimeout(() => setFrames(previous => previous.filter(frame => frame.source === source)), fadeMs);
            return () => window.clearTimeout(timer);
        }
        if (!frames[frames.length - 1].visible) return;
        const timer = window.setTimeout(() => setFrames(previous => [previous[previous.length - 1]]), fadeMs);
        return () => window.clearTimeout(timer);
    }, [frames, fadeMs, crossfade, source]);
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
    // In crossfade mode only the newest loaded image is shown; the others fade out underneath.
    // The wanted image once loaded, otherwise the newest one already shown, so the page never goes blank meanwhile.
    const wanted = frames.findIndex(frame => frame.source === source && frame.visible && !frame.failed);
    const front = crossfade && wanted < 0 ? frames.reduce((found, frame, index) => (frame.visible && !frame.failed ? index : found), -1) : wanted;
    const artwork = <>{source && !frames.some(frame => frame.visible || frame.failed) && <ImageSkeleton />}{frames.map(frame => <img key={frame.source} ref={element => element?.setAttribute('fetchpriority', 'high')} className={`client-background${frame.visible && (!crossfade || frames.indexOf(frame) === front) ? ' artwork-loaded' : ''}`} src={frame.source} alt='' decoding='async' hidden={frame.failed} onLoad={event => {
        void loaded(frame.source, event.currentTarget);
    }} onError={() => failed(frame.source)} />)}</>;
    return fullBackground ? <div className='client-hero-image-layer'>{artwork}</div> : artwork;
}
/* eslint-enable react/jsx-no-bind */
