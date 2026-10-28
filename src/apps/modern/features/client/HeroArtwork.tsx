/* eslint-disable react/jsx-no-bind -- Image lifecycle is local to this component. */
import React, { useEffect, useState } from 'react';

type Frame = { source: string; visible: boolean; failed?: boolean };

/** Keep the previous artwork until its replacement has loaded and finished fading. */
export default function HeroArtwork({ source }: { readonly source: string }) {
    const [frames, setFrames] = useState<Frame[]>([{ source, visible: false }]);
    useEffect(() => {
        setFrames(previous => {
            const last = previous[previous.length - 1];
            return last.source === source ? previous : [last, { source, visible: false }];
        });
    }, [source]);
    useEffect(() => {
        if (frames.length < 2 || !frames[frames.length - 1].visible) return;
        const timer = window.setTimeout(() => setFrames(previous => [previous[previous.length - 1]]), 900);
        return () => window.clearTimeout(timer);
    }, [frames]);
    function loaded(frameSource: string) {
        setFrames(previous => previous.map(entry => entry.source === frameSource ? { ...entry, visible: true } : entry));
    }
    function failed(frameSource: string) {
        setFrames(previous => previous[previous.length - 1].source === frameSource ? [{ source: frameSource, visible: true, failed: true }] : previous);
    }
    return <>{frames.map(frame => <img key={frame.source} className={`client-background${frame.visible ? ' artwork-loaded' : ''}`} src={frame.source} alt='' hidden={frame.failed} onLoad={() => loaded(frame.source)} onError={() => failed(frame.source)} />)}</>;
}
/* eslint-enable react/jsx-no-bind */
