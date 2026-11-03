import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

const TICKS_PER_HOUR = 36e9;
const RECENT_DAYS = 30;

export type GenreShare = { name: string; count: number; share: number };
export type PersonalStats = {
    movies: number;
    episodes: number;
    series: number;
    finishedSeries: number;
    hours: number;
    recent: number;
    genres: GenreShare[];
};

/** Viewing time counts each completed play; partial resumes are not added. */
function watchedHours(items: BaseItemDto[]) {
    return items.reduce((total, item) => total + (item.RunTimeTicks || 0) * Math.max(1, item.UserData?.PlayCount || 0), 0) / TICKS_PER_HOUR;
}

function playedSince(items: BaseItemDto[], now: number) {
    const limit = now - RECENT_DAYS * 864e5;
    return items.filter(item => {
        const date = Date.parse(item.UserData?.LastPlayedDate || '');
        return Number.isFinite(date) && date >= limit;
    }).length;
}

/** Genres weigh one per watched film and one per series with at least one watched episode. */
export function genreShares(titles: BaseItemDto[], limit = 6): GenreShare[] {
    const counts = new Map<string, number>();
    for (const title of titles) {
        for (const genre of new Set(title.Genres || [])) counts.set(genre, (counts.get(genre) || 0) + 1);
    }
    const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).slice(0, limit);
    const highest = top[0]?.[1] || 1;
    return top.map(([name, count]) => ({ name, count, share: count / highest }));
}

export function summarizeViewing(movies: BaseItemDto[], episodes: BaseItemDto[], series: BaseItemDto[], now = Date.now()): PersonalStats {
    return {
        movies: movies.length,
        episodes: episodes.length,
        series: new Set(episodes.map(episode => episode.SeriesId).filter(Boolean)).size,
        finishedSeries: series.filter(entry => entry.UserData?.Played).length,
        hours: watchedHours(movies) + watchedHours(episodes),
        recent: playedSince(movies, now) + playedSince(episodes, now),
        genres: genreShares([...movies, ...series])
    };
}

/** Keep the latest watched entry of each series so the history row shows distinct titles. */
export function distinctHistory(items: BaseItemDto[], limit = 16) {
    const seen = new Set<string>();
    return items.filter(item => {
        const key = item.SeriesId || item.Id || '';
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, limit);
}

export function formatHours(hours: number) {
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    return `${Math.round(hours).toLocaleString('fr-FR')} h`;
}
