import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

import { externalIdentity, imageUrl, isExternal, type CatalogueItem } from '../seerr/model';
import type { SharedCatalogEntry } from '../sharedCatalog';

export type FolderAccess = 'owner' | 'editor' | 'viewer';
export type Folder = { id: string; name: string; ownerId: string; access: FolderAccess };
export type FolderItem = { itemId: string | null; followed?: boolean; type: 'movie' | 'tv'; tmdbId: number | null };
export type FolderShare = { userId: string; canEdit: boolean };
export type FolderTarget = { userId: string; name: string };
export type FolderDetail = { folder: Folder; items: FolderItem[]; shares: FolderShare[] | null };

export function folderItemId(id: string) {
    return id.replace(/-/g, '').toLowerCase();
}

export function canFile(item: BaseItemDto) {
    return !!item.Id && !isExternal(item) && (item.Type === 'Movie' || item.Type === 'Series');
}

export function followedMember(item: BaseItemDto, catalog: SharedCatalogEntry[] | null | undefined) {
    if (!isExternal(item)) return undefined;
    const identity = externalIdentity(item);
    return catalog?.some(entry => entry.type === identity?.type && entry.id === identity.id) ? identity : undefined;
}

export function followedPath(type: FolderItem['type'], tmdbId: number) {
    return `/Followed/${type}/${tmdbId}`;
}

export function folderMemberKey(entry: FolderItem) {
    if (entry.followed && entry.tmdbId) return `seerr-${entry.type}-${entry.tmdbId}`;
    return folderItemId(entry.itemId || '');
}

export function folderMemberPath(entry: FolderItem) {
    if (entry.followed && entry.tmdbId) return followedPath(entry.type, entry.tmdbId);
    return `/Items/${entry.itemId}`;
}

export function canEditFolder(folder: Folder) {
    return folder.access === 'owner' || folder.access === 'editor';
}

export function orderedFolderItems(entries: FolderItem[], items: BaseItemDto[]) {
    const byId = new Map(items.map(item => [isExternal(item) ? item.Id : folderItemId(item.Id || ''), item]));
    return entries.flatMap(entry => {
        const key = folderMemberKey(entry);
        const item = byId.get(folderItemId(entry.itemId || '')) || byId.get(key);
        return item ? [{ ...entry, item, key }] : [];
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

export function moveFolderItem(entries: FolderItem[], key: string, direction: -1 | 1) {
    const order = entries.map(folderMemberKey);
    const index = order.indexOf(key.startsWith('seerr-') ? key : folderItemId(key));
    const target = index + direction;
    if (index < 0 || target < 0 || target >= entries.length) return undefined;
    [order[index], order[target]] = [order[target], order[index]];
    return order;
}

export function hasFolderPoster(item: BaseItemDto) {
    return !!(item.ImageTags?.Primary || item.ImageTags?.Thumb || item.BackdropImageTags?.length || (item as CatalogueItem).Seerr?.posterPath);
}

export function shelfPoster(item: BaseItemDto, image: FolderImage, backdrop = false) {
    const external = (item as CatalogueItem).Seerr;
    if (isExternal(item)) return imageUrl(backdrop ? external?.backdropPath || external?.posterPath : external?.posterPath, backdrop);
    return image(item, backdrop, backdrop);
}

export function folderDuration(ticks: number) {
    const minutes = Math.round(ticks / 600000000);
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return minutes % 60 ? `${hours} h ${String(minutes % 60).padStart(2, '0')}` : `${hours} h`;
}

export function personalFoldersFirst(folders: Folder[]) {
    return [...folders.filter(folder => folder.access === 'owner'), ...folders.filter(folder => folder.access !== 'owner')];
}

export function folderSharing(folder: Folder, shares?: FolderShare[] | null, targets: FolderTarget[] = []) {
    function account(id: string) {
        const canonical = folderItemId(id);
        const name = targets.find(target => folderItemId(target.userId) === canonical)?.name;
        return { id: canonical, name };
    }
    if (folder.access !== 'owner') {
        const owner = account(folder.ownerId);
        const label = owner.name ? `Partagé par ${owner.name}` : 'Partagé avec moi';
        return { label, accessible: folder.access === 'viewer' ? `${label} · Lecture seule` : label, people: [owner], extra: 0 };
    }
    if (!shares?.length) return undefined;
    const people = shares.slice(0, 3).map(share => account(share.userId));
    const names = people.flatMap(person => person.name || []);
    return { label: 'Partagé', accessible: [`Partagé avec ${shares.length} ${shares.length === 1 ? 'compte' : 'comptes'}`, ...names].join(' · '),
        people, extra: shares.length - people.length };
}
