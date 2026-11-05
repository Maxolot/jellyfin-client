import { describe, expect, it } from 'vitest';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { withoutPreviewGrants } from './persistence';

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
