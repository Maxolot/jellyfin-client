import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

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
