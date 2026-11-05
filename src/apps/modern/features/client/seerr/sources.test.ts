import { describe, expect, it, vi } from 'vitest';

import { statusOf } from './sources';

vi.mock('hooks/useApi', () => ({ useApi: () => ({}) }));

describe('statusOf', () => {
    it('maps query state to a source status', () => {
        expect(statusOf({ isPending: true, isError: false }, undefined)).toBe('pending');
        expect(statusOf({ isPending: false, isError: false }, true)).toBe('found');
        expect(statusOf({ isPending: false, isError: false }, false)).toBe('empty');
        expect(statusOf({ isPending: false, isError: true }, undefined)).toBe('unknown');
    });
});
