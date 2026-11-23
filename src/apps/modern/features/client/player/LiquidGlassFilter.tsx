import React from 'react';

/*
 * Displacement map for the lens: red follows x and green follows y, neutral grey in the
 * middle, so only the rim bends what lies behind the control, as Apple's Liquid Glass does.
 */
const MAP = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
<defs>
<linearGradient id='x'><stop offset='0' stop-color='#000'/><stop offset='1' stop-color='#f00'/></linearGradient>
<linearGradient id='y' x2='0' y2='1'><stop offset='0' stop-color='#000'/><stop offset='1' stop-color='#0f0'/></linearGradient>
<radialGradient id='c'><stop offset='0.55' stop-color='#808080'/><stop offset='1' stop-color='#808080' stop-opacity='0'/></radialGradient>
</defs>
<rect width='100' height='100' fill='url(#x)'/>
<rect width='100' height='100' fill='url(#y)' style='mix-blend-mode:screen'/>
<rect width='100' height='100' fill='url(#c)'/>
</svg>`);

/** Chromium can refract the backdrop through an SVG filter; other engines keep the blurred glass. */
export const refractionSupported = typeof navigator !== 'undefined'
    && !!(navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands?.some(entry => entry.brand === 'Chromium');

export default function LiquidGlassFilter() {
    if (!refractionSupported) return null;
    return <svg className='client-liquid-glass-defs' width='0' height='0' aria-hidden='true' focusable='false'>
        <filter id='client-liquid-glass' x='0' y='0' width='100%' height='100%' colorInterpolationFilters='sRGB'>
            <feImage href={MAP} x='0' y='0' width='100%' height='100%' preserveAspectRatio='none' result='map' />
            <feDisplacementMap in='SourceGraphic' in2='map' scale='-26' xChannelSelector='R' yChannelSelector='G' />
        </filter>
    </svg>;
}
