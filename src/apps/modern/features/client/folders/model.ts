import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

import { isExternal } from '../seerr/model';

export type FolderAccess = 'owner' | 'editor' | 'viewer';
export type Folder = { id: string; name: string; ownerId: string; access: FolderAccess };
export type FolderItem = { itemId: string; type: 'movie' | 'tv'; tmdbId: number | null };
export type FolderShare = { userId: string; canEdit: boolean };
export type FolderTarget = { userId: string; name: string };
export type FolderDetail = { folder: Folder; items: FolderItem[]; shares: FolderShare[] | null };

export function folderItemId(id: string) {
    return id.replace(/-/g, '').toLowerCase();
}

export function canFile(item: BaseItemDto) {
    return !!item.Id && !isExternal(item) && (item.Type === 'Movie' || item.Type === 'Series');
}

export function canEditFolder(folder: Folder) {
    return folder.access === 'owner' || folder.access === 'editor';
}

export function orderedFolderItems(entries: FolderItem[], items: BaseItemDto[]) {
    const byId = new Map(items.map(item => [folderItemId(item.Id || ''), item]));
    return entries.flatMap(entry => {
        const item = byId.get(folderItemId(entry.itemId));
        return item ? [{ ...entry, item }] : [];
    });
}
