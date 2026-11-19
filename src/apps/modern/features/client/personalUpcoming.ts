import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

export const seriesKey = (id: string | null | undefined) => (id || '').replace(/-/g, '').toLowerCase();

export function followedSeries(favorites: BaseItemDto[], resumes: BaseItemDto[]) {
    return [...new Set([...favorites, ...resumes].map(item => seriesKey(item.Type === 'Series' ? item.Id : item.SeriesId)).filter(Boolean))];
}

export function calendarDay(date: Date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function premiereDay(value: string | null | undefined) {
    const day = /^\d{4}-\d{2}-\d{2}(?=T|$)/.exec(value || '')?.[0];
    if (!day) return undefined;
    const local = new Date(`${day}T12:00:00`);
    return calendarDay(local) === day ? day : undefined;
}

export function episodeDateLabel(value: string | null | undefined, now = new Date()) {
    const day = premiereDay(value);
    if (!day) return '';
    if (day === calendarDay(now)) return 'Aujourd’hui';
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (day === calendarDay(tomorrow)) return 'Demain';
    const date = new Date(`${day}T12:00:00`);
    const label = date.toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'short',
        year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

export function episodesForSeries(items: BaseItemDto[], series: ReadonlySet<string>, today: string) {
    return items.filter(episode => {
        const date = premiereDay(episode.PremiereDate);
        return !!episode.Id && !!date && date >= today && series.has(seriesKey(episode.SeriesId));
    });
}
