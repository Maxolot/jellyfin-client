import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./artwork', () => ({ preloadArtwork: () => Promise.resolve() }));
vi.mock('./Artwork', () => ({ default: ({ source }: { source: string }) => <img src={source} alt='' /> }));

import TonightPage from './TonightPage';

const films = (names: string[]) => names.map(Id => ({ Id, Name: Id, Type: 'Movie' as const, RunTimeTicks: 6e10 })) as BaseItemDto[];
const image = (item: BaseItemDto) => `https://media.example.test/${item.Id}.jpg`;
let root: Root;
let container: HTMLDivElement;
const dealt = () => [...container.querySelectorAll('.client-draw-card img')].map(img => img.getAttribute('src'));
const render = async (items: BaseItemDto[]) => act(async () => root.render(<MemoryRouter><TonightPage items={items} image={image} onPrepare={() => undefined} onRelease={() => undefined} /></MemoryRouter>));

beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
});

describe('Ce soir', () => {
    it('keeps the cards dealt from the cached sample when a different random sample arrives', async () => {
        await render(films(['a', 'b', 'c', 'd', 'e', 'f']));
        const first = dealt();
        expect(first).toHaveLength(3);
        await render(films(['m', 'n', 'o', 'p', 'q', 'r']));
        expect(dealt()).toEqual(first);
    });
});
