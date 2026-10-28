import type { Api } from '@jellyfin/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SeerrProvider, useSeerr } from './SeerrContext';

const fixture = vi.hoisted(() => ({ userId: 'first', enabled: true, send: vi.fn() }));
vi.mock('hooks/useApi', () => ({ useApi: () => ({ api: { basePath: 'https://media.example.test', accessToken: fixture.userId, axiosInstance: { request: fixture.send } } as unknown as Api, user: { Id: fixture.userId } }) }));
vi.mock('hooks/useWebConfig', () => ({ useWebConfig: () => ({ clientSeerr: fixture.enabled }) }));
let root: Root;
let container: HTMLDivElement;
let cache: QueryClient;
function Probe() {
    const seerr = useSeerr();
    return <output>{JSON.stringify({ scope: seerr.root[2], enabled: seerr.enabled, connected: seerr.connected, account: seerr.me.data?.id, permissions: seerr.permissions })}</output>;
}
function render() {
    root.render(<QueryClientProvider client={cache}><SeerrProvider><Probe /></SeerrProvider></QueryClientProvider>);
}
async function settle() {
    for (let count = 0; count < 5; count++) await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
}
beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    fixture.userId = 'first';
    fixture.enabled = true;
    fixture.send.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
    await act(async () => root.unmount());
    cache.clear();
    container.remove();
    localStorage.clear();
});
function state() {
    return JSON.parse(container.querySelector('output')!.textContent!);
}
describe('per-user optional proxy connection', () => {
    it('sends no proxy calls when disabled by server configuration', async () => {
        fixture.enabled = false;
        await act(async () => render());
        await settle();
        expect(fixture.send).not.toHaveBeenCalled();
        expect(state().connected).toBe(false);
    });
    it('restores the per-account opt-out before sending requests', async () => {
        localStorage.setItem('client-seerr-https://media.example.test-first', 'false');
        await act(async () => render());
        await settle();
        expect(state().enabled).toBe(false);
        expect(fixture.send).not.toHaveBeenCalled();
    });
    it('links a missing session once through passwordless proxy Quick Connect', async () => {
        let linked = false;
        fixture.send.mockImplementation(({ url, data }) => {
            if (url.endsWith('/Status')) return Promise.resolve({ status: 200, data: { enabled: true, authenticated: linked } });
            if (url.endsWith('/Login')) {
                expect(data).toEqual({ authType: 'quickconnect' });
                linked = true;
                return Promise.resolve({ status: 200, data: { success: true } });
            }
            return Promise.resolve({ status: 200, data: { id: 11, permissions: 32 } });
        });
        await act(async () => render());
        await settle();
        expect(state()).toMatchObject({ connected: true, account: 11, permissions: 32 });
        expect(fixture.send.mock.calls.filter(([config]) => config.url.endsWith('/Login'))).toHaveLength(1);
    });
    it('does not repeatedly try a proxy without passwordless login support', async () => {
        fixture.send.mockImplementation(({ url }) => {
            if (url.endsWith('/Status')) return Promise.resolve({ status: 200, data: { enabled: true, authenticated: false } });
            return Promise.reject(Object.assign(new Error('Unsupported fixture login'), { isAxiosError: true, response: { status: 400 } }));
        });
        await act(async () => render());
        await settle();
        await act(async () => render());
        await settle();
        expect(state()).toMatchObject({ scope: 'first', enabled: true, connected: false });
        expect(fixture.send.mock.calls.filter(([config]) => config.url.endsWith('/Login'))).toHaveLength(1);
    });
    it('does not apply a late first-account identity or permissions to the second account', async () => {
        let finishFirst: ((value: unknown) => void) | undefined;
        fixture.send.mockImplementation(({ url, headers }) => {
            if (url.endsWith('/Status')) return Promise.resolve({ status: 200, data: { enabled: true, authenticated: true } });
            if (headers.Authorization.includes('first')) {
                return new Promise(resolve => {
                    finishFirst = resolve;
                });
            }
            return Promise.resolve({ status: 200, data: { id: 22, permissions: 0 } });
        });
        await act(async () => render());
        await settle();
        expect(finishFirst).toBeDefined();
        fixture.userId = 'second';
        await act(async () => render());
        await settle();
        expect(state()).toMatchObject({ scope: 'second', account: 22, connected: true, permissions: 0 });
        await act(async () => finishFirst!({ status: 200, data: { id: 11, permissions: 2 } }));
        await settle();
        expect(state()).toMatchObject({ scope: 'second', account: 22, permissions: 0 });
    });
});
