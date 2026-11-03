/* eslint-disable react/jsx-no-bind -- Each marker selects its own slide. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import useMediaQuery from '@mui/material/useMediaQuery';
import React, { type CSSProperties, type MutableRefObject, useEffect, useId, useRef } from 'react';

export type MarkerPosition = { head: number; tail: number };

const STEP = 28;
const center = (index: number) => STEP / 2 + index * STEP;

function paintMarker(svg: SVGSVGElement, head: number, tail: number) {
    const distance = head - tail;
    const stretch = Math.min(Math.abs(distance) / STEP, 1);
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

// The marker position lives in the hero (`position`), so the drop keeps flowing while the hero copy remounts per slide.
export default function HeroPagination({ items, index, select, position }: Readonly<{ items: BaseItemDto[]; index: number; select: (index: number) => void; position: MutableRefObject<MarkerPosition | null> }>) {
    const svg = useRef<SVGSVGElement>(null);
    const filter = `client-liquid-${useId().replace(/:/g, '')}`;
    const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
    useEffect(() => {
        if (!svg.current) return;
        const element = svg.current;
        const target = center(index);
        const from = position.current || { head: target, tail: target };
        if (reduced || (Math.abs(from.head - target) < 0.01 && Math.abs(from.tail - target) < 0.01)) {
            position.current = { head: target, tail: target };
            paintMarker(element, target, target);
            return;
        }
        const start = performance.now();
        const duration = 780 + Math.min(Math.abs(target - from.head) / STEP, 2) * 100;
        let frame: number;
        const animate = (now: number) => {
            const progress = Math.min(1, (now - start) / duration);
            const headProgress = 1 - Math.pow(1 - progress, 3.1);
            const lag = Math.max(0, (progress - 0.14) / 0.86);
            const tailProgress = lag * lag * (3 - 2 * lag);
            position.current = { head: from.head + (target - from.head) * headProgress, tail: from.tail + (target - from.tail) * tailProgress };
            paintMarker(element, position.current.head, position.current.tail);
            if (progress < 1) frame = requestAnimationFrame(animate);
        };
        paintMarker(element, from.head, from.tail);
        frame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frame);
    }, [index, reduced, position]);
    return <div className='client-hero-dots client-liquid-dots' role='group' aria-label='Médias à la une' style={{ '--dot-count': items.length } as CSSProperties}>
        <svg ref={svg} className='client-liquid-marker' viewBox={`0 0 ${items.length * STEP} 32`} aria-hidden='true'>
            <defs><filter id={filter} x='-30%' y='-100%' width='160%' height='300%' colorInterpolationFilters='sRGB'><feGaussianBlur in='SourceGraphic' stdDeviation='2.2' result='blur' /><feColorMatrix in='blur' mode='matrix' values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 22 -9' /></filter></defs>
            <g className='marker-fluid' filter={`url(#${filter})`}><path className='marker-neck' /><ellipse className='marker-tail' cy='16' /><ellipse className='marker-head' cy='16' /></g>
            <ellipse className='marker-glint' cy='13.9' rx='2.1' ry='0.75' />
        </svg>
        {items.map((item, value) => <button key={item.Id} aria-label={`Afficher ${item.Name}`} aria-pressed={index === value} onClick={() => select(value)} />)}
    </div>;
}
/* eslint-enable react/jsx-no-bind */
