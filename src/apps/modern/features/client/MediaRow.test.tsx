import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MediaRow from './MediaRow';

vi.mock('./FavoriteAction', () => ({ default: () => null }));
vi.mock('./PreviewClip', () => ({ default: () => null }));
const noLogo = () => undefined;
const prepare = () => undefined;
const action = async () => undefined;
const items = ['a', 'b', 'c'].map(Id => ({ Id, Name: Id, Type: 'Movie' as const }));
const image = (item: BaseItemDto, wide = false) => `https://media.example.test/${item.Id}-${wide ? 'wide' : 'poster'}.jpg`;
function Location() {
    return <output>{useLocation().search}</output>;
}
let root: Root;
let container: HTMLDivElement;
const decodes = new Map<string, () => void>();
const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');

beforeEach(async () => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    decodes.clear();
    vi.stubGlobal('IntersectionObserver', class {
        constructor(private callback: IntersectionObserverCallback) {}
        observe(target: Element) { this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
        disconnect() { /* This fake reports intersection synchronously. */ }
    });
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: function (this: HTMLImageElement) {
        return new Promise<void>(resolve => decodes.set(this.src, resolve));
    } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<MemoryRouter><Location /><MediaRow title='Films' items={items} image={image} logo={noLogo} onPrepare={prepare} onPlay={action} onFavorite={action} /></MemoryRouter>));
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    if (originalDecode) Object.defineProperty(HTMLImageElement.prototype, 'decode', originalDecode);
    else Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
});
function card(index: number) {
    return container.querySelectorAll<HTMLElement>('.client-media-card')[index];
}
async function focus(index: number) {
    await act(async () => card(index).querySelector<HTMLElement>('.client-card')!.focus());
}
async function decode(index: number) {
    const img = card(index).querySelector<HTMLImageElement>('.client-card-backdrop')!;
    await act(async () => {
        img.dispatchEvent(new Event('load'));
    });
    await act(async () => decodes.get(img.src)!());
}

describe('prepared landscape handoff', () => {
    it('prepares nearby images but expands only after the requested landscape is decoded', async () => {
        expect(card(0).querySelector('img.client-card-backdrop')!.getAttribute('src')).toBe(image(items[0], true));
        await focus(0);
        expect(container.querySelector('.active')).toBeNull();
        const img = card(0).querySelector<HTMLImageElement>('.client-card-backdrop')!;
        await act(async () => {
            img.dispatchEvent(new Event('load'));
        });
        expect(container.querySelector('.active')).toBeNull();
        await act(async () => decodes.get(img.src)!());
        expect(card(0).classList.contains('active')).toBe(true);
        expect(card(0).classList.contains('has-backdrop')).toBe(true);
    });
    it('closes the previous focus and only opens the latest requested image', async () => {
        await decode(0);
        await focus(0);
        await focus(1);
        await focus(2);
        expect(container.querySelector('.active')).toBeNull();
        await decode(1);
        expect(container.querySelector('.active')).toBeNull();
        await decode(2);
        expect(card(2).classList.contains('active')).toBe(true);
        expect(card(0).classList.contains('active')).toBe(false);
    });
    it('cancels pending expansion on pointer exit and does not reopen after late decode', async () => {
        await focus(0);
        await act(async () => {
            const event = new Event('pointerout', { bubbles: true });
            Object.defineProperty(event, 'pointerType', { value: 'mouse' });
            card(0).dispatchEvent(event);
        });
        await decode(0);
        expect(container.querySelector('.active')).toBeNull();
    });
    it('closes this row when another row claims selection', async () => {
        await decode(0);
        await focus(0);
        expect(card(0).classList.contains('active')).toBe(true);
        await act(async () => {
            window.dispatchEvent(new CustomEvent('client-card-select', { detail: 'another-row' }));
        });
        expect(container.querySelector('.active')).toBeNull();
    });
    it('opens details on a second touch even while the landscape is pending', async () => {
        const link = card(1).querySelector<HTMLElement>('.client-card')!;
        async function tap() {
            await act(async () => {
                const pointer = new Event('pointerdown', { bubbles: true });
                Object.defineProperty(pointer, 'pointerType', { value: 'touch' });
                link.dispatchEvent(pointer);
                link.click();
            });
        }
        await tap();
        expect(container.querySelector('output')!.textContent).toBe('');
        expect(container.querySelector('.active')).toBeNull();
        await tap();
        expect(container.querySelector('output')!.textContent).toBe('?id=b');
    });
    it('keeps navigation/actions usable with the poster when a landscape fails', async () => {
        await focus(1);
        await act(async () => {
            card(1).querySelector('img.client-card-backdrop')!.dispatchEvent(new Event('error'));
        });
        expect(card(1).classList.contains('active')).toBe(true);
        expect(card(1).classList.contains('has-backdrop')).toBe(false);
        expect(card(1).querySelector('a.client-card')!.getAttribute('href')).toContain('id=b');
    });
});
