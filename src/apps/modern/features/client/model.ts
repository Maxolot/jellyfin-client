import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

export function episodeLabel(item: BaseItemDto): string {
    return item.Type === 'Episode' ?
        `S${item.ParentIndexNumber ?? 1}:E${item.IndexNumber ?? 1}` :
        'Lecture';
}

export function uniqueItems(items: BaseItemDto[], excluded: BaseItemDto[] = []): BaseItemDto[] {
    const seen = new Set(excluded.map(item => item.Id));
    return items.filter(item => {
        if (!item.Id || seen.has(item.Id)) return false;
        seen.add(item.Id);
        return true;
    });
}

export function progressPercent(item: BaseItemDto): number {
    const duration = item.RunTimeTicks || 0;
    return duration > 0 ?
        Math.max(0, Math.min(100, (item.UserData?.PlaybackPositionTicks || 0) / duration * 100)) :
        0;
}

export function runtimeLabel(ticks?: number | null): string {
    if (!ticks) return '';
    const minutes = Math.round(ticks / 6e8);
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;
}
