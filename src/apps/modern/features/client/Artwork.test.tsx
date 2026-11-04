import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Artwork from './Artwork';
import HeroArtwork from './HeroArtwork';

let container: HTMLDivElement;
let root: Root;
let animationFrames: FrameRequestCallback[];
let finishDecode: () => void;
const previousDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');

beforeEach(() => {
    animationFrames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => animationFrames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: () => new Promise<void>(resolve => {
        finishDecode = resolve;
    }) });
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    if (previousDecode) Object.defineProperty(HTMLImageElement.prototype, 'decode', previousDecode);
    else Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
});

async function load(image: HTMLImageElement) {
    await act(async () => {
        image.dispatchEvent(new Event('load'));
    });
    await act(async () => finishDecode());
    for (let count = 0; count < 2; count++) {
        await act(async () => {
            const callbacks = animationFrames.splice(0);
            callbacks.forEach(callback => {
                callback(0);
            });
        });
    }
}

describe('decoded artwork transitions', () => {
    it('does not reveal pixels until decode finishes', async () => {
        await act(async () => root.render(<Artwork source='/poster.jpg' eager />));
        const image = container.querySelector('img')!;
        await act(async () => {
            image.dispatchEvent(new Event('load'));
        });
        expect(image.classList.contains('artwork-ready')).toBe(false);
        await act(async () => finishDecode());
        expect(image.classList.contains('artwork-ready')).toBe(true);
    });
    it('does not fetch disabled card backdrops', async () => {
        await act(async () => root.render(<Artwork source='/backdrop.jpg' enabled={false} eager />));
        expect(container.querySelector('img')!.getAttribute('src')).toBeNull();
    });
    it('does not allow an old image decode to reveal its replacement', async () => {
        await act(async () => root.render(<Artwork source='/old.jpg' eager />));
        const image = container.querySelector('img')!;
        await act(async () => {
            image.dispatchEvent(new Event('load'));
        });
        const oldDecode = finishDecode;
        await act(async () => root.render(<Artwork source='/new.jpg' eager />));
        await act(async () => oldDecode());
        expect(image.classList.contains('artwork-ready')).toBe(false);
        await load(image);
        expect(image.classList.contains('artwork-ready')).toBe(true);
    });
    it('keeps the visible hero through rapid pending changes and an image failure', async () => {
        await act(async () => root.render(<HeroArtwork source='/first.jpg' />));
        await load(container.querySelector('img')!);
        await act(async () => root.render(<HeroArtwork source='/second.jpg' />));
        await act(async () => root.render(<HeroArtwork source='/third.jpg' />));
        expect(container.querySelector('.artwork-loaded')!.getAttribute('src')).toBe('/first.jpg');
        expect(container.querySelectorAll('img')).toHaveLength(2);
        await act(async () => {
            container.querySelector('img[src="/third.jpg"]')!.dispatchEvent(new Event('error'));
        });
        expect(container.querySelector('.artwork-loaded')!.getAttribute('src')).toBe('/first.jpg');
    });
    it('keeps the blurred hero fill synchronized with the decoded image', async () => {
        await act(async () => root.render(<HeroArtwork source='/first.jpg' backfill />));
        const main = container.querySelector<HTMLImageElement>('.client-background')!;
        const fill = container.querySelector<HTMLImageElement>('.client-background-backfill')!;
        expect(fill.classList.contains('artwork-loaded')).toBe(false);
        await load(main);
        expect(fill.classList.contains('artwork-loaded')).toBe(true);
        await act(async () => root.render(<HeroArtwork source='/second.jpg' backfill />));
        expect(container.querySelector('.client-background-backfill.artwork-loaded')?.getAttribute('src')).toBe('/first.jpg');
    });
    it('returning to the visible hero does not duplicate its image', async () => {
        await act(async () => root.render(<HeroArtwork source='/first.jpg' />));
        await load(container.querySelector('img')!);
        await act(async () => root.render(<HeroArtwork source='/pending.jpg' />));
        await act(async () => root.render(<HeroArtwork source='/first.jpg' />));
        expect(container.querySelectorAll('img')).toHaveLength(1);
    });
});
