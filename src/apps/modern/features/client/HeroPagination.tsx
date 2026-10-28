/* eslint-disable react/jsx-no-bind -- Each marker selects its own slide. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import useMediaQuery from '@mui/material/useMediaQuery';
import React, { useEffect, useRef } from 'react';

function paintMarker(svg: SVGSVGElement, head: number, tail: number) {
    const distance = head - tail;
    const stretch = Math.min(Math.abs(distance) / 28, 1);
    const headRadius = 5.1 + stretch * 0.55;
    const tailRadius = 5.1 - stretch * 1.35;
    for (const [selector, x, radius] of [['.marker-head', head, headRadius], ['.marker-tail', tail, tailRadius]] as const) {
        const element = svg.querySelector(selector)!;
        element.setAttribute('cx', String(x));
        element.setAttribute('rx', String(radius + stretch * 0.75));
        element.setAttribute('ry', String(radius - stretch * 0.65));
    }
    svg.querySelector('.marker-neck')!.setAttribute('d', `M ${tail} ${16 - tailRadius * 0.65} C ${tail + distance * 0.38} ${16 - tailRadius * 0.3},${head - distance * 0.38} ${16 - headRadius * 0.3},${head} ${16 - headRadius * 0.65} L ${head} ${16 + headRadius * 0.65} C ${head - distance * 0.38} ${16 + headRadius * 0.3},${tail + distance * 0.38} ${16 + tailRadius * 0.3},${tail} ${16 + tailRadius * 0.65} Z`);
    svg.querySelector('.marker-glint')!.setAttribute('cx', String(head - 0.6));
}

export default function HeroPagination({ items, index, select }: Readonly<{ items: BaseItemDto[]; index: number; select: (index: number) => void }>) {
    const svg = useRef<SVGSVGElement>(null);
    const position = useRef({ head: 14 + index * 28, tail: 14 + index * 28 });
    const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
    useEffect(() => {
        if (!svg.current) return;
        const element = svg.current;
        const target = 14 + index * 28;
        const from = { ...position.current };
        if (reduced || Math.abs(from.head - target) < 0.01) {
            position.current = { head: target, tail: target };
            paintMarker(element, target, target);
            return;
        }
        const start = performance.now();
        let frame: number;
        const animate = (now: number) => {
            const progress = Math.min(1, (now - start) / 850);
            const headProgress = 1 - Math.pow(1 - progress, 3.1);
            const lag = Math.max(0, (progress - 0.14) / 0.86);
            const tailProgress = lag * lag * (3 - 2 * lag);
            position.current = { head: from.head + (target - from.head) * headProgress, tail: from.tail + (target - from.tail) * tailProgress };
            paintMarker(element, position.current.head, position.current.tail);
            if (progress < 1) frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frame);
    }, [index, reduced]);
    return <div className='client-hero-dots client-liquid-dots' aria-label='Médias à la une'>
        <svg ref={svg} className='client-liquid-marker' viewBox={`0 0 ${items.length * 28} 32`} aria-hidden='true'><path className='marker-neck' /><ellipse className='marker-tail' cy='16' /><ellipse className='marker-head' cy='16' /><ellipse className='marker-glint' cy='13.9' rx='2.1' ry='0.75' /></svg>
        {items.map((item, value) => <button key={item.Id} aria-label={`Afficher ${item.Name}`} aria-pressed={index === value} onClick={() => select(value)} />)}
    </div>;
}
/* eslint-enable react/jsx-no-bind */
