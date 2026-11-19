import type { MediaType, SeerrIdentity } from '../seerr/model';

export const steps = [
    ['requested', 'Demandée'], ['approved', 'Approuvée'], ['searching', 'Recherche'],
    ['downloading', 'Téléchargement'], ['import', 'Import'], ['library', 'Ajout à Jellyfin'], ['available', 'Disponible']
] as const;

type PositiveStage = typeof steps[number][0];
export type RequestStage = PositiveStage | 'blocked' | 'declined' | 'failed' | 'partial' | 'removed';

export type RequestProgress = {
    id: number;
    type: MediaType;
    tmdb: number;
    title: string;
    poster?: string | null;
    ultra: boolean;
    stage: RequestStage;
    reason?: string | null;
    updated: string;
    itemId?: string | null;
    seasons: Array<{ number: number; available: number; total?: number | null; episodes: number[] }>;
    percent?: number | null;
    bytesRemaining?: number | null;
    bytesPerSecond?: number | null;
    etaFrom?: string | null;
    etaTo?: string | null;
    active: boolean;
};

const reasons: Record<string, string> = {
    noSource: 'Aucune source trouvée. Le serveur réessaiera automatiquement.',
    importFailed: 'Le téléchargement est terminé, mais son import a échoué.',
    vpn: 'Le VPN de téléchargement est indisponible.',
    stalled: 'Le transfert ne progresse plus.',
    transferMissing: 'La source a été trouvée, mais le transfert a disparu de la file.',
    waitingForSpeed: 'Le débit est trop faible ou vient d’être mesuré.',
    trackingUnavailable: 'Le serveur ne peut pas vérifier la file pour le moment.'
};

export function requestReason(request: Pick<RequestProgress, 'reason'>) {
    return request.reason ? reasons[request.reason] : undefined;
}

export function requestStageLabel(stage: RequestStage) {
    return steps.find(step => step[0] === stage)?.[1] || ({ blocked: 'Bloquée', declined: 'Refusée', failed: 'Échec', partial: 'Disponible en partie', removed: 'Retirée du serveur' } as Record<string, string>)[stage] || 'Suivi en cours';
}

export function requestStep(request: RequestProgress) {
    if (request.stage === 'blocked') {
        if (request.reason === 'importFailed') return 4;
        if (request.reason === 'noSource') return 2;
        return 3;
    }
    if (request.stage === 'partial') return steps.length - 1;
    if (request.stage === 'removed') return -1;
    return steps.findIndex(([stage]) => stage === request.stage);
}

export function requestEta(request: Pick<RequestProgress, 'stage' | 'etaFrom' | 'etaTo'>, now = Date.now()) {
    const from = Date.parse(request.etaFrom || '');
    const to = Date.parse(request.etaTo || '');
    if (request.stage !== 'downloading' || !Number.isFinite(from) || !Number.isFinite(to) || to <= now || to <= from) return undefined;
    const base = new Date(now);
    const format = (date: Date) => new Intl.DateTimeFormat('fr-FR', {
        day: date.toDateString() === base.toDateString() ? undefined : 'numeric',
        month: date.toDateString() === base.toDateString() ? undefined : 'short',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
    return `Arrivée estimée entre ${format(new Date(Math.max(now, from)))} et ${format(new Date(to))}`;
}

export function latestRequest(items: RequestProgress[], identity: SeerrIdentity) {
    const matching = items.filter(item => item.type === identity.type && item.tmdb === identity.id);
    return matching.find(item => item.active) || matching[0];
}

export function requestRing(items: RequestProgress[]) {
    const active = items.filter(item => item.active);
    if (!active.length) return undefined;
    const progress = active.map(item => item.percent ?? Math.max(0, requestStep(item)) * 100 / (steps.length - 1));
    return { count: active.length, percent: Math.round(progress.reduce((sum, value) => sum + value, 0) / progress.length) };
}
