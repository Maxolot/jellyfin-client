import type { PersistedClient } from '@tanstack/react-query-persist-client';

/** Short-lived preview grants belong to memory, never the durable account query cache. */
export function withoutPreviewGrants(client: PersistedClient): PersistedClient {
    return {
        ...client,
        clientState: {
            ...client.clientState,
            queries: client.clientState.queries.filter(query => query.queryKey[0] !== 'ClientPreviews')
        }
    };
}
