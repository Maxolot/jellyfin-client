import { describe, expect, it } from 'vitest';

import { canManageCollections } from './access';

describe('collection management policy', () => {
    it('allows administrators and non-admin accounts with delegated rights', () => {
        expect(canManageCollections({ IsAdministrator: true, EnableCollectionManagement: false })).toBe(true);
        expect(canManageCollections({ IsAdministrator: false, EnableCollectionManagement: true })).toBe(true);
    });

    it('defaults to read-only when management rights are absent', () => {
        expect(canManageCollections({ IsAdministrator: false, EnableCollectionManagement: false })).toBe(false);
        expect(canManageCollections({})).toBe(false);
        expect(canManageCollections(null)).toBe(false);
    });
});
