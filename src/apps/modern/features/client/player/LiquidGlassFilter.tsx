import React, { useEffect } from 'react';

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
                    control.style.setProperty('--glass-copy', `-moz-element(#${video.id})`);
                    control.style.setProperty('--glass-copy-x', `${source.left - area.left}px`);
                    control.style.setProperty('--glass-copy-y', `${source.top - area.top}px`);
                    control.style.setProperty('--glass-copy-w', `${source.width}px`);
                    control.style.setProperty('--glass-copy-h', `${source.height}px`);
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

export default function LiquidGlassFilter() {
    useVideoCopy(elementCopySupported);
    if (!refractionSupported && !elementCopySupported) return null;
    return <svg className={`client-liquid-glass-defs ${refractionSupported ? 'is-backdrop' : 'is-copy'}`} width='0' height='0' aria-hidden='true' focusable='false'>
        <filter id='client-liquid-glass' x='0' y='0' width='100%' height='100%' colorInterpolationFilters='sRGB'>
            {/* Low-frequency noise smears the blurred backdrop into soft swirls… */}
            <feTurbulence type='fractalNoise' baseFrequency='0.012 0.018' numOctaves='2' seed='7' result='noise' />
            <feDisplacementMap in='SourceGraphic' in2='noise' scale='42' xChannelSelector='R' yChannelSelector='G' result='swirl' />
            {/* …then the lens bends it at the rim. */}
            <feImage href={MAP} x='0' y='0' width='100%' height='100%' preserveAspectRatio='none' result='map' />
            <feDisplacementMap in='swirl' in2='map' scale='-18' xChannelSelector='R' yChannelSelector='G' />
        </filter>
        <filter id='client-liquid-glass-bar' x='0' y='0' width='100%' height='100%' colorInterpolationFilters='sRGB'>
            <feTurbulence type='fractalNoise' baseFrequency='0.012 0.018' numOctaves='2' seed='7' result='noise' />
            <feDisplacementMap in='SourceGraphic' in2='noise' scale='42' xChannelSelector='R' yChannelSelector='G' />
        </filter>
    </svg>;
}
