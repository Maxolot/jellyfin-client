import type { PersistedClient } from '@tanstack/react-query-persist-client';

/** Short-lived preview grants belong to memory, never the durable account query cache. */
export function withoutPreviewGrants(client: PersistedClient): PersistedClient {
    return {
        ...client,
        clientState: {
            ...client.clientState,
            // The whole library's identities and long scrolled lists are large, quick to fetch again, and would slow every save.
            queries: client.clientState.queries.filter(query => query.queryKey[0] !== 'ClientPreviews' && !query.queryKey.includes('LocalIdentities') && query.queryKey[query.queryKey.length - 1] !== 'More')
        }
    };
}

type Schedule = { later: (run: () => void, ms: number) => number; cancel: (handle: number) => void; idle: (run: () => void) => void };

const browserSchedule: Schedule = {
    later: (run, ms) => window.setTimeout(run, ms),
    cancel: handle => window.clearTimeout(handle),
    // Safari has no idle callback: a short delay keeps the write away from the interaction.
    idle: run => {
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 2000 });
        else window.setTimeout(run, 50);
    }
};

/**
 * Query events arrive by the dozen during a navigation and each write clones the whole cache on the main thread.
 * Only the latest state is kept, and it is written once things have calmed down.
 */
export function createDeferredSaver<T>(save: (value: T) => Promise<unknown>, delay = 4000, schedule = browserSchedule) {
    let latest: { value: T } | undefined;
    let handle: number | undefined;
    const write = () => {
        handle = undefined;
        const current = latest;
        latest = undefined;
        return current ? save(current.value) : Promise.resolve();
    };
    return {
        request(value: T) {
            latest = { value };
            if (handle !== undefined) schedule.cancel(handle);
            handle = schedule.later(() => schedule.idle(() => {
                void write();
            }), delay);
        },
        /** Leaving the page is the one moment a write cannot wait, and nobody is interacting. */
        flush() {
            if (handle !== undefined) schedule.cancel(handle);
            return write();
        },
        cancel() {
            if (handle !== undefined) schedule.cancel(handle);
            handle = undefined;
            latest = undefined;
        }
    };
}
