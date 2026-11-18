import type { SharedCatalogEntry } from '../sharedCatalog';

export type SharedEntry = SharedCatalogEntry;

const account = (id: string | null | undefined) => (id || '').replace(/-/g, '').toLowerCase();

/** Titles lately followed by the other accounts of the server, newest first (the catalogue keeps that order). */
export function othersRecent(entries: SharedEntry[], userId: string | null | undefined) {
    const me = account(userId);
    const known = entries.filter(entry => entry.addedBy);
    // Older catalogue entries do not say who added them: they are then simply the latest ones.
    if (!known.length) return { entries: entries.slice(0, 8), byOthers: false };
    return { entries: known.filter(entry => account(entry.addedBy) !== me).slice(0, 8), byOthers: true };
}
