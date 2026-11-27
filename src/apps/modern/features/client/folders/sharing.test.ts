import { describe, expect, it } from 'vitest';

import { folderSharing, personalFoldersFirst, type Folder } from './model';

const owned: Folder = { id: 'one', name: 'Chez moi', ownerId: 'ab-cd', access: 'owner' };
const incoming: Folder = { id: 'two', name: 'Chez lui', ownerId: 'ee-ff', access: 'viewer' };
const targets = [{ userId: 'eeff', name: 'Morgan' }, { userId: '1122', name: 'Lou' }];

describe('folder sharing badges', () => {
    it('shows personal folders first without reordering either group', () => {
        expect(personalFoldersFirst([incoming, owned, { ...owned, id: 'three' }]).map(folder => folder.id)).toEqual(['one', 'three', 'two']);
    });

    it('identifies the incoming owner despite different GUID formatting and retains read-only access', () => {
        expect(folderSharing(incoming, null, targets)).toMatchObject({
            label: 'Partagé par Morgan', accessible: 'Partagé par Morgan · Lecture seule', people: [{ id: 'eeff', name: 'Morgan' }]
        });
        expect(folderSharing(owned, [], targets)).toBeUndefined();
    });

    it('caps the avatar stack at three while preserving the share count', () => {
        const shares = ['ee-ff', '11-22', '33-44', '55-66', '77-88'].map(userId => ({ userId, canEdit: true }));
        const badge = folderSharing(owned, shares, targets)!;
        expect(badge.people).toHaveLength(3);
        expect(badge.extra).toBe(2);
        expect(badge.accessible).toBe('Partagé avec 5 comptes · Morgan · Lou');
    });
});
