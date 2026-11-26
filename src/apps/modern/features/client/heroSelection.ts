import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

/** Candidates for the large banner of a page, gathered from the whole library rather than its first page. */
export type HeroPool = { recent: BaseItemDto[]; rated: BaseItemDto[]; history: BaseItemDto[] };
export type HeroMix = 'home' | 'films' | 'series';

const DAY = 864e5;

/** Genre weights from what the account watched lately: its favourite genres count most. */
export function tasteProfile(history: BaseItemDto[]) {
    const counts = new Map<string, number>();
    for (const item of history) for (const genre of item.Genres || []) counts.set(genre, (counts.get(genre) || 0) + 1);
    const top = Math.max(1, ...counts.values());
    return new Map([...counts].map(([genre, count]) => [genre, count / top]));
}

// Same value all day for a title, different the next day: the banner changes daily but not on every visit.
function dailyJitter(id: string, day: string) {
    let hash = 2166136261;
    for (const char of id + day) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return (hash % 1000) / 1000;
}

const SEQUEL_WORDS = new Set(['ii', 'iii', 'iv', 'part', 'partie', 'chapter', 'chapitre']);
const ARTICLES = new Set(['the', 'le', 'la', 'les']);

/** A rough family name, so two parts of the same saga do not share the banner. */
export function familyKey(item: BaseItemDto) {
    const plain = (item.Name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const head = plain.split(/[:–—]/)[0].split(' - ')[0];
    const words: string[] = [];
    for (const word of head.split(' ').filter(Boolean)) {
        if (words.length && (SEQUEL_WORDS.has(word) || /^\d+$/.test(word))) break;
        words.push(word);
    }
    if (words.length > 1 && ARTICLES.has(words[0])) words.shift();
    return words.join(' ').replace(/^l'/, '');
}

export function heroScore(item: BaseItemDto, taste: Map<string, number>, now: number, day: string, saved: ReadonlySet<string> = new Set()) {
    const rating = Math.min(10, Math.max(0, item.CommunityRating || 0)) / 10;
    const age = (now - Date.parse(item.DateCreated || '')) / DAY;
    const recency = age >= 0 && age < 30 ? 1 - age / 30 : 0;
    const genres = item.Genres || [];
    const affinity = genres.length ? Math.max(...genres.map(genre => taste.get(genre) || 0)) : 0;
    return rating * 2 + recency * 1.5 + (saved.has(savedKey(item.Id)) ? 1 : 0) + (item.ImageTags?.Logo ? 0.5 : 0)
        + affinity * 1.5 + dailyJitter(item.Id || '', day) * 1.2;
}

/** Folder keys are item ids without dashes, in lower case. */
const savedKey = (id: string | null | undefined) => (id || '').replace(/-/g, '').toLowerCase();

const eligible = (item: BaseItemDto) => !!item.Id && !item.UserData?.Played && !!item.BackdropImageTags?.length;

/**
 * Five unwatched titles with artwork, ranked by public rating, freshness, my folders and the account's genres,
 * varied in genre and saga. The home banner mixes films and series.
 */
function rank(pool: HeroPool, mix: HeroMix, now: number, exclude: ReadonlySet<string>, saved: ReadonlySet<string>) {
    const day = new Date(now).toDateString();
    const taste = tasteProfile(pool.history);
    const seen = new Set<string>();
    return [...pool.recent, ...pool.rated].filter(item => {
        if (!eligible(item) || exclude.has(item.Id!) || seen.has(item.Id!)) return false;
        seen.add(item.Id!);
        return mix === 'home' || (mix === 'films' ? item.Type === 'Movie' : item.Type === 'Series');
    }).map(item => ({ item, score: heroScore(item, taste, now, day, saved) })).sort((a, b) => b.score - a.score).map(entry => entry.item);
}

/**
 * Five unwatched titles with artwork, ranked by public rating, freshness, my folders and the account's genres,
 * varied in genre and saga. The home banner mixes films and series.
 */
export function pickHeroes(pool: HeroPool | undefined, mix: HeroMix, now = Date.now(), max = 5, exclude: ReadonlySet<string> = new Set(), saved: ReadonlySet<string> = new Set()) {
    if (!pool) return [];
    const ranked = rank(pool, mix, now, exclude, saved);
    const chosen: BaseItemDto[] = [];
    const genres = new Set<string>();
    const families = new Set<string>();
    const fits = (item: BaseItemDto, strict: boolean) => !chosen.includes(item) && !families.has(familyKey(item))
        && (!strict || !genres.has(item.Genres?.[0] || ''));
    // The home banner keeps room for both kinds: up to three films and two series, relaxed if one kind runs out.
    const quota = (item: BaseItemDto, limited: boolean) => !limited || mix !== 'home'
        || chosen.filter(entry => entry.Type === item.Type).length < (item.Type === 'Series' ? 2 : 3);
    for (const [strict, limited] of [[true, true], [false, true], [false, false]]) {
        for (const item of ranked.filter(entry => fits(entry, strict) && quota(entry, limited))) {
            if (chosen.length >= max) break;
            if (!fits(item, strict) || !quota(item, limited)) continue;
            chosen.push(item);
            if (item.Genres?.[0]) genres.add(item.Genres[0]);
            families.add(familyKey(item));
        }
    }
    return chosen;
}
