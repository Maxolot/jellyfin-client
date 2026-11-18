import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

/** Lower case, without accents or punctuation: « L'Odyssée » and « l odyssee » compare equal. */
export function normalizeText(value: string | null | undefined) {
    return (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/&/g, ' et ').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Edit distance with swapped letters counted once (« interstelar », « intestellar »), stopped past `limit`. */
export function editDistance(a: string, b: string, limit: number) {
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    let before: number[] = [];
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        let best = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, before[j - 2] + 1);
            current.push(value);
            best = Math.min(best, value);
        }
        if (best > limit) return limit + 1;
        before = previous;
        previous = current;
    }
    return previous[b.length];
}

/** Typos allowed for a word of this length: none for short words, where a typo is another word. */
function tolerance(word: string) {
    if (word.length >= 8) return 2;
    return word.length >= 4 ? 1 : 0;
}

export type ParsedQuery = { text: string; words: string[]; year?: number };

/** A trailing or leading year (« dune 2021 ») narrows the search instead of being looked for in titles. */
export function parseQuery(query: string): ParsedQuery {
    const words = normalizeText(query).split(' ').filter(Boolean);
    const yearAt = words.findIndex(word => /^(19|20)\d\d$/.test(word));
    if (yearAt >= 0 && words.length > 1) {
        const year = Number(words[yearAt]);
        const rest = words.filter((_, index) => index !== yearAt);
        return { text: rest.join(' '), words: rest, year };
    }
    return { text: words.join(' '), words };
}

function wordScore(word: string, titleWords: string[], last: boolean): number {
    if (titleWords.includes(word)) return 1;
    // The word being typed matches the start of a title word.
    if (last && titleWords.some(title => title.startsWith(word))) return 0.9;
    if (titleWords.some(title => title.startsWith(word) && word.length >= 3)) return 0.8;
    const allowed = tolerance(word);
    if (!allowed) return 0;
    const close = titleWords.some(title => editDistance(word, title, allowed) <= allowed
        || (last && title.length > word.length && editDistance(word, title.slice(0, word.length), allowed) <= allowed));
    return close ? 0.6 : 0;
}

/** How well one title matches, from 0 (no match) to 100 (identical). */
export function titleScore(title: string | null | undefined, parsed: ParsedQuery) {
    const normalized = normalizeText(title);
    if (!normalized || !parsed.text) return 0;
    if (normalized === parsed.text) return 100;
    if (normalized.startsWith(parsed.text)) return 90 - Math.min(10, (normalized.length - parsed.text.length) / 4);
    const titleWords = normalized.split(' ');
    if (` ${normalized} `.includes(` ${parsed.text} `)) return 78;
    const scores = parsed.words.map((word, index) => wordScore(word, titleWords, index === parsed.words.length - 1));
    if (scores.every(score => score > 0)) {
        const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        // Titles with few extra words rank first: « Dune » before « Dune : Prophecy ».
        const coverage = parsed.words.length / Math.max(titleWords.length, parsed.words.length);
        return 40 + mean * 30 + coverage * 6;
    }
    const allowed = tolerance(parsed.text.replace(/ /g, ''));
    if (allowed && editDistance(parsed.text, normalized, allowed) <= allowed) return 45;
    return 0;
}

export function itemScore(item: BaseItemDto, parsed: ParsedQuery) {
    let score = Math.max(titleScore(item.Name, parsed), titleScore(item.OriginalTitle, parsed) - 2, titleScore(item.SortName, parsed) - 4);
    if (!score) return 0;
    if (parsed.year) {
        const year = item.ProductionYear || Number(item.PremiereDate?.slice(0, 4)) || 0;
        if (year === parsed.year) score += 15;
        else if (Math.abs(year - parsed.year) === 1) score += 4;
        else score -= 30;
    }
    return Math.max(0, score);
}

export type SearchFilter = 'all' | 'films' | 'series' | 'available';

export function matchesFilter(item: BaseItemDto, filter: SearchFilter) {
    if (filter === 'films') return item.Type === 'Movie';
    if (filter === 'series') return item.Type === 'Series';
    return true;
}

/** Best matching titles first; ties keep the most recent first, as a viewer usually means the new one. */
export function rankItems<T extends BaseItemDto>(items: T[], query: string, filter: SearchFilter = 'all', limit = 20) {
    const parsed = parseQuery(query);
    if (!parsed.text) return [];
    return items.filter(item => matchesFilter(item, filter))
        .map(item => ({ item, score: itemScore(item, parsed) }))
        .filter(entry => entry.score >= 40)
        .sort((a, b) => b.score - a.score || (b.item.ProductionYear || 0) - (a.item.ProductionYear || 0))
        .slice(0, limit);
}

/** Names (people, sagas, genres) matched the same tolerant way. */
export function rankNames<T>(entries: T[], name: (entry: T) => string | null | undefined, query: string, limit = 6) {
    const parsed = parseQuery(query);
    if (!parsed.text) return [];
    return entries.map(entry => ({ entry, score: titleScore(name(entry), parsed) }))
        .filter(match => match.score >= 45)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(match => match.entry);
}
