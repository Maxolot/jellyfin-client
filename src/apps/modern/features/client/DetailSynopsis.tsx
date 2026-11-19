import React, { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import ResizeObserver from 'resize-observer-polyfill';

export default function DetailSynopsis({ overview }: Readonly<{ overview?: string | null }>) {
    const paragraph = useRef<HTMLParagraphElement>(null);
    const id = useId();
    const [expanded, expand] = useState(false);
    const [overflowing, setOverflowing] = useState(false);
    const toggle = useCallback(() => expand(current => !current), []);
    useLayoutEffect(() => {
        const node = paragraph.current;
        if (!node || expanded) return;
        function measure() {
            if (node) setOverflowing(node.scrollHeight > node.clientHeight + 1);
        }
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, [overview, expanded]);
    if (!overview) return null;
    return <>
        <p ref={paragraph} id={id} className={`client-overview${expanded ? ' expanded' : ''}`}>{overview}</p>
        {(overflowing || expanded) && <button type='button' className='client-synopsis-toggle' aria-controls={id} aria-expanded={expanded} onClick={toggle}>
            {expanded ? 'Réduire' : 'Lire la suite'}
        </button>}
    </>;
}
