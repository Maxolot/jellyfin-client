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

/** Formats calendar dates without shifting them across time zones. */
export function releaseDateLabel(value?: string | null, year?: number | null): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value || '');
    if (match) {
        const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
        if (date.toISOString().slice(0, 10) === `${match[1]}-${match[2]}-${match[3]}`) {
            return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
        }
    }
    return year && Number.isInteger(year) && year > 0 ? String(year) : 'date inconnue';
}
