import { expect, it } from 'vitest';

import { orderedFolderItems } from '../folders/model';
import { mergeCollectionMembers } from './members';

it('merges public collection content without displaying an extra copy of a followed title that is already linked', () => {
    const native = { Id: 'a', Type: 'Movie' as const, ProviderIds: { Tmdb: '42' } };
    const distinct = { Id: 'seerr-tv-42', Type: 'Series' as const };
    const shadow = { Id: 'seerr-movie-42', Type: 'Movie' as const };
    const localShadow = { Id: 'b', Type: 'Movie' as const };
    const references = [
        { itemId: localShadow.Id, type: 'movie' as const, tmdbId: 42, followed: true },
        { itemId: null, type: 'tv' as const, tmdbId: 42, followed: true }
    ];
    const merged = mergeCollectionMembers([native], orderedFolderItems(references, [localShadow, distinct, shadow]));
    expect(merged.entries.map(entry => entry.item.Id)).toEqual([native.Id, distinct.Id]);
    expect(merged.additions).toHaveLength(1);
});
