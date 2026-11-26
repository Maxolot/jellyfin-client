import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { type ReactNode } from 'react';

import { DEFAULT_FOLDER, useFolderPicker } from './FolderPicker';
import { folderPath, orderedFolderItems, personalFoldersFirst, type Folder } from './model';
import { useFolderDetail, useFolderTitles } from './queries';

type Row = (title: string, items: BaseItemDto[], link: string) => ReactNode;
type Kind = 'Movie' | 'Series';

/** My folders, default first, then my own, then those shared with me. */
export function folderRowOrder(folders: Folder[]) {
    const ordered = personalFoldersFirst(folders);
    const fallback = ordered.findIndex(folder => folder.access === 'owner' && folder.name.localeCompare(DEFAULT_FOLDER, 'fr', { sensitivity: 'base' }) === 0);
    return fallback > 0 ? [ordered[fallback], ...ordered.filter((_, index) => index !== fallback)] : ordered;
}

// eslint-disable-next-line sonarjs/function-return-type -- The row helper returns a row, or nothing for an empty folder.
function FolderRow({ folder, row, kind }: Readonly<{ folder: Folder; row: Row; kind?: Kind }>) {
    const detail = useFolderDetail(folder.id);
    const titles = useFolderTitles(detail.data?.items);
    const items = detail.data && titles.isSuccess ? orderedFolderItems(detail.data.items, titles.data).map(entry => entry.item)
        .filter(item => !kind || item.Type === kind) : [];
    return row(folder.name, items, folderPath(folder.id));
}

/** Each folder becomes a row titled with its name, leading to its page; empty folders stay hidden. */
export default function FolderRows({ row, kind, limit = 6 }: Readonly<{ row: Row; kind?: Kind; limit?: number }>) {
    const folders = useFolderPicker()?.folders;
    if (!folders?.length) return null;
    return <>{folderRowOrder(folders).slice(0, limit).map(folder => <FolderRow key={folder.id} folder={folder} row={row} kind={kind} />)}</>;
}
