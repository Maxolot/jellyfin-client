import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DetailExtras from './DetailExtras';

const state = vi.hoisted(() => ({
    api: { basePath: 'https://media.example.test' }, user: { Id: 'viewer' },
    connected: true, getItems: vi.fn(), call: vi.fn()
}));
vi.mock('hooks/useApi', () => ({ useApi: () => state }));
vi.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({ getLibraryApi: () => state }));
vi.mock('./seerr/SeerrContext', () => ({ useSeerr: () => ({ root: ['Seerr', state.user.Id], connected: state.connected, call: state.call }) }));
const movie: BaseItemDto = { Id: 'local-one', Type: 'Movie', Name: 'First', ProviderIds: { Tmdb: '101', TmdbCollection: '42' }, ProductionYear: 2001 };
const sequel: BaseItemDto = { Id: 'local-two', Type: 'Movie', Name: 'Second', ProviderIds: { Tmdb: '102', TmdbCollection: '42' }, ProductionYear: 2004 };
const similar: BaseItemDto[] = [sequel, { Id: 'external-copy', Type: 'Movie', ProviderIds: { Tmdb: '103' }, Name: 'Third' }, { Id: 'unrelated', Name: 'Other' }];
let cache: QueryClient;
let root: Root;
let container: HTMLDivElement;
const image = () => '';
async function render(item = movie) {
    await act(async () => {
        root.render(<QueryClientProvider client={cache}><MemoryRouter><DetailExtras item={item} similar={similar} image={image} /></MemoryRouter></QueryClientProvider>);
        await new Promise(resolve => setTimeout(resolve, 20));
    });
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
    });
}
beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    state.connected = true;
    state.getItems.mockReset().mockResolvedValue({ data: { Items: [sequel] } });
    state.call.mockReset().mockResolvedValue({ name: 'Example - Saga', parts: [
        { id: 103, title: 'Third', releaseDate: '2007-01-01', mediaInfo: { status: 2 } },
        { id: 101, title: 'First', releaseDate: '2001-01-01' },
        { id: 102, title: 'Second', releaseDate: '2004-01-01' }
    ] });
    cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    cache.clear();
    container.remove();
});
describe('film saga details', () => {
    it('orders remote parts, matches local availability and marks the current film', async () => {
        await render();
        expect([...container.querySelectorAll('.client-saga-card strong')].map(element => element.textContent)).toEqual(['First', 'Second', 'Third']);
        expect(container.querySelector('.client-saga-count')?.textContent).toBe('3 films · 2 disponibles');
        expect(container.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/client?id=local-one');
        expect(container.querySelector('.client-saga h2')?.textContent).toBe('Example');
        expect(container.querySelector('[href="/client?id=seerr-movie-103"]')?.textContent).toContain('En attente');
    });
    it('marks an external current film without counting it as a local copy', async () => {
        await render({ Id: 'seerr-movie-103', Type: 'Movie', Name: 'Third', ProviderIds: { Tmdb: '103', TmdbCollection: '42' } });
        expect(container.querySelector('.client-saga-count')?.textContent).toBe('3 films · 1 disponible');
        expect(container.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/client?id=seerr-movie-103');
    });
    it('waits for library identities before showing the remote availability count', async () => {
        let resolve!: (value: unknown) => void;
        state.getItems.mockReturnValue(new Promise(done => { resolve = done; }));
        await render();
        expect(container.querySelector('.client-saga')).toBeNull();
        await act(async () => resolve({ data: { Items: [sequel] } }));
        await render();
        expect(container.querySelector('.client-saga-count')?.textContent).toBe('3 films · 2 disponibles');
    });
    it('excludes saga titles from similar items by both local and provider identity', async () => {
        await render();
        expect([...container.querySelectorAll('.client-related-grid a')].map(element => element.getAttribute('aria-label'))).toEqual(['Other']);
    });
    it('uses only local films when Seerr is off, even with a cached collection', async () => {
        state.connected = false;
        cache.setQueryData(['Seerr', state.user.Id, 'Collection', '42'], { name: 'Cached', parts: [{ id: 103 }, { id: 104 }] });
        await render();
        expect(state.call).not.toHaveBeenCalled();
        expect(container.querySelector('.client-saga-count')?.textContent).toBe('2 films · 2 disponibles');
        expect(container.querySelector('.client-saga h2')?.textContent).toBe('Films de la même saga');
    });
    it('falls back to local films after a proxy error', async () => {
        state.call.mockRejectedValue(new Error('Unavailable'));
        await render();
        expect(container.querySelectorAll('.client-saga-card')).toHaveLength(2);
        expect(container.querySelectorAll('.client-related-grid a')).toHaveLength(2);
    });
    it('omits a singleton collection', async () => {
        state.connected = false;
        state.getItems.mockResolvedValue({ data: { Items: [] } });
        await render();
        expect(container.querySelector('.client-saga')).toBeNull();
    });
    it('makes no saga requests for series or unknown collections', async () => {
        await render({ ...movie, Type: 'Series' });
        await render({ ...movie, ProviderIds: {} });
        expect(state.call).not.toHaveBeenCalled();
        expect(state.getItems).not.toHaveBeenCalled();
        expect(container.querySelector('.client-saga')).toBeNull();
    });
});
