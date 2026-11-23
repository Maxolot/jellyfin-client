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

/** Chromium can refract the backdrop through an SVG filter. */
export const refractionSupported = typeof navigator !== 'undefined'
    && !!(navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands?.some(entry => entry.brand === 'Chromium');

/** Firefox cannot, but can paint a live copy of the video with -moz-element() and filter that copy instead. */
// eslint-disable-next-line compat/compat -- Guarded by the typeof check; engines without CSS.supports keep the plain blur.
const elementCopySupported = !refractionSupported && typeof CSS !== 'undefined' && CSS.supports('background-image', '-moz-element(#a)');

const VIDEO_ID = 'client-player-video';

/** Lines the video copy behind each glass control up with the video itself. */
function useVideoCopy(enabled: boolean) {
    useEffect(() => {
        if (!enabled) return;
        let frame = 0;
        const place = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const video = document.querySelector<HTMLVideoElement>('.videoPlayerContainer video, video');
                if (!video) return;
                if (!video.id) video.id = VIDEO_ID;
                // -moz-element() paints the frame over the whole element, ignoring object-fit:
                // the copy is sized to the visible frame, letterbox excluded.
                const box = video.getBoundingClientRect();
                const scale = video.videoWidth && video.videoHeight ? Math.min(box.width / video.videoWidth, box.height / video.videoHeight) : 0;
                const width = scale ? video.videoWidth * scale : box.width;
                const height = scale ? video.videoHeight * scale : box.height;
                const source = { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
                document.querySelectorAll<HTMLElement>('.client-player .client-liquid-glass').forEach(control => {
                    const area = control.getBoundingClientRect();
                    const values: [string, string][] = [['--glass-copy', `-moz-element(#${video.id})`], ['--glass-copy-x', `${Math.round(source.left - area.left)}px`],
                        ['--glass-copy-y', `${Math.round(source.top - area.top)}px`], ['--glass-copy-w', `${Math.round(source.width)}px`], ['--glass-copy-h', `${Math.round(source.height)}px`]];
                    // Unchanged values are left alone: rewriting them restyles the layer for nothing.
                    for (const [name, value] of values) if (control.style.getPropertyValue(name) !== value) control.style.setProperty(name, value);
                });
            });
        };
        place();
        // Controls fade in and out and the window can change: realign a few times a second.
        const timer = window.setInterval(place, 400);
        window.addEventListener('resize', place);
        return () => {
            cancelAnimationFrame(frame);
            window.clearInterval(timer);
            window.removeEventListener('resize', place);
        };
    }, [enabled]);
}

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
    useVideoCopy(elementCopySupported);
    const tile = useNoiseTile(refractionSupported || elementCopySupported);
    if (!refractionSupported && !elementCopySupported) return null;
    return <svg className={`client-liquid-glass-defs ${refractionSupported ? 'is-backdrop' : 'is-copy'}`} width='0' height='0' aria-hidden='true' focusable='false'>
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
