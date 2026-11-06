import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MovieSources from './MovieSources';

const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('hooks/useApi', () => ({ useApi: () => ({ api: { basePath: 'https://test.invalid', accessToken: 'fake', axiosInstance: { request: state.request } }, user: { Id: 'u' } }) }));
let root: Root;
let container: HTMLDivElement;
let cache: QueryClient;
async function flush() {
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
    });
}
async function render(id: string | undefined = 'tt1234567') {
    await act(async () => root.render(<QueryClientProvider client={cache}><MovieSources imdbId={id} /></QueryClientProvider>));
    await flush();
}
beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    state.request.mockReset();
    cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    cache.clear();
});
describe('film source availability', () => {
    it('hides the integration when the plugin is absent', async () => {
        state.request.mockRejectedValue(new Error('missing'));
        await render();
        expect(container.querySelector('[role="status"]')).toBeNull();
    });
    it('automatically checks the film and shows an accessible indicator', async () => {
        state.request.mockResolvedValueOnce({ data: { Enabled: true } }).mockResolvedValueOnce({ data: { Found: true } });
        await render();
        await flush();
        expect(state.request).toHaveBeenCalledTimes(2);
        expect(state.request.mock.calls[1][0].url).toContain('/MovieSources/Movies/tt1234567');
        expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toContain('Sources trouvées');
        expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
    });
    it('reports an empty response cautiously', async () => {
        state.request.mockResolvedValueOnce({ data: { Enabled: true } }).mockResolvedValueOnce({ data: { Found: false } });
        await render();
        await flush();
        expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toContain('indexeurs peuvent être indisponibles');
    });
    it('reports errors without claiming the film is unavailable', async () => {
        state.request.mockResolvedValueOnce({ data: { Enabled: true } }).mockRejectedValueOnce(new Error('timeout'));
        await render();
        await flush();
        expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toContain('Vérification des sources indisponible');
    });
    it('does not search without a valid movie identifier', async () => {
        state.request.mockResolvedValueOnce({ data: { Enabled: true } });
        await render('');
        expect(state.request).toHaveBeenCalledTimes(1);
        expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toContain('indisponible');
    });
});
