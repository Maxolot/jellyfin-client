import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import HeroArtwork from './HeroArtwork';

let root: Root;
let container: HTMLDivElement;
const layers = () => [...container.querySelectorAll('img')].map(img => `${img.getAttribute('src')}${img.classList.contains('artwork-loaded') ? '*' : ''}`);
const show = async (source: string) => act(async () => root.render(<HeroArtwork source={source} fadeMs={1600} crossfade />));
async function load(source: string) {
    await act(async () => {
        container.querySelector(`img[src="${source}"]`)!.dispatchEvent(new Event('load'));
    });
    // decode() then two animation frames before the image is revealed.
    await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
    });
}

beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: () => Promise.resolve() });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
});

describe('page background crossfade', () => {
    it('fades the previous image out while the next fades in, then drops it once invisible', async () => {
        await show('a');
        await load('a');
        expect(layers()).toEqual(['a*']);
        await show('b');
        // Until b has loaded, a stays shown.
        expect(layers()).toEqual(['a*', 'b']);
        await load('b');
        // Both layers are still there: a fades out underneath while b fades in.
        expect(layers()).toEqual(['a', 'b*']);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1600);
        });
        expect(layers()).toEqual(['b*']);
    });

    it('keeps an image that is still fading when the pointer moves on, instead of cutting it', async () => {
        await show('a');
        await load('a');
        await show('b');
        await load('b');
        await show('c');
        // a and b are both still on screen, fading; nothing is removed at once.
        expect(layers()).toEqual(['a', 'b*', 'c']);
        await load('c');
        expect(layers()).toEqual(['a', 'b', 'c*']);
        // Coming back to b while it fades out brings it back in place, without reloading it.
        await show('b');
        expect(layers()).toEqual(['a', 'b*', 'c']);
    });
});
