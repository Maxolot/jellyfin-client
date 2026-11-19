import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

import { catalogueItem, externalIdentity, providerKey, type ExternalMedia, type MediaType } from '../seerr/model';
import type { SharedCatalogEntry } from '../sharedCatalog';
import { normalizeText } from '../spotlight/searchIndex';

export type Person = {
    id: number; name: string; biography?: string; birthday?: string; deathday?: string;
    placeOfBirth?: string; knownForDepartment?: string; profilePath?: string;
};
export type PersonSearchResult = BaseItemDto & { profilePath?: string };
export type Credit = ExternalMedia & { popularity?: number; character?: string; department?: string; job?: string; adult?: boolean };
export type Credits = { cast?: Credit[]; crew?: Credit[] };
export type FilmographyRole = 'acting' | 'directing' | 'other';
export type FilmographyStatus = 'available' | 'tracked' | 'requestable';
export type FilmographyEntry = {
    item: BaseItemDto; credit?: Credit; roles: Partial<Record<FilmographyRole, string[]>>;
    status: FilmographyStatus; label?: string; followed?: boolean; type: MediaType; date: string; popularity: number;
};

export function personPath(id: string | null | undefined, name?: string | null) {
    const query = name ? `?name=${encodeURIComponent(name)}` : '';
    return `/client/person/${encodeURIComponent(id || '')}${query}`;
}

export function normalizedPersonName(name?: string | null) {
    return normalizeText(name) || (name || '').toLowerCase().trim();
}

export function personTmdbId(source?: string | null) {
    const match = /^(?:tmdb-)?(\d+)$/.exec(source || '');
    const number = Number(match?.[1] || 0);
    return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export function uniquePersonResults(local: PersonSearchResult[], remote: PersonSearchResult[]) {
    const names = new Set(local.map(item => normalizedPersonName(item.Name)));
    return [...local, ...remote.filter(item => !names.has(normalizedPersonName(item.Name)))].slice(0, 12);
}

const departments: Record<string, string> = {
    Acting: 'Interprétation', Directing: 'Réalisation', Writing: 'Scénario',
    Production: 'Production', Sound: 'Son', Camera: 'Image', Editing: 'Montage', Art: 'Direction artistique'
};

export function personDepartment(value?: string) {
    return value ? departments[value] || value : undefined;
}

function department(credit: Credit): FilmographyRole {
    if ('character' in credit) return 'acting';
    if (credit.department === 'Directing' && ['Director', 'Co-Director', 'Series Director'].includes(credit.job || '')) return 'directing';
    return 'other';
}

function appearance(credit: Credit) {
    return !!credit.genreIds?.includes(10767) || /^(?:self|himself|herself|themselves|lui meme|elle meme)(?:$|\s)/.test(normalizedPersonName(credit.character));
}

function roleName(role: FilmographyRole, credit: Credit) {
    if (role === 'acting') return credit.character || 'Interprétation';
    if (role === 'directing') return 'Réalisation';
    return personDepartment(credit.department) || credit.job || 'Équipe';
}

function creditDate(credit?: Credit, item?: BaseItemDto) {
    return credit?.releaseDate || credit?.firstAirDate || item?.PremiereDate || String(item?.ProductionYear || '');
}

export function playablePersonTitle(item: BaseItemDto) {
    return !!item.Id && item.LocationType !== 'Virtual' && !item.IsPlaceHolder && (item.Type === 'Movie' || item.Type === 'Series');
}

function trackedLabel(credit: Credit, shared: boolean) {
    const status = credit.mediaInfo?.status;
    if (status === 2) return 'Demande en attente';
    if (status === 3) return 'En préparation';
    if (status === 4) {
        const available = credit.mediaInfo?.seasons?.filter(season => season.seasonNumber > 0 && season.status === 5).map(season => season.seasonNumber);
        return available?.length ? `Partiellement disponible · Saisons ${available.join(', ')}` : 'Partiellement disponible';
    }
    if (status === 5) return 'Signalé disponible par Seerr';
    if (status === 6) return 'Indisponible à la demande';
    return shared ? 'Suivi dans le catalogue' : undefined;
}

function matches(entries: BaseItemDto[], tmdbOnly: boolean) {
    const byKey = new Map<string, BaseItemDto>();
    for (const item of entries.filter(playablePersonTitle)) {
        const key = providerKey(item) || (!tmdbOnly ? item.Id : undefined);
        if (key && !byKey.has(key)) byKey.set(key, item);
    }
    return byKey;
}

function localRoles(item: BaseItemDto, personId: string | undefined): FilmographyEntry['roles'] {
    const roles: FilmographyEntry['roles'] = {};
    for (const person of item.People || []) {
        if (person.Id !== personId) continue;
        if (person.Type === 'Director') roles.directing = ['Réalisation'];
        else if (person.Type === 'Actor' || person.Type === 'GuestStar') roles.acting = [...(roles.acting || []), person.Role || 'Interprétation'];
        else if (person.Type) roles.other = [...(roles.other || []), person.Role || person.Type];
    }
    return roles;
}

type FilmographyInput = {
    credits?: Credits; local: BaseItemDto[]; library: BaseItemDto[]; shared: SharedCatalogEntry[];
    personId?: string; includeAppearances: boolean;
};

function mergeCredit(credit: Credit, available: Map<string, BaseItemDto>, followed: Map<string, SharedCatalogEntry>,
    merged: Map<string, FilmographyEntry>, appearances: Set<string>, includeAppearances: boolean) {
    const type = credit.mediaType;
    if ((type !== 'movie' && type !== 'tv') || !Number.isSafeInteger(credit.id) || credit.id <= 0 || credit.adult) return;
    const key = `${type}:${credit.id}`;
    if (!includeAppearances && appearance(credit)) {
        appearances.add(key);
        return;
    }
    const role = department(credit);
    const existing = merged.get(key);
    const label = roleName(role, credit);
    if (existing) {
        existing.roles[role] = Array.from(new Set([...(existing.roles[role] || []), label]));
        return;
    }
    const localItem = available.get(key);
    const sharedEntry = followed.get(key);
    const pending = trackedLabel(credit, !!sharedEntry);
    const usable = !!localItem && (type !== 'tv' || credit.mediaInfo?.status !== 4);
    const item = usable ? localItem : catalogueItem({
        ...credit, posterPath: credit.posterPath || sharedEntry?.posterPath, backdropPath: credit.backdropPath || sharedEntry?.backdropPath
    }, type, []);
    const status = pending ? 'tracked' : 'requestable';
    merged.set(key, { item: item!, credit, type, status: usable ? 'available' : status, label: usable ? undefined : pending,
        followed: !!sharedEntry, roles: { [role]: [label] }, popularity: credit.popularity || 0, date: creditDate(credit, item) });
}

export function filmography({ credits, local, library, shared, personId, includeAppearances }: FilmographyInput) {
    const positions = matches(local, false);
    const available = matches([...local, ...library], true);
    const followed = new Map(shared.map(entry => [`${entry.type}:${entry.id}`, entry]));
    const merged = new Map<string, FilmographyEntry>();
    const appearances = new Set<string>();
    for (const credit of [...(credits?.cast || []), ...(credits?.crew || [])]) {
        mergeCredit(credit, available, followed, merged, appearances, includeAppearances);
    }
    for (const [key, item] of positions) {
        if (merged.has(key) || appearances.has(key)) continue;
        merged.set(key, { item, type: externalIdentity(item)?.type || (item.Type === 'Series' ? 'tv' : 'movie'),
            status: 'available', roles: localRoles(item, personId), date: creditDate(undefined, item), popularity: 0 });
    }
    return [...merged.values()];
}

export function browseFilmography(entries: FilmographyEntry[], type: string, role: string, sort: string) {
    return entries.filter(entry => (!type || type === entry.type) && (!role || !!entry.roles[role as FilmographyRole]?.length))
        .sort((left, right) => {
            const date = right.date.localeCompare(left.date);
            return sort === 'date' ? date || right.popularity - left.popularity : right.popularity - left.popularity || date;
        });
}
