export type PreviewScene = { ItemId: string; SourceItemId: string; StartSeconds: number; DurationSeconds: number; Approved: boolean; State: string; Imported?: boolean; Automatic?: boolean };

export function sceneProblem(start: number, duration: number, runtime?: number | null) {
    if (!Number.isFinite(start) || start < 0) return 'La position doit être un nombre positif ou nul, en secondes.';
    if (!Number.isFinite(duration) || duration < 1 || duration > 30) return 'La durée doit être comprise entre 1 et 30 secondes.';
    if (runtime && start + duration > runtime / 10000000) return 'La scène dépasse la fin du film ou de l’épisode.';
    return '';
}

export function sceneState(state: string) {
    return ({ ready: 'Prêt', pending: 'En attente', queued: 'En file', encoding: 'Préparation', evicted: 'À recréer', failed: 'Échec', error: 'Échec' } as Record<string, string>)[state] || 'En attente';
}

export const sameItem = (a?: string, b?: string) => !!a && !!b && a.replace(/-/g, '').toLowerCase() === b.replace(/-/g, '').toLowerCase();
