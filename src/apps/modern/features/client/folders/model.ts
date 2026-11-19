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

export type FolderImage = (item: BaseItemDto, backdrop?: boolean, hero?: boolean) => string;
export const foldersPath = '/client?view=mine';
export const folderPath = (id: string) => `/client/folders/${encodeURIComponent(id)}`;

export function folderTitleCount(count: number) {
    return `${count} ${count === 1 ? 'titre' : 'titres'}`;
}

export type FolderFilters = { type: string; viewed: string; sort: string };

export function filterFolderItems(entries: ReturnType<typeof orderedFolderItems>, { type, viewed, sort }: FolderFilters) {
    const matches = entries.filter(entry => (!type || entry.type === type)
        && (!viewed || (entry.item.UserData?.Played === true) === (viewed === 'seen')));
    if (sort === 'name') return matches.sort((a, b) => (a.item.SortName || a.item.Name || '').localeCompare(b.item.SortName || b.item.Name || '', 'fr', { numeric: true }));
    if (sort === 'year') return matches.sort((a, b) => (b.item.ProductionYear || 0) - (a.item.ProductionYear || 0));
    return matches;
}

export function moveFolderItem(entries: FolderItem[], itemId: string, direction: -1 | 1) {
    const index = entries.findIndex(entry => entry.itemId === itemId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= entries.length) return undefined;
    const order = entries.map(entry => entry.itemId);
    [order[index], order[target]] = [order[target], order[index]];
    return order;
}

export function hasFolderPoster(item: BaseItemDto) {
    return !!(item.ImageTags?.Primary || item.ImageTags?.Thumb || item.BackdropImageTags?.length);
}

export function folderDuration(ticks: number) {
    const minutes = Math.round(ticks / 600000000);
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return minutes % 60 ? `${hours} h ${String(minutes % 60).padStart(2, '0')}` : `${hours} h`;
}
