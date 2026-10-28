import { type RefObject, useEffect } from 'react';

/** Observe section entries, rather than running a scroll/animation loop at rest. */
export default function useClientMotion(surface: RefObject<HTMLDivElement>) {
    useEffect(() => {
        const header = surface.current?.querySelector<HTMLElement>('.client-nav');
        if (!header) return;
        let frame = 0;
        let point = { x: 0, y: 0 };
        const move = (event: PointerEvent) => {
            if (event.pointerType !== 'mouse' || !header.closest('.client-glass:not(.client-floating)') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            point = { x: event.clientX, y: event.clientY };
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                const rect = header.getBoundingClientRect();
                header.style.setProperty('--glass-x', `${(point.x - rect.left) / rect.width * 100}%`);
                header.style.setProperty('--glass-y', `${(point.y - rect.top) / rect.height * 100}%`);
            });
        };
        const leave = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            header.style.removeProperty('--glass-x');
            header.style.removeProperty('--glass-y');
        };
        header.addEventListener('pointermove', move, { passive: true });
        header.addEventListener('pointerleave', leave);
        return () => {
            leave();
            header.removeEventListener('pointermove', move);
            header.removeEventListener('pointerleave', leave);
        };
    }, [surface]);
    useEffect(() => {
        const root = surface.current;
        if (!root || !('IntersectionObserver' in window)) return;
        const seen = new WeakSet<Element>();
        const observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (entry.target.classList.contains('client-home-hero')) {
                    entry.target.classList.toggle('client-motion-visible', entry.isIntersecting);
                } else if (entry.isIntersecting) {
                    entry.target.classList.remove('client-reveal-pending');
                    entry.target.classList.add('client-reveal-enter');
                    observer.unobserve(entry.target);
                }
            }
        }, { threshold: 0.04 });
        const discover = () => {
            root.querySelectorAll('.client-home-hero, .client-row, .client-grid, .client-detail-extras > section, .client-personal-collections').forEach(element => {
                if (seen.has(element)) return;
                seen.add(element);
                if (!element.classList.contains('client-home-hero') && element.getBoundingClientRect().top > window.innerHeight) element.classList.add('client-reveal-pending');
                observer.observe(element);
            });
        };
        const visibility = () => {
            // eslint-disable-next-line compat/compat -- Progressive enhancement; old browsers keep artwork static.
            root.dataset.motionPaused = String(document.visibilityState === 'hidden');
        };
        visibility();
        discover();
        const mutations = new MutationObserver(discover);
        mutations.observe(root, { childList: true, subtree: true });
        document.addEventListener('visibilitychange', visibility);
        return () => {
            observer.disconnect();
            mutations.disconnect();
            document.removeEventListener('visibilitychange', visibility);
        };
    }, [surface]);
}
