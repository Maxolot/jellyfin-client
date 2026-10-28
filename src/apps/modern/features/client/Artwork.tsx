/* eslint-disable react/jsx-no-bind -- Decoding belongs to the individual image lifecycle. */
import React, { useEffect, useRef, useState } from 'react';

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
    const [nearby, setNearby] = useState(eager);
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
    const requested = (enabled && (eager || nearby)) || decoded === source ? source : undefined;
    return <img ref={ref} className={`client-artwork ${className}${decoded === source ? ' artwork-ready' : ''}`} src={requested || undefined}
        alt={alt} decoding='async' hidden={failed === source} onLoad={async event => {
            const element = event.currentTarget;
            const loadedSource = source;
            try {
                if (typeof element.decode === 'function') await element.decode();
                if (element === ref.current && element.getAttribute('src') === loadedSource) {
                    setDecoded(loadedSource);
                    onReady?.();
                }
            } catch { /* A superseded decode is expected during quick navigation. */ }
        }} onError={() => {
            setFailed(source);
            onFailure?.();
        }} />;
}
/* eslint-enable react/jsx-no-bind */
