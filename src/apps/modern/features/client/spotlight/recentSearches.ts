const LIMIT = 8;

/** Recent searches belong to one profile on one server, never shared with the other accounts of the device. */
export function recentSearchesKey(basePath: string | undefined, userId: string | null | undefined) {
    return `client-spotlight-recent-${basePath || ''}-${userId || ''}`;
}

export function readRecentSearches(key: string): string[] {
    try {
        const value = JSON.parse(localStorage.getItem(key) || '[]') as unknown;
        return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, LIMIT) : [];
    } catch {
        return [];
    }
}

function store(key: string, entries: string[]) {
    try {
        if (entries.length) localStorage.setItem(key, JSON.stringify(entries));
        else localStorage.removeItem(key);
    } catch { /* Storage can be disabled: the list then lasts for the visit only. */ }
    return entries;
}

export function rememberSearch(key: string, query: string) {
    const value = query.trim().slice(0, 80);
    if (!value) return readRecentSearches(key);
    const same = value.toLocaleLowerCase('fr');
    return store(key, [value, ...readRecentSearches(key).filter(entry => entry.toLocaleLowerCase('fr') !== same)].slice(0, LIMIT));
}

export function forgetSearch(key: string, query: string) {
    return store(key, readRecentSearches(key).filter(entry => entry !== query));
}

export function clearSearches(key: string) {
    return store(key, []);
}
