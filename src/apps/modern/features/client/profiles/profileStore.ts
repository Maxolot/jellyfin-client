/** A person who has signed in on this browser. Without a token, returning asks for the password. */
export type SavedProfile = { userId: string; name: string; token?: string; imageTag?: string };

const MAX_PROFILES = 8;
const CHOSEN_KEY = 'client-profile-chosen';
const storageKey = (basePath: string) => `client-profiles-${basePath}`;

export function readProfiles(basePath: string | undefined): SavedProfile[] {
    if (!basePath) return [];
    try {
        const stored = JSON.parse(localStorage.getItem(storageKey(basePath)) || '[]');
        return Array.isArray(stored) ? stored.filter(entry => entry && typeof entry.userId === 'string' && typeof entry.name === 'string') : [];
    } catch {
        return [];
    }
}

function write(basePath: string, profiles: SavedProfile[]) {
    try {
        localStorage.setItem(storageKey(basePath), JSON.stringify(profiles));
    } catch { /* Without storage, only the current account exists. */ }
}

/** Keeps its place in the list, so that faces do not move from one visit to the next. */
export function rememberProfile(basePath: string, profile: SavedProfile) {
    const profiles = readProfiles(basePath);
    const index = profiles.findIndex(entry => entry.userId === profile.userId);
    if (index >= 0) profiles[index] = profile;
    else profiles.push(profile);
    write(basePath, profiles.slice(-MAX_PROFILES));
}

export function forgetProfile(basePath: string | undefined, userId: string | undefined) {
    if (!basePath || !userId) return;
    write(basePath, readProfiles(basePath).filter(entry => entry.userId !== userId));
}

/** An expired session: the person stays on the page but must give the password again. */
export function dropToken(basePath: string, userId: string) {
    write(basePath, readProfiles(basePath).map(entry => entry.userId === userId ? { userId: entry.userId, name: entry.name, imageTag: entry.imageTag } : entry));
}

export function profileChosen() {
    try {
        return sessionStorage.getItem(CHOSEN_KEY) === '1';
    } catch {
        return true;
    }
}

export function markProfileChosen() {
    try {
        sessionStorage.setItem(CHOSEN_KEY, '1');
    } catch { /* The page is then simply not asked again without storage. */ }
}

const TONES = ['#b9252f', '#2563a8', '#2f8a57', '#b7791f', '#7c3aad', '#0f8a8f'];

/** Same person, same colour, on every browser. */
export function profileTone(userId: string) {
    let hash = 0;
    for (const character of userId) hash = (hash * 31 + (character.codePointAt(0) || 0)) % 997;
    return TONES[hash % TONES.length];
}
