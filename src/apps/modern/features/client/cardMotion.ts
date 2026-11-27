export const CARD_HOVER_DELAY = 120;

type CardPosition = { node: HTMLElement; left: number; width: number };
export type CardLayout = CardPosition[];

export function captureCardLayout(strip: HTMLDivElement): CardLayout | undefined {
    if (typeof HTMLElement.prototype.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const viewport = strip.getBoundingClientRect();
    return Array.from(strip.children).flatMap(node => {
        if (!(node instanceof HTMLElement)) return [];
        const { left, right, width } = node.getBoundingClientRect();
        if (right < viewport.left || left > viewport.right || !width) return [];
        return [{ node, left: left - viewport.left + strip.scrollLeft, width }];
    });
}

/** Measure the final flex layout once, then animate its visible coordinates without reflow. */
export function animateCardLayout(strip: HTMLDivElement, previous: CardLayout, active: Element) {
    const stripStart = strip.getBoundingClientRect().left - strip.scrollLeft;
    const frames = previous.map(({ node, left, width }) => {
        const { left: end, width: endWidth } = node.getBoundingClientRect();
        const offset = left - end + stripStart;
        const scale = node === active && endWidth ? width / endWidth : 1;
        return { node, offset, scale };
    });
    // Keep all reads before the animation writes. WAAPI composites only while the effect runs.
    return frames.flatMap(({ node, offset, scale }) => {
        if (Math.abs(offset) < 1 && Math.abs(scale - 1) < 0.003) return [];
        return [node.animate([
            { transform: `translateX(${offset}px) scaleX(${scale})` },
            { transform: 'none' }
        ], { duration: 280, easing: 'cubic-bezier(0.22, 0.8, 0.2, 1)' })];
    });
}

export function stopCardLayout(animations: Animation[]) {
    for (const animation of animations) {
        animation.cancel();
    }
}
