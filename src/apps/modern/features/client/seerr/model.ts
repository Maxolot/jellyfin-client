import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

export type MediaType = 'movie' | 'tv';
export type RequestStatus = 1 | 2 | 3 | 4 | 5;
export type MediaInfo = {
    id?: number;
    tmdbId?: number;
    tvdbId?: number;
    status?: number;
    status4k?: number;
    seasons?: { seasonNumber: number; status: number; status4k?: number }[];
    requests?: MediaRequest[];
};
export type MediaRequest = {
    id: number;
    status: RequestStatus;
    type?: MediaType;
    is4k?: boolean;
    createdAt?: string;
    modifiedAt?: string;
    requestedBy?: { id: number; displayName?: string };
    seasons?: { seasonNumber: number; status: RequestStatus }[];
    media: MediaInfo & { mediaType?: MediaType };
};
export type ExternalMedia = {
    id: number;
    mediaType?: MediaType | 'person';
    title?: string;
    name?: string;
    overview?: string;
    posterPath?: string;
    backdropPath?: string;
    releaseDate?: string;
    firstAirDate?: string;
    voteAverage?: number;
    runtime?: number;
    collection?: { id: number; name: string };
    genreIds?: number[];
    genres?: { id: number; name: string }[];
    seasons?: { id: number; seasonNumber: number; name: string; episodeCount?: number; airDate?: string }[];
    externalIds?: { tvdbId?: number; imdbId?: string };
    mediaInfo?: MediaInfo;
};
export type SeerrIdentity = { id: number; type: MediaType };
export type CatalogueItem = BaseItemDto & { Seerr?: ExternalMedia & { mediaType: MediaType } };
export type ProxyStatus = { enabled: boolean; authenticated: boolean; seerrUserId?: number; jellyseerrUserId?: number; permissions?: number };
export type SeerrUser = { id: number; permissions: number; displayName?: string };
export type Quota = { movie: { limit: number; remaining?: number; used?: number; days?: number; restricted: boolean }; tv: { limit: number; remaining?: number; used?: number; days?: number; restricted: boolean } };
export type Results<T> = { results: T[]; page?: number; totalPages?: number; totalResults?: number; pageInfo?: { pages: number; page: number; results: number } };

export function externalIdentity(item: BaseItemDto): SeerrIdentity | undefined {
    const match = /^seerr-(movie|tv)-(\d+)$/.exec(item.Id || '');
    if (match) return { type: match[1] as MediaType, id: Number(match[2]) };
    const id = Number(item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb);
    if (!Number.isSafeInteger(id) || id <= 0 || !['Movie', 'Series'].includes(item.Type || '')) return undefined;
    return { id, type: item.Type === 'Series' ? 'tv' : 'movie' };
}
export function isExternal(item: BaseItemDto) {
    return /^seerr-(movie|tv)-\d+$/.test(item.Id || '');
}
export function providerKey(item: BaseItemDto) {
    const identity = externalIdentity(item);
    return identity ? `${identity.type}:${identity.id}` : undefined;
}
export function localMatch(media: ExternalMedia, type: MediaType, local: BaseItemDto[]) {
    return local.find(item => item.Type === (type === 'tv' ? 'Series' : 'Movie') && (
        String(item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb || '') === String(media.id)
        || (type === 'tv' && !!(media.externalIds?.tvdbId || media.mediaInfo?.tvdbId) && String(item.ProviderIds?.Tvdb || item.ProviderIds?.tvdb) === String(media.externalIds?.tvdbId || media.mediaInfo?.tvdbId))
    ));
}
export function catalogueItem(media: ExternalMedia, type: MediaType, local: BaseItemDto[]): CatalogueItem {
    const match = localMatch(media, type, local);
    const year = Number((media.releaseDate || media.firstAirDate || '').slice(0, 4));
    return { ...{ Id: `seerr-${type}-${media.id}`, Type: type === 'tv' ? 'Series' as const : 'Movie' as const,
        Name: media.title || media.name, Overview: media.overview, CommunityRating: media.voteAverage,
        ProductionYear: year || undefined, RunTimeTicks: media.runtime ? media.runtime * 6e8 : undefined,
        Genres: media.genres?.map(genre => genre.name), ProviderIds: { Tmdb: String(media.id) } }, ...match,
    Seerr: { ...media, mediaType: type } };
}
export function mixCatalogue(local: BaseItemDto[], external: BaseItemDto[]) {
    const ids = new Set(local.map(item => item.Id));
    const providers = new Set(local.map(providerKey).filter(Boolean));
    return [...local, ...external.filter(item => {
        const key = providerKey(item);
        if (ids.has(item.Id) || (key && providers.has(key))) return false;
        ids.add(item.Id);
        if (key) providers.add(key);
        return true;
    })];
}
export function imageUrl(path: string | undefined, backdrop = false) {
    if (!path || !/^\/[a-zA-Z0-9._-]+$/.test(path)) return '';
    return `https://image.tmdb.org/t/p/${backdrop ? 'w1280' : 'w500'}${path}`;
}
export function mediaLabel(info?: MediaInfo) {
    switch (info?.status) {
        case 2: return 'En attente';
        case 3: return 'En préparation';
        case 4: return 'Partiellement disponible';
        case 5: return 'Disponible';
        case 6: return 'Indisponible à la demande';
        default: return 'À demander';
    }
}
export function requestLabel(status: number) {
    return ({ 1: 'En attente de validation', 2: 'En préparation', 3: 'Refusée', 4: 'Échec', 5: 'Disponible' } as Record<number, string>)[status] || 'Statut inconnu';
}
export function canRequest(permissions: number, type: MediaType, is4k = false) {
    if (permissions & 2) return true;
    const standard = 32 | (type === 'tv' ? 524288 : 262144);
    const ultra = 1024 | (type === 'tv' ? 4096 : 2048);
    return !!(permissions & (is4k ? ultra : standard));
}
export function requestableSeasons(detail: ExternalMedia, is4k = false) {
    return (detail.seasons || []).filter(season => {
        if (!season.seasonNumber || season.episodeCount === 0) return false;
        const state = detail.mediaInfo?.seasons?.find(entry => entry.seasonNumber === season.seasonNumber);
        const status = is4k ? state?.status4k : state?.status;
        const requested = detail.mediaInfo?.requests?.some(entry => !!entry.is4k === is4k && ![3, 5].includes(entry.status)
            && entry.seasons?.some(part => part.seasonNumber === season.seasonNumber));
        return !requested && ![2, 3, 4, 5, 6].includes(status || 0);
    });
}

/** Jellyfin playback availability wins over a lagging external scanner. */
export function withLocalAvailability(detail: ExternalMedia, local?: BaseItemDto, localSeasons: BaseItemDto[] = []): ExternalMedia {
    if (!local) return detail;
    const info = { ...detail.mediaInfo };
    if (local.Type === 'Movie') return { ...detail, mediaInfo: { ...info, status: 5 } };
    const seasons = [...(info.seasons || [])];
    localSeasons.filter(season => (season.IndexNumber || 0) > 0 && (season.ChildCount || 0) > 0).forEach(season => {
        const expected = detail.seasons?.find(entry => entry.seasonNumber === season.IndexNumber)?.episodeCount || 0;
        const actual = (expected > 0 && season.ChildCount! >= expected) ? 5 : 4;
        const index = seasons.findIndex(entry => entry.seasonNumber === season.IndexNumber);
        if (index >= 0) seasons[index] = { ...seasons[index], status: actual };
        else seasons.push({ seasonNumber: season.IndexNumber!, status: actual });
    });
    const required = (detail.seasons || []).filter(season => season.seasonNumber > 0 && (season.episodeCount || 0) > 0);
    const complete = required.length > 0 && required.every(season => seasons.some(entry => entry.seasonNumber === season.seasonNumber && entry.status === 5));
    return { ...detail, mediaInfo: { ...info, seasons, status: complete ? 5 : 4 } };
}
