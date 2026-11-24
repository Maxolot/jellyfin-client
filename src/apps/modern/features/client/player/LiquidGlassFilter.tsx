import React, { useEffect, useState } from 'react';

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

/** Chromium can refract the backdrop through an SVG filter; other engines keep the plain thick blur. */
export const refractionSupported = typeof navigator !== 'undefined'
    && !!(navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands?.some(entry => entry.brand === 'Chromium');

const NOISE_SIZE = 256;
const NOISE_SVG = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${NOISE_SIZE}' height='${NOISE_SIZE}'>
<filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.012 0.018' numOctaves='2' seed='7' stitchTiles='stitch'/></filter>
<rect width='100%' height='100%' filter='url(#n)'/></svg>`);
let noiseTile: Promise<string> | undefined;

/**
 * The swirl noise is drawn once into a seamless bitmap tile. Generating feTurbulence inside the
 * live filter would redo it for every video frame, which made the glass stutter.
 */
function loadNoiseTile() {
    noiseTile ??= new Promise<string>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = NOISE_SIZE;
            canvas.height = NOISE_SIZE;
            const context = canvas.getContext('2d');
            if (!context) return reject(new Error('No canvas'));
            context.drawImage(image, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        image.onerror = reject;
        image.src = NOISE_SVG;
    });
    return noiseTile;
}

function useNoiseTile(enabled: boolean) {
    const [tile, setTile] = useState('');
    useEffect(() => {
        if (!enabled) return;
        let current = true;
        loadNoiseTile().then(url => {
            if (current) setTile(url);
        }).catch(() => undefined);
        return () => {
            current = false;
        };
    }, [enabled]);
    return tile;
}

/** The swirl source: the cached tile once ready, live turbulence until then. */
function Noise({ tile }: Readonly<{ tile: string }>) {
    if (!tile) return <feTurbulence type='fractalNoise' baseFrequency='0.012 0.018' numOctaves='2' seed='7' result='noise' />;
    return <>
        <feImage href={tile} x='0' y='0' width={NOISE_SIZE} height={NOISE_SIZE} result='tile' />
        <feTile in='tile' result='noise' />
    </>;
}

export default function LiquidGlassFilter() {
    const tile = useNoiseTile(refractionSupported);
    if (!refractionSupported) return null;
    return <svg className='client-liquid-glass-defs is-backdrop' width='0' height='0' aria-hidden='true' focusable='false'>
        <filter id='client-liquid-glass' x='0' y='0' width='100%' height='100%' colorInterpolationFilters='sRGB'>
            {/* Low-frequency noise smears the blurred backdrop into soft swirls… */}
            <Noise tile={tile} />
            <feDisplacementMap in='SourceGraphic' in2='noise' scale='42' xChannelSelector='R' yChannelSelector='G' result='swirl' />
            {/* …then the lens bends it at the rim. */}
            <feImage href={MAP} x='0' y='0' width='100%' height='100%' preserveAspectRatio='none' result='map' />
            <feDisplacementMap in='swirl' in2='map' scale='-18' xChannelSelector='R' yChannelSelector='G' />
        </filter>
        <filter id='client-liquid-glass-bar' x='0' y='0' width='100%' height='100%' colorInterpolationFilters='sRGB'>
            <Noise tile={tile} />
            <feDisplacementMap in='SourceGraphic' in2='noise' scale='42' xChannelSelector='R' yChannelSelector='G' />
        </filter>
    </svg>;
}
