import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { query, play } = vi.hoisted(() => ({ query: vi.fn(), play: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({}) }));
vi.mock('hooks/useApi', () => ({ useApi: () => ({ api: { basePath: 'fixture' }, user: { Id: 'viewer' } }) }));
vi.mock('./Artwork', () => ({ default: ({ source }: { source: string }) => <img src={source} alt='' /> }));
vi.mock('./PreviewClip', () => ({ default: () => null }));
vi.mock('./trailers/TrailerAction', () => ({ default: () => null }));
vi.mock('./seerr/SeerrViews', () => ({ RequestPanel: () => null }));
vi.mock('./seerr/SeerrContext', () => ({ useSeerr: () => ({ connected: false, root: [] }) }));
vi.mock('./sharedCatalog', () => ({ useSharedCatalog: () => ({}) }));
vi.mock('./spotlight/descriptionSearch', () => ({ useDescriptionSearch: () => ({ results: [] }) }));
vi.mock('./tonight/queries', () => ({
    useTonightOptions: () => ({ data: null, isFetched: true }),
    useTonightLibrary: query,
    useTonightTogether: () => ({}),
    useTonightAction: () => ({})
}));

import TonightPage from './TonightPage';

const films = ['a', 'b', 'c', 'd', 'e', 'f'].map(Id => ({ Id, Name: Id, Type: 'Movie' as const, RunTimeTicks: 6e10 }));
const image = (item: BaseItemDto) => `https://media.example.test/${item.Id}.jpg`;
const ignore = () => undefined;
let root: Root;
let container: HTMLDivElement;
const dealt = () => [...container.querySelectorAll('.client-draw-card h2')].map(title => title.textContent);
const render = async () => act(async () => root.render(<MemoryRouter><TonightPage play={play} image={image} onPrepare={ignore} onRelease={ignore} /></MemoryRouter>));
const button = (label: string) => [...container.querySelectorAll('button')].find(entry => entry.textContent?.trim() === label);

beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.clear();
    play.mockClear();
    query.mockReturnValue({ data: { items: films, started: [] } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
});

describe('Ce soir', () => {
    it('keeps titles inside cards and starts the selected film', async () => {
        await render();
        const titles = dealt();
        expect(titles).toHaveLength(3);
        const links = [...container.querySelectorAll('.client-draw-card a')];
        expect(links.map(link => link.getAttribute('aria-label'))).toEqual(titles.map(title => `Voir ${title}`));
        await act(async () => button('Lecture')?.click());
        expect(play).toHaveBeenCalledWith(expect.objectContaining({ Id: titles[0] }));
    });

    it('exchanges the entire draw when enough alternatives exist', async () => {
        await render();
        const before = dealt();
        await act(async () => button('Autres idées')?.click());
        expect(dealt()).toHaveLength(3);
        expect(dealt().every(title => !before.includes(title))).toBe(true);
    });
});
