/* eslint-disable react/jsx-no-bind -- Decoding belongs to the individual image lifecycle. */
import React, { useEffect, useRef, useState } from 'react';

import { rememberDecoded, wasDecoded } from './artwork';
import { ImageSkeleton } from './ClientSkeleton';

type Props = {
    source: string;
    className?: string;
    alt?: string;
    eager?: boolean;
    enabled?: boolean;
    onReady?: () => void;
    onFailure?: () => void;
    rootMargin?: string;
};

/** Reveal decoded pixels, rather than exposing a progressive JPEG as it arrives. */
export default function Artwork({ source, className = '', alt = '', eager = false, enabled = true, onReady, onFailure, rootMargin = '600px 300px' }: Readonly<Props>) {
    const ref = useRef<HTMLImageElement>(null);
    const known = !!source && wasDecoded(source);
    const [nearby, setNearby] = useState(eager || known);
    const [decoded, setDecoded] = useState('');
    const [failed, setFailed] = useState('');
    useEffect(() => {
        if (!enabled || nearby || !ref.current) return;
        if (!('IntersectionObserver' in window)) {
            setNearby(true);
            return;
        }
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                setNearby(true);
                observer.disconnect();
            }
        }, { rootMargin });
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, [enabled, nearby, rootMargin]);
    const ready = decoded === source || known;
    const requested = (enabled && (eager || nearby)) || ready ? source : undefined;
    const pending = !!requested && !ready && failed !== source && !className.includes('logo');
    return <>{pending && <ImageSkeleton />}<img ref={ref} className={`client-artwork ${className}${ready ? ' artwork-ready' : ''}`} src={requested || undefined}
        alt={alt} decoding='async' hidden={failed === source} onLoad={async event => {
            const element = event.currentTarget;
            const loadedSource = source;
            try {
                if (typeof element.decode === 'function') await element.decode();
                if (element === ref.current && element.getAttribute('src') === loadedSource) {
                    rememberDecoded(loadedSource);
                    setDecoded(loadedSource);
                    onReady?.();
                }
            } catch { /* A superseded decode is expected during quick navigation. */ }
        }} onError={() => {
            setFailed(source);
            onFailure?.();
        }} /></>;
}
/* eslint-enable react/jsx-no-bind */
