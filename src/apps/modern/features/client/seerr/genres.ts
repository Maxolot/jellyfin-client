import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import type { CatalogueItem, MediaType } from './model';

export type Genre = { id: number; name: string };
export function normalizedGenre(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function aliases(genre: Genre) {
    const name = normalizedGenre(genre.name);
    const names = [name];
    if (name.includes('action') && (name.includes('adventure') || name.includes('aventure'))) names.push('action', 'adventure', 'aventure');
    if (name.includes('scifi') || name.includes('sciencefiction')) names.push('scifi', 'sciencefiction');
    if (name.includes('fantasy') || name.includes('fantastique')) names.push('fantasy', 'fantastique');
    if (name.includes('politics') || name.includes('politique')) names.push('war', 'guerre', 'politics', 'politique');
    if (name === 'kids' || name === 'enfants') names.push('kids', 'enfants', 'children');
    return names;
}
export function genreIds(genres: Genre[], name: string) {
    const wanted = normalizedGenre(name);
    return [...new Set(genres.filter(genre => aliases(genre).includes(wanted)).map(genre => genre.id))];
}
export function matchesCatalogueGenre(item: BaseItemDto, name: string, lists: Record<MediaType, Genre[]>) {
    if ((item.Genres || []).some(genre => normalizedGenre(genre) === normalizedGenre(name))) return true;
    const external = (item as CatalogueItem).Seerr;
    if (!external) return false;
    const ids = genreIds(lists[external.mediaType], name);
    return (external.genreIds || []).some(id => ids.includes(id));
}
