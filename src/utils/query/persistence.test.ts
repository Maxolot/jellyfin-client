import { describe, expect, it, vi } from 'vitest';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { createDeferredSaver, withoutPreviewGrants } from './persistence';

describe('preview grant persistence boundary', () => {
    it('removes preview tickets from both writes and restored snapshots while retaining other queries', () => {
        const saved = { timestamp: 1, buster: 'build', clientState: { mutations: [], queries: [
            { queryKey: ['ClientPreviews', 'server', 'account', 'Manifest', 'film'], queryHash: 'preview', state: { data: { full: '/preview.mp4?ticket=temporary' } } },
            { queryKey: ['Client', 'server', 'account', 'Detail', 'film'], queryHash: 'detail', state: { data: { Name: 'Film' } } }
        ] } } as unknown as PersistedClient;
        const result = withoutPreviewGrants(saved);
        expect(result.clientState.queries.map(query => query.queryHash)).toEqual(['detail']);
        expect(saved.clientState.queries).toHaveLength(2);
        expect(withoutPreviewGrants(result)).toEqual(result);
    });
});

describe('deferred cache writes', () => {
    const immediate = { later: (run: () => void, ms: number) => window.setTimeout(run, ms), cancel: (handle: number) => window.clearTimeout(handle), idle: (run: () => void) => run() };

    it('leaves the identities of the whole library out of the saved cache', () => {
        const saved = { timestamp: 1, buster: 'b', clientState: { mutations: [], queries: [
            { queryKey: ['ClientSeerr', 's', 'u', 'LocalIdentities'], queryHash: 'identities' }, { queryKey: ['Client', 's', 'u', 'Browse', 'films'], queryHash: 'films' }
        ] } } as unknown as PersistedClient;
        expect(withoutPreviewGrants(saved).clientState.queries.map(query => query.queryHash)).toEqual(['films']);
    });

    it('writes once, with the latest state, after a burst of events', () => {
        vi.useFakeTimers();
        const save = vi.fn(() => Promise.resolve());
        const saver = createDeferredSaver<number>(save, 4000, immediate);
        for (let state = 0; state < 50; state++) saver.request(state);
        expect(save).not.toHaveBeenCalled();
        vi.advanceTimersByTime(4000);
        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith(49);
        vi.useRealTimers();
    });

    it('keeps waiting while events keep coming', () => {
        vi.useFakeTimers();
        const save = vi.fn(() => Promise.resolve());
        const saver = createDeferredSaver<number>(save, 4000, immediate);
        saver.request(1);
        vi.advanceTimersByTime(3000);
        saver.request(2);
        vi.advanceTimersByTime(3000);
        expect(save).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        expect(save).toHaveBeenCalledWith(2);
        vi.useRealTimers();
    });

    it('writes at once when leaving the page, and only once', async () => {
        vi.useFakeTimers();
        const save = vi.fn(() => Promise.resolve());
        const saver = createDeferredSaver<number>(save, 4000, immediate);
        saver.request(7);
        await saver.flush();
        expect(save).toHaveBeenCalledWith(7);
        vi.advanceTimersByTime(5000);
        expect(save).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it('forgets a pending state when the cache is removed', () => {
        vi.useFakeTimers();
        const save = vi.fn(() => Promise.resolve());
        const saver = createDeferredSaver<number>(save, 4000, immediate);
        saver.request(1);
        saver.cancel();
        vi.advanceTimersByTime(5000);
        expect(save).not.toHaveBeenCalled();
        vi.useRealTimers();
    });
});
