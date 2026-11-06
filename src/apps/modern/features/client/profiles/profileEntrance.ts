/**
 * Entrée dans un profil façon Netflix : l'avatar choisi grossit pendant que les autres s'effacent,
 * puis, une fois l'accueil chargé (parfois après un rechargement complet), il s'agrandit et se dissout pour révéler la page.
 */
export type Entrance = { image?: string; letter: string; tone?: string };

const KEY = 'client-profile-entrance';
const LEAVE_MS = 420;

export function reducedMotion() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Runs the leaving half on the "Qui regarde ?" page, then remembers what the home page has to finish. */
export function leaveProfiles(tile: HTMLElement | undefined, entrance: Entrance): Promise<void> {
    try {
        sessionStorage.setItem(KEY, JSON.stringify({ ...entrance, at: Date.now() }));
    } catch {
        // Without storage the home page simply appears.
    }
    if (!tile || reducedMotion()) return Promise.resolve();
    tile.closest('li')?.classList.add('is-chosen');
    tile.closest('ul')?.parentElement?.classList.add('client-profiles-leaving');
    return new Promise(resolve => window.setTimeout(resolve, LEAVE_MS));
}

/** The second half is played once: a reload or a later visit to the home page shows nothing. */
export function takeEntrance(): Entrance | undefined {
    try {
        const raw = sessionStorage.getItem(KEY);
        sessionStorage.removeItem(KEY);
        const value = JSON.parse(raw || 'null') as (Entrance & { at?: number }) | null;
        if (!value || typeof value.letter !== 'string' || !value.at || Date.now() - value.at > 20000) return undefined;
        return { image: typeof value.image === 'string' ? value.image : undefined, letter: value.letter, tone: typeof value.tone === 'string' ? value.tone : undefined };
    } catch {
        return undefined;
    }
}
