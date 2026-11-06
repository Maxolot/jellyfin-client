import { type RefObject, useLayoutEffect } from 'react';
import ResizeObserver from 'resize-observer-polyfill';

/**
 * Extend artwork behind the header using document flow, never the sticky scroll position.
 * While the page scrolls, `--hero-frame` goes from 0 (full screen) to 1 (framed card): the artwork and its clip are
 * cut by a clip-path driven by that value, so the full-screen hero never needs a blurred edge.
 */
export default function useHeroBackground(region: RefObject<HTMLElement>, enabled: boolean, ready: boolean) {
    useLayoutEffect(() => {
        const element = region.current;
        if (!enabled || !ready || !element) return;
        let frame = 0;
        const update = () => {
            const value = `${Math.max(0, element.offsetTop)}px`;
            if (element.style.getPropertyValue('--client-hero-offset') !== value) element.style.setProperty('--client-hero-offset', value);
        };
        const follow = () => {
            frame = 0;
            // Fully framed once half the hero has scrolled away.
            const progress = Math.max(0, Math.min(1, window.scrollY / Math.max(1, element.offsetHeight * 0.5)));
            const value = progress.toFixed(3);
            if (element.style.getPropertyValue('--hero-frame') !== value) element.style.setProperty('--hero-frame', value);
        };
        const scrolled = () => {
            if (!frame) frame = requestAnimationFrame(follow);
        };
        update();
        follow();
        const observer = new ResizeObserver(update);
        if (element.parentElement) observer.observe(element.parentElement);
        window.addEventListener('resize', update);
        window.addEventListener('scroll', scrolled, { passive: true });
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', scrolled);
            element.style.removeProperty('--client-hero-offset');
            element.style.removeProperty('--hero-frame');
        };
    }, [region, enabled, ready]);
}
