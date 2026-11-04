import { type RefObject, useLayoutEffect } from 'react';
import ResizeObserver from 'resize-observer-polyfill';

/** Extend artwork behind the header using document flow, never the sticky scroll position. */
export default function useHeroBackground(region: RefObject<HTMLElement>, enabled: boolean, ready: boolean) {
    useLayoutEffect(() => {
        const element = region.current;
        if (!enabled || !ready || !element) return;
        const update = () => {
            const value = `${Math.max(0, element.offsetTop)}px`;
            if (element.style.getPropertyValue('--client-hero-offset') !== value) element.style.setProperty('--client-hero-offset', value);
        };
        update();
        const observer = new ResizeObserver(update);
        if (element.parentElement) observer.observe(element.parentElement);
        window.addEventListener('resize', update);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', update);
            element.style.removeProperty('--client-hero-offset');
        };
    }, [region, enabled, ready]);
}
