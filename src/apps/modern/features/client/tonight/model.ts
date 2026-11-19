import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

import { personalStars } from '../ratings';
import { isExternal } from '../seerr/model';
import { normalizeText } from '../spotlight/searchIndex';

export type Energy = 'rest' | 'engaged';
export type TonightCriteria = { partner: string; deadline: number; energy: Energy; prompt: string; includeRequests: boolean };
export type JointIdea = { itemId: string; reason: string; position: number };
export type SemanticIdea = { itemId: string; score: number; reason: string };
export type TonightTitle = BaseItemDto & { episodeMinutes?: number; episodes?: number };
export type TonightIdea = { item: TonightTitle; score: number; reasons: string[]; minutes: number; genres: string[] };

export const defaultCriteria: TonightCriteria = { partner: '', deadline: -1, energy: 'rest', prompt: '', includeRequests: false };

const relaxed = new Set(['comedie', 'comedy', 'familial', 'family', 'animation', 'romance']);
const engaged = new Set(['thriller', 'mystere', 'mystery', 'crime', 'horror', 'horreur', 'science fiction', 'drame', 'drama']);
const stop = new Set(['dans', 'avec', 'comme', 'pour', 'mais', 'film', 'films', 'serie', 'series', 'truc', 'quand', 'dont', 'juste']);
const halfHour = 30 * 60 * 1000;

export function identity(value: string) {
    return value.toLowerCase().replace(/^([a-f0-9-]{36})$/, part => part.replace(/-/g, ''));
}

export function tonightStateKey(server: string | undefined, user: string | null | undefined) {
    return server && user ? `client-tonight:${server}:${user}` : undefined;
}

type Stored = { criteria: TonightCriteria; recent: string[]; favorites: Record<string, number> };

function storedObject(key?: string): Partial<Stored> {
    try {
        const value = key && JSON.parse(localStorage.getItem(key) || '{}');
        return value && typeof value === 'object' ? value : {};
    } catch {
        return {};
    }
}

export function readTonight(key?: string): Stored {
    const value = storedObject(key);
    const criteria = value.criteria;
    return {
        criteria: {
            partner: typeof criteria?.partner === 'string' ? criteria.partner : '',
            deadline: Number.isInteger(criteria?.deadline) && criteria!.deadline >= 0 && criteria!.deadline < 1440 ? criteria!.deadline : -1,
            energy: criteria?.energy === 'engaged' ? 'engaged' : 'rest',
            prompt: typeof criteria?.prompt === 'string' ? criteria.prompt.slice(0, 180) : '',
            includeRequests: criteria?.includeRequests === true
        },
        recent: Array.isArray(value.recent) ? value.recent.filter(id => typeof id === 'string').slice(0, 18) : [],
        favorites: value.favorites && typeof value.favorites === 'object' ? value.favorites : {}
    };
}

export function writeTonight(key: string | undefined, change: Partial<Stored>) {
    if (!key) return;
    try {
        localStorage.setItem(key, JSON.stringify({ ...readTonight(key), ...change }));
    } catch { /* Browsing remains available if storage is disabled. */ }
}

export function deadlineTargets(now: number) {
    const first = Math.ceil((now + halfHour) / halfHour) * halfHour;
    return Array.from({ length: 4 }, (_, index) => {
        const target = new Date(first + index * halfHour);
        return { value: target.getHours() * 60 + target.getMinutes(), label: clockLabel(first + index * halfHour) };
    });
}

export function clockLabel(time: number) {
    const date = new Date(time);
    const hour = date.getHours();
    const minute = date.getMinutes();
    if (hour === 0 && minute === 0) return 'minuit';
    return minute ? `${hour} h ${String(minute).padStart(2, '0')}` : `${hour} h`;
}

export function availableMinutes(deadline: number, now: number) {
    if (deadline < 0) return undefined;
    const date = new Date(now);
    const left = (1440 + deadline - date.getHours() * 60 - date.getMinutes()) % 1440;
    return left <= 6 * 60 ? left : undefined;
}

export function minutesOf(item: TonightTitle) {
    const ticks = item.Type === 'Series' ? item.episodeMinutes : undefined;
    const runtime = ticks || Math.ceil((item.RunTimeTicks || 0) / 6e8);
    return Number.isFinite(runtime) && runtime > 0 ? runtime : 0;
}

type Trait = { key: string; label: string; kind: 'genre' | 'director' | 'actor' | 'keyword' };

function traits(item: BaseItemDto): Trait[] {
    const named = (values: string[], kind: Trait['kind']) => values.map(label => ({ key: `${kind}:${normalizeText(label)}`, label, kind }));
    return [
        ...named(item.Genres || [], 'genre'),
        ...named((item.People || []).filter(person => person.Type === 'Director').map(person => person.Name || '').filter(Boolean), 'director'),
        ...named((item.People || []).filter(person => person.Type === 'Actor').slice(0, 8).map(person => person.Name || '').filter(Boolean), 'actor'),
        ...named((item.Tags || []).slice(0, 12), 'keyword')
    ];
}

type Taste = { total: number; count: number; source?: BaseItemDto; peak: number };

function tasteWeight(item: BaseItemDto) {
    const stars = personalStars(item);
    const played = item.UserData?.Played ? 0.24 : 0;
    const favorite = item.UserData?.IsFavorite ? 0.9 : 0;
    const like = stars != null && stars >= 4 ? stars - 2.2 : 0;
    const dislike = stars != null && stars <= 2 ? 2.6 : 0;
    return played + favorite + like - dislike;
}

export function tasteFrom(items: BaseItemDto[]) {
    const profile = new Map<string, Taste>();
    for (const item of items) {
        const weight = tasteWeight(item);
        if (weight === 0) continue;
        for (const feature of traits(item)) {
            const entry = profile.get(feature.key) || { total: 0, count: 0, peak: 0 };
            profile.set(feature.key, { total: entry.total + weight, count: entry.count + 1,
                source: weight > entry.peak ? item : entry.source, peak: Math.max(entry.peak, weight) });
        }
    }
    return profile;
}

function tasteReason(feature: Trait, source: BaseItemDto) {
    const stars = personalStars(source);
    if (stars != null && stars >= 4) return `Parce que vous avez noté ${source.Name} ${stars.toLocaleString('fr-FR')} ★`;
    if (feature.kind === 'director') return `Même réalisation que ${source.Name}`;
    if (feature.kind === 'actor') return `${feature.label}, comme dans ${source.Name}`;
    return `Dans l’esprit de ${source.Name}`;
}

function filingReason(at: number, now: number) {
    const days = Math.max(0, Math.floor((now - at) / 864e5));
    if (days < 7) return 'Dans votre liste';
    if (days < 30) return `Dans votre liste depuis ${Math.floor(days / 7)} sem.`;
    return `Dans votre liste depuis ${Math.floor(days / 30)} mois`;
}

function sessionEnergy(item: TonightTitle, minutes: number, energy: Energy, genres: string[]) {
    const wanted = energy === 'rest' ? relaxed : engaged;
    const fit = genres.some(genre => wanted.has(genre));
    const lowEffort = minutes > 0 && minutes <= 105 ? 0.8 : 0;
    const publicBonus = (item.CommunityRating || 0) >= 7.5 ? 0.8 : 0;
    const reason = energy === 'rest' ? 'Léger pour ce soir' : 'Du suspense ou un récit prenant';
    return { score: (fit ? 2.2 : 0) + (energy === 'rest' ? lowEffort : publicBonus), reason: fit ? reason : undefined };
}

type Selection = {
    items: TonightTitle[]; profile: Map<string, Taste>; criteria: TonightCriteria; now: number;
    hidden: ReadonlySet<string>; recent: ReadonlySet<string>; started: ReadonlySet<string>;
    filed: ReadonlyMap<string, number>; semantic: ReadonlyMap<string, SemanticIdea>;
    joint?: ReadonlyMap<string, JointIdea>; seed: number;
};

function promoted(item: TonightTitle, data: Selection): TonightIdea {
    const id = identity(item.Id || '');
    const features = traits(item);
    const genres = features.filter(feature => feature.kind === 'genre').map(feature => normalizeText(feature.label));
    const matches = features.flatMap(feature => {
        const opinion = data.profile.get(feature.key);
        return opinion ? [{ feature, source: opinion.source, weight: opinion.total / Math.sqrt(opinion.count + 2) }] : [];
    }).sort((a, b) => b.weight - a.weight);
    const affinity = matches.reduce((sum, match) => sum + match.weight, 0);
    const liked = matches.find(match => match.weight > 0.35 && match.source?.Name);
    const saved = data.filed.get(id);
    const filing = saved == null ? 0 : 1.4 + Math.min(3, Math.max(0, data.now - saved) / (100 * 864e5));
    const rating = Math.max(0, (item.CommunityRating || 5) - 5) * 0.32;
    const minutes = minutesOf(item);
    const energy = sessionEnergy(item, minutes, data.criteria.energy, genres);
    const semantic = data.semantic.get(id);
    const words = normalizeText(data.criteria.prompt).split(' ').filter(word => word.length >= 4 && !stop.has(word));
    const document = normalizeText([item.Name, item.Overview, ...(item.Tags || []), ...(item.Genres || [])].join(' '));
    const lexical = words.filter(word => document.includes(word));
    const pair = data.joint?.get(id);
    const reasons = [
        pair?.reason,
        semantic?.reason,
        saved == null ? undefined : filingReason(saved, data.now),
        !pair && liked?.source ? tasteReason(liked.feature, liked.source) : undefined,
        lexical.length ? lexical.slice(0, 2).join(' · ') : undefined,
        energy.reason
    ].filter((reason): reason is string => !!reason);
    const variance = Array.from(id).reduce((hash, letter) => (hash * 31 + letter.charCodeAt(0)) % 99991, data.seed) % 100 / 150;
    const cost = data.recent.has(id) ? 12 : 0;
    const similarity = semantic ? semantic.score * 8 : Math.min(4, lexical.length * 1.6);
    const together = pair && data.joint ? 5 * (1 - pair.position / Math.max(1, data.joint.size)) : 0;
    const interest = pair ? affinity * 0.35 + together : affinity;
    const score = interest + filing + rating + energy.score + similarity + variance - cost - (isExternal(item) ? 0.9 : 0);
    if (!reasons.length) reasons.push(item.CommunityRating && item.CommunityRating >= 7.5 ? 'Bien noté par le public' : 'Une découverte à explorer');
    return { item, score, reasons: [...new Set(reasons)].slice(0, 2), minutes, genres };
}

function eligible(item: TonightTitle, data: Selection) {
    const id = identity(item.Id || '');
    if (!id || data.hidden.has(id) || item.LocationType === 'Virtual' || item.IsPlaceHolder) return false;
    if (item.UserData?.Played || (item.UserData?.PlaybackPositionTicks || 0) > 0 || data.started.has(id)) return false;
    if (item.CommunityRating != null && item.CommunityRating > 0 && item.CommunityRating < 4) return false;
    if (data.joint && !data.joint.has(id)) return false;
    return !isExternal(item) || data.criteria.includeRequests;
}

function varied(items: TonightIdea[]) {
    const seen = new Set<string>();
    const choices: TonightIdea[] = [];
    const pool = [...items];
    while (pool.length && choices.length < 3) {
        const score = (idea: TonightIdea) => idea.score - (idea.genres.some(genre => !seen.has(genre)) ? 0 : 4);
        pool.sort((a, b) => score(b) - score(a));
        const idea = pool.shift()!;
        if (isExternal(idea.item) && choices.some(existing => isExternal(existing.item))) continue;
        choices.push(idea);
        for (const genre of idea.genres) seen.add(genre);
    }
    return choices;
}

export function suggestTonight(data: Selection) {
    const limit = availableMinutes(data.criteria.deadline, data.now);
    const all = data.items.filter(item => eligible(item, data)).map(item => promoted(item, data));
    const fits = limit == null ? all : all.filter(idea => idea.minutes > 0 && idea.minutes <= limit);
    if (fits.length || limit == null) return { ideas: varied(fits), earliest: undefined };
    const over = all.filter(idea => idea.minutes > limit).sort((a, b) => a.minutes - b.minutes);
    const earliest = over[0]?.minutes;
    return { ideas: varied(earliest ? over.filter(idea => idea.minutes <= earliest + 15) : []), earliest };
}
