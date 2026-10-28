import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PersonalRating from './PersonalRating';

const state = vi.hoisted(() => ({ user: { Id: 'user-a' }, api: { basePath: 'https://media.example.test' }, updateItemUserData: vi.fn(), deleteUserItemRating: vi.fn() }));
vi.mock('hooks/useApi', () => ({ useApi: () => ({ api: state.api, user: state.user }) }));
vi.mock('@jellyfin/sdk/lib/utils/api/user-data-api', () => ({ getUserDataApi: () => state }));
vi.mock('./session', () => ({ clientRequest: (request: () => Promise<unknown>) => request() }));
const seed: BaseItemDto = { Id: 'film', Type: 'Movie', Name: 'Test film', CommunityRating: 9,
    UserData: { Key: 'fixture', Rating: 8, IsFavorite: true, Played: false, PlaybackPositionTicks: 123 } };
const key = (user = state.user.Id) => ['Client', state.api.basePath, user, 'Detail', 'film'];
let cache: QueryClient;
let root: Root;
let container: HTMLDivElement;
function Detail() {
    const result = useQuery({ queryKey: key(), queryFn: async () => seed, enabled: false });
    return result.data ? <PersonalRating item={result.data} /> : null;
}
async function render() {
    await act(async () => root.render(<QueryClientProvider client={cache}><Detail /></QueryClientProvider>));
}
async function flush() {
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
    });
}
async function click(selector: string) {
    await act(async () => container.querySelector<HTMLButtonElement>(selector)!.click());
    await flush();
}
beforeEach(async () => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    state.user = { Id: 'user-a' };
    state.updateItemUserData.mockReset();
    state.deleteUserItemRating.mockReset();
    cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    cache.setQueryData(key(), seed);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await render();
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    cache.clear();
});

describe('inline native personal ratings', () => {
    it('shows personal score independently from the community score', () => {
        expect(container.querySelector('.client-rating-value')!.textContent).toBe('4/5');
        expect(container.querySelector('[aria-label="Noter 4 sur 5"]')!.getAttribute('aria-pressed')).toBe('true');
    });
    it('serializes rapid clicks and updates only after the server confirms', async () => {
        let resolve!: (value: unknown) => void;
        state.updateItemUserData.mockReturnValue(new Promise(done => {
            resolve = done;
        }));
        await act(async () => {
            container.querySelector<HTMLButtonElement>('[aria-label="Noter 3 sur 5"]')!.click();
            container.querySelector<HTMLButtonElement>('[aria-label="Noter 5 sur 5"]')!.click();
        });
        expect(state.updateItemUserData).toHaveBeenCalledTimes(1);
        expect(container.querySelector('.client-rating-value')!.textContent).toBe('4/5');
        cache.setQueryData<BaseItemDto>(key(), previous => ({ ...previous!, UserData: { ...previous!.UserData!, IsFavorite: false } }));
        await act(async () => resolve({ data: { Rating: 6 } }));
        await flush();
        expect(container.querySelector('.client-rating-value')!.textContent).toBe('3/5');
        expect(cache.getQueryData<BaseItemDto>(key())).toMatchObject({ CommunityRating: 9, UserData: { Key: 'fixture', Rating: 6, IsFavorite: false, PlaybackPositionTicks: 123 } });
    });
    it('preserves the last confirmed value on failure without retrying the write', async () => {
        state.updateItemUserData.mockRejectedValue(new Error('Network failure'));
        await click('[aria-label="Noter 5 sur 5"]');
        expect(state.updateItemUserData).toHaveBeenCalledTimes(1);
        expect(container.querySelector('.client-rating-value')!.textContent).toBe('4/5');
        expect(container.querySelector('[role="alert"]')).not.toBeNull();
    });
    it('clears an absent response field without leaving the previous score cached', async () => {
        state.deleteUserItemRating.mockResolvedValue({ data: {} });
        await click('.client-rating-clear');
        expect(container.querySelector('.client-rating-value')!.textContent).toBe('Non noté');
        expect(cache.getQueryData<BaseItemDto>(key())?.UserData?.IsFavorite).toBe(true);
    });
    it('keeps late mutation responses in their original account cache', async () => {
        let resolve!: (value: unknown) => void;
        state.updateItemUserData.mockReturnValue(new Promise(done => {
            resolve = done;
        }));
        await click('[aria-label="Noter 5 sur 5"]');
        state.user = { Id: 'user-b' };
        cache.setQueryData(key(), { ...seed, UserData: { Key: 'fixture', Rating: null } });
        await render();
        await act(async () => resolve({ data: { Rating: 10 } }));
        await flush();
        expect(container.querySelector('.client-rating-value')!.textContent).toBe('Non noté');
        expect(cache.getQueryData<BaseItemDto>(key('user-a'))?.UserData?.Rating).toBe(10);
        expect(cache.getQueryData<BaseItemDto>(key('user-b'))?.UserData?.Rating).toBeNull();
    });
});
