import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';

import { episodeLabel } from '../model';
import { episodeDateLabel } from '../personalUpcoming';
import { requestEta, requestReason, requestStageLabel, type RequestProgress } from '../requests/model';

/** Where a title stands between « I want to watch it » and « I watched it ». */
export type JourneyStage = 'ready' | 'coming' | 'saved' | 'seen';
export type JourneyKind = 'resume' | 'next' | 'new' | 'arrived' | 'request' | 'upcoming' | 'list' | 'seen';

export type JourneyEntry = {
    key: string;
    stage: JourneyStage;
    kind: JourneyKind;
    title: string;
    subtitle?: string;
    reason: string;
    tone?: 'new' | 'alert';
    progress?: number;
    /** Minutes left to watch, for the « time available » filter. */
    minutes?: number;
    /** When it happened or will happen, for ordering and the timeline. */
    date?: number;
    item?: BaseItemDto;
    request?: RequestProgress;
};

export const STAGES: [JourneyStage, string, string][] = [
    ['ready', 'Prêt maintenant', 'Ce que tu peux lancer tout de suite.'],
    ['coming', 'En route', 'Tes demandes et les épisodes annoncés.'],
    ['saved', 'Mis de côté', 'Rangé dans tes dossiers.'],
    ['seen', 'Vu', 'Ce que tu as regardé dernièrement.']
];

const TICKS_PER_MINUTE = 600000000;
const DAY = 864e5;
const NEW_EPISODE_DAYS = 10;
const ARRIVED_DAYS = 14;

function time(value: string | null | undefined) {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : undefined;
}

/** « aujourd'hui », « hier », « il y a 3 jours », then a plain date. */
export function relativeDay(date: number, now: number) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    // Calendar days, rounded so that a change of daylight saving time does not shift the count.
    const days = Math.round((start.getTime() - day.getTime()) / DAY);
    if (date >= start.getTime()) return 'aujourd’hui';
    if (days === 1) return 'hier';
    if (days < 7) return `il y a ${days} jours`;
    return `le ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(date))}`;
}

function minutesLeft(item: BaseItemDto) {
    const total = item.RunTimeTicks || 0;
    if (!total) return undefined;
    return Math.max(1, Math.round((total - (item.UserData?.PlaybackPositionTicks || 0)) / TICKS_PER_MINUTE));
}

export function durationLabel(minutes: number) {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
}

function names(item: BaseItemDto) {
    if (item.Type === 'Episode') return { title: item.SeriesName || item.Name || '', subtitle: `${episodeLabel(item)} · ${item.Name}` };
    return { title: item.Name || '', subtitle: [item.ProductionYear, item.Type === 'Series' ? 'Série' : 'Film'].filter(Boolean).join(' · ') };
}

function fromItem(item: BaseItemDto, stage: JourneyStage, kind: JourneyKind, reason: string, extra: Partial<JourneyEntry> = {}): JourneyEntry {
    return { key: `${kind}:${item.Id}`, stage, kind, reason, item, minutes: minutesLeft(item), ...names(item), ...extra };
}

function fromRequest(request: RequestProgress, now: number): JourneyEntry | undefined {
    const base = { key: `request:${request.id}`, kind: 'request' as const, title: request.title, subtitle: request.type === 'tv' ? 'Série demandée' : 'Film demandé', request };
    const updated = time(request.updated);
    if (request.stage === 'removed') return undefined;
    if (request.stage === 'available' || request.stage === 'partial') {
        if (!updated || now - updated > ARRIVED_DAYS * DAY) return undefined;
        return { ...base, stage: 'ready', kind: 'arrived', tone: 'new', date: updated,
            reason: `${request.stage === 'partial' ? 'Arrivée en partie' : 'Ta demande est arrivée'} ${relativeDay(updated, now)}` };
    }
    if (['declined', 'failed', 'blocked'].includes(request.stage)) {
        return { ...base, stage: 'coming', tone: 'alert', date: updated, reason: requestReason(request) || requestStageLabel(request.stage) };
    }
    const eta = requestEta(request, now);
    const percent = request.percent ?? undefined;
    return { ...base, stage: 'coming', date: time(request.etaTo) || updated, progress: percent,
        reason: [requestStageLabel(request.stage), percent !== undefined && request.stage === 'downloading' ? `${Math.round(percent)} %` : '', eta?.replace('Arrivée estimée', 'arrivée')].filter(Boolean).join(' · ') };
}

export type JourneySources = {
    resume: BaseItemDto[];
    next: BaseItemDto[];
    requests: RequestProgress[];
    upcoming: BaseItemDto[];
    /** Titles filed in my folders, with the day they were filed (plugin keys). */
    saved: BaseItemDto[];
    filed?: Record<string, string | null>;
    history: BaseItemDto[];
};

/** Every title I mean to watch, once, at the furthest stage it reached, with the reason it is there. */
export function buildJourney(sources: JourneySources, now = Date.now()): JourneyEntry[] {
    const seen = new Set<string>();
    const once = (entry: JourneyEntry | undefined) => {
        if (!entry) return undefined;
        const id = entry.item?.SeriesId || entry.item?.Id || entry.request?.itemId || entry.key;
        if (seen.has(id)) return undefined;
        seen.add(id);
        return entry;
    };
    const arrived = sources.requests.map(request => fromRequest(request, now)).filter(entry => entry?.kind === 'arrived');
    const resume = sources.resume.map(item => {
        const minutes = minutesLeft(item);
        const played = time(item.UserData?.LastPlayedDate);
        return fromItem(item, 'ready', 'resume', minutes ? `Il te reste ${durationLabel(minutes)}` : 'À reprendre', {
            progress: item.UserData?.PlayedPercentage || undefined, date: played
        });
    });
    const next = sources.next.map(item => {
        const premiere = time(item.PremiereDate);
        const fresh = premiere && now - premiere < NEW_EPISODE_DAYS * DAY && premiere <= now;
        return fromItem(item, 'ready', fresh ? 'new' : 'next', fresh ? `Nouvel épisode, sorti ${relativeDay(premiere, now)}` : 'Épisode suivant',
            { tone: fresh ? 'new' : undefined, date: fresh ? premiere : time(item.UserData?.LastPlayedDate) });
    });
    const ready = [...arrived, ...next.filter(entry => entry.kind === 'new'), ...resume, ...next.filter(entry => entry.kind === 'next')];
    const coming = [
        ...sources.requests.map(request => fromRequest(request, now)).filter(entry => entry?.stage === 'coming'),
        ...sources.upcoming.map(item => fromItem(item, 'coming', 'upcoming', `Épisode annoncé ${episodeDateLabel(item.PremiereDate) || ''}`.trim(), { date: time(item.PremiereDate) }))
    ].sort((a, b) => (a?.date || Infinity) - (b?.date || Infinity));
    const saved = sources.saved.map(item => {
        const filed = time(sources.filed?.[(item.Id || '').replace(/-/g, '').toLowerCase()]);
        return fromItem(item, 'saved', 'list', filed ? `Mis de côté ${relativeDay(filed, now)}` : 'Mis de côté', { date: filed });
    });
    const history = sources.history.map(item => {
        const played = time(item.UserData?.LastPlayedDate);
        return fromItem(item, 'seen', 'seen', played ? `Vu ${relativeDay(played, now)}` : 'Vu', { date: played });
    });
    // Upcoming episodes and history keep their own entries even for a series in progress: they say something else.
    const entries = [...ready, ...coming.filter(entry => entry?.kind !== 'upcoming'), ...saved].map(once);
    return [...entries, ...coming.filter(entry => entry?.kind === 'upcoming'), ...history].filter((entry): entry is JourneyEntry => !!entry);
}

/** The « I have … » filter: what fits in the time available. */
export function fitsIn(entry: JourneyEntry, minutes: number | undefined) {
    return !minutes || !entry.minutes || entry.minutes <= minutes;
}
