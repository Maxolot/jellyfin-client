import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

import { imageUrl, requestableSeasons, type ExternalMedia, type MediaInfo } from './seerr/model';

export function orderSeasons(seasons: BaseItemDto[]) {
    return seasons.slice().sort((left, right) => seasonOrder(left) - seasonOrder(right));
}

function seasonOrder(season: BaseItemDto) {
    if (season.IndexNumber === 0) return Number.MAX_SAFE_INTEGER;
    return season.IndexNumber ?? Number.MAX_SAFE_INTEGER - 1;
}

export function seasonLabel(season: BaseItemDto) {
    if (season.IndexNumber === 0) return 'Épisodes spéciaux';
    return season.IndexNumber == null ? season.Name || 'Saison' : `Saison ${season.IndexNumber}`;
}

export function seasonProgress(season?: BaseItemDto, episodes?: BaseItemDto[]) {
    if (episodes) return { total: episodes.length, seen: episodes.filter(item => item.UserData?.Played).length };
    const total = season?.ChildCount ?? 0;
    const unplayed = season?.UserData?.UnplayedItemCount;
    const completed = season?.UserData?.Played ? total : 0;
    const seen = unplayed == null ? completed : Math.max(0, Math.min(total, total - unplayed));
    return { total, seen };
}

export function episodeCount(total: number) {
    return `${total} ${total === 1 ? 'épisode' : 'épisodes'}`;
}

export type RemoteSeason = {
    number: number;
    poster: string;
    status: string;
    quality?: 'standard' | '4k';
};

function downloadPercent(info: MediaInfo | undefined, number: number) {
    const transfers = [...(info?.downloadStatus || []), ...(info?.downloadStatus4k || [])]
        .filter(item => item.episode?.seasonNumber === number && item.status?.toLowerCase() === 'downloading');
    const jobs = [...new Map(transfers.map((item, index) => [item.downloadId || index, item])).values()];
    if (!jobs.length) return undefined;
    const measurable = jobs.filter(item => (item.size || 0) > 0 && Number.isFinite(item.sizeLeft) && item.sizeLeft! >= 0);
    if (measurable.length !== jobs.length) return null;
    const size = measurable.reduce((sum, item) => sum + item.size!, 0);
    const left = measurable.reduce((sum, item) => sum + Math.min(item.size!, item.sizeLeft!), 0);
    return Math.round(100 * (size - left) / size);
}

function remoteSeasonStatus(info: MediaInfo | undefined, number: number, action: boolean) {
    const progress = downloadPercent(info, number);
    if (progress === null) return 'En téléchargement';
    if (progress !== undefined) return `En téléchargement ${progress} %`;
    const status = info?.seasons?.find(entry => entry.seasonNumber === number);
    if (status?.status === 4 || status?.status4k === 4) return 'Partielle';
    const requested = info?.requests?.some(entry => [1, 2].includes(entry.status)
        && entry.seasons?.some(season => season.seasonNumber === number));
    if ([2, 3].includes(status?.status || 0) || [2, 3].includes(status?.status4k || 0) || requested) return 'Demandée';
    return action ? 'À demander' : 'Non disponible';
}

export function remoteSeasonChoices(local: BaseItemDto[], detail: ExternalMedia | undefined, standard: boolean, ultra: boolean): RemoteSeason[] {
    if (!detail?.seasons) return [];
    const available = new Set(local.map(item => item.IndexNumber));
    const modes = new Map<number, RemoteSeason['quality']>();
    if (ultra) {
        for (const season of requestableSeasons(detail, true)) modes.set(season.seasonNumber, '4k');
    }
    if (standard) {
        for (const season of requestableSeasons(detail)) modes.set(season.seasonNumber, 'standard');
    }
    return detail.seasons.filter(season => !available.has(season.seasonNumber)).map(season => {
        const number = season.seasonNumber;
        const status = remoteSeasonStatus(detail.mediaInfo, number, modes.has(number));
        return { number, status, poster: imageUrl(season.posterPath), quality: status === 'À demander' ? modes.get(number) : undefined };
    });
}

export function partialSeason(local: BaseItemDto, detail?: ExternalMedia) {
    const expected = detail?.seasons?.find(season => season.seasonNumber === local.IndexNumber)?.episodeCount || 0;
    return (local.ChildCount || 0) > 0 && local.ChildCount! < expected;
}

export function seasonSummary(local: BaseItemDto[], remote: RemoteSeason[]) {
    const count = new Set(local.map(item => item.IndexNumber).filter(number => number !== 0)).size;
    const total = count + new Set(remote.map(item => item.number).filter(number => number !== 0)).size;
    return `${count} saison${count === 1 ? '' : 's'} disponible${count === 1 ? '' : 's'} sur ${total}`;
}

export function seasonChoices(local: BaseItemDto[], missing: RemoteSeason[]) {
    const entries = [
        ...local.map(season => ({ key: season.Id || '', number: seasonOrder(season), season, remote: undefined })),
        ...missing.map(remote => ({ key: `remote-${remote.number}`, number: seasonOrder({ IndexNumber: remote.number }), season: undefined, remote }))
    ];
    return entries.sort((left, right) => left.number - right.number);
}
