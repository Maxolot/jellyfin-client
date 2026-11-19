import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MediaRow from './MediaRow';

vi.mock('./PreviewClip', () => ({ default: () => null }));
vi.mock('./SharedCatalogArtwork', () => ({
    default: ({ className }: { className?: string }) => <span className={className} data-shared-art='' />
}));
const noLogo = () => undefined;
const noImage = () => '';
const prepare = () => undefined;
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
    await act(async () => root.render(<MemoryRouter><Location /><MediaRow title='Films' items={items} image={image} logo={noLogo} onPrepare={prepare} /></MemoryRouter>));
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
    it('keeps the name on the expanded card and out of the copy below the row', async () => {
        await decode(0);
        await focus(0);
        expect(card(0).querySelector('a')?.getAttribute('aria-label')).toBe(items[0].Name);
        expect(card(0).querySelector('.client-expanded-title')?.textContent).toBe(items[0].Name);
        expect(container.querySelector('.client-row-info h3')).toBeNull();
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
    it('waits for hover intent, folds on leave and ignores a sweep across cards', async () => {
        await decode(0);
        await decode(1);
        vi.useFakeTimers();
        const point = (index: number, type: string) => {
            const event = new MouseEvent(type, { bubbles: true, clientX: index * 100 + 20, clientY: 25 });
            Object.defineProperty(event, 'pointerType', { value: 'mouse' });
            card(index).dispatchEvent(event);
        };
        try {
            await act(async () => {
                point(0, 'pointermove');
                await vi.advanceTimersByTimeAsync(40);
                point(0, 'pointerout');
                point(1, 'pointermove');
                await vi.advanceTimersByTimeAsync(40);
                point(1, 'pointerout');
                await vi.advanceTimersByTimeAsync(120);
            });
            expect(container.querySelector('.active')).toBeNull();
            await act(async () => {
                point(0, 'pointermove');
                await vi.advanceTimersByTimeAsync(120);
            });
            expect(card(0).classList.contains('active')).toBe(true);
            await act(async () => {
                point(0, 'pointerout');
                point(1, 'pointermove');
            });
            expect(container.querySelector('.active')).toBeNull();
            await act(async () => vi.advanceTimersByTimeAsync(120));
            expect(card(1).classList.contains('active')).toBe(true);
        } finally {
            vi.useRealTimers();
        }
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

const prepared: string[] = [];
function remember(item: BaseItemDto) {
    prepared.push(item.Id || '');
}

describe('endless row', () => {
    it('repeats the titles around the original ones and keeps choosing cards past the end', async () => {
        const long = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(Id => ({ Id, Name: Id, Type: 'Movie' as const }));
        prepared.length = 0;
        Element.prototype.scrollTo = function () { /* jsdom has no layout. */ };
        vi.stubGlobal('matchMedia', () => ({ matches: false }));
        await act(async () => root.render(<MemoryRouter><MediaRow title='Longue' items={long} image={image} logo={noLogo} onPrepare={remember} /></MemoryRouter>));
        const next = container.querySelector<HTMLButtonElement>('[aria-label="Suivant : Longue"]')!;
        for (let press = 0; press < 10; press++) await act(async () => next.click());
        expect(container.querySelectorAll('.client-media-card')).toHaveLength(21);
        // Ten presses from nothing: a…g, then a, b, c again.
        expect(prepared.slice(-3)).toEqual(['a', 'b', 'c']);
        // Only the original copy can restore keyboard focus after visiting a page.
        expect(container.querySelectorAll('[data-client-focus="a"]')).toHaveLength(1);
    });
});

describe('catalogue and upcoming rows', () => {
    it('uses the shared artwork fallback for a tracked title with no poster', async () => {
        const shared: BaseItemDto[] = [{ Id: 'seerr-movie-1', Name: 'Suivi', Type: 'Movie' }];
        await act(async () => root.render(<MemoryRouter><MediaRow title='Récemment suivis' kind='shared-catalog'
            items={shared} image={noImage} logo={noLogo} onPrepare={prepare} /></MemoryRouter>));
        expect(card(0).querySelector('.client-card-poster[data-shared-art]')).not.toBeNull();
        expect(card(0).querySelector('.client-availability')?.getAttribute('aria-label')).toBe('À télécharger');
    });

    it('shows the release date and links to the series without marking an unaired episode available', async () => {
        const upcoming: BaseItemDto[] = [{ Id: 'episode', Name: 'Retour', Type: 'Episode', SeriesId: 'series', SeriesName: 'Série',
            PremiereDate: '2099-11-19T00:00:00Z', ParentIndexNumber: 2, IndexNumber: 3 }];
        await act(async () => root.render(<MemoryRouter><MediaRow title='Épisodes à venir' kind='upcoming-episodes'
            items={upcoming} image={image} logo={noLogo} onPrepare={prepare} /></MemoryRouter>));
        expect(card(0).querySelector('time')?.getAttribute('datetime')).toBe('2099-11-19');
        expect(card(0).querySelector('.client-upcoming-episode-caption')?.textContent).toContain('S2:E3');
        expect(card(0).querySelector('a.client-card')?.getAttribute('href')).toContain('?id=series');
        expect(card(0).querySelector('.client-availability')).toBeNull();
    });
});
