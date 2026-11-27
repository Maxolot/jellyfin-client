import type { UserPolicy } from '@jellyfin/sdk/lib/generated-client';

export function canManageCollections(policy: Pick<UserPolicy, 'IsAdministrator' | 'EnableCollectionManagement'> | null | undefined) {
    return policy?.IsAdministrator === true || policy?.EnableCollectionManagement === true;
}
