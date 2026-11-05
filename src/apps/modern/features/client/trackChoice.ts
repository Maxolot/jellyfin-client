import type { MediaStream } from '@jellyfin/sdk/lib/generated-client';

export type TrackOption = { key: string; label: string };
/** Languages asked for on one film or series; absent means the account's own preferences. */
export type TrackChoice = { audio?: string; subtitle?: string };
export const NO_SUBTITLES = 'none';

const LEGACY_CODES: Record<string, string> = { fr: 'fra', fre: 'fra', french: 'fra', français: 'fra', francais: 'fra', en: 'eng', english: 'eng', ger: 'deu', de: 'deu', dut: 'nld', chi: 'zho', cze: 'ces', gre: 'ell', per: 'fas', rum: 'ron', slo: 'slk', ice: 'isl', mac: 'mkd', may: 'msa', bur: 'mya', baq: 'eus', arm: 'hye', alb: 'sqi', tib: 'bod', wel: 'cym', geo: 'kat', es: 'spa', it: 'ita', ja: 'jpn', ko: 'kor' };
const SKIPPED_LANGUAGES = new Set(['', 'und', 'mis', 'mul', 'zxx']);
const EXTRA_TRACK = /comment|descri/i;

/** Files name one language in several ways: fre, fra, fr, French. */
export function normalizeLanguage(code: string | null | undefined) {
    const value = (code || '').trim().toLowerCase();
    return LEGACY_CODES[value] || value;
}

export function languageLabel(code: string) {
    try {
        const name = new Intl.DisplayNames(['fr'], { type: 'language' }).of(code);
        if (name && name.toLowerCase() !== code) return name.charAt(0).toUpperCase() + name.slice(1);
    } catch { /* An unknown code keeps its own name below. */ }
    return code.charAt(0).toUpperCase() + code.slice(1);
}

function choosable(stream: MediaStream, type: 'Audio' | 'Subtitle') {
    return stream.Type === type && !stream.IsForced && !SKIPPED_LANGUAGES.has(normalizeLanguage(stream.Language))
        && !EXTRA_TRACK.test(`${stream.Title || ''} ${stream.DisplayTitle || ''}`);
}

export function trackOptions(streams: MediaStream[] | null | undefined, type: 'Audio' | 'Subtitle'): TrackOption[] {
    const keys = new Set((streams || []).filter(stream => choosable(stream, type)).map(stream => normalizeLanguage(stream.Language)));
    return [...keys].map(key => ({ key, label: languageLabel(key) }));
}

function indexFor(streams: MediaStream[], type: 'Audio' | 'Subtitle', language: string) {
    const matching = streams.filter(stream => choosable(stream, type) && normalizeLanguage(stream.Language) === language);
    return (matching.find(stream => stream.IsDefault) || matching[0])?.Index;
}

/** Turns languages into this file's own track numbers; a language it lacks leaves the server's default. */
export function resolveTracks(streams: MediaStream[] | null | undefined, choice: TrackChoice) {
    const all = streams || [];
    const tracks: { audioStreamIndex?: number; subtitleStreamIndex?: number } = {};
    const audio = choice.audio ? indexFor(all, 'Audio', choice.audio) : undefined;
    if (audio != null) tracks.audioStreamIndex = audio;
    if (choice.subtitle === NO_SUBTITLES) {
        tracks.subtitleStreamIndex = -1;
    } else if (choice.subtitle) {
        const subtitle = indexFor(all, 'Subtitle', choice.subtitle);
        if (subtitle != null) tracks.subtitleStreamIndex = subtitle;
    }
    return tracks;
}

export function choiceSummary(choice: TrackChoice) {
    const parts = [choice.audio && languageLabel(choice.audio)];
    if (choice.subtitle) parts.push(choice.subtitle === NO_SUBTITLES ? 'sans sous-titres' : `sous-titres ${languageLabel(choice.subtitle).toLowerCase()}`);
    return parts.filter(Boolean).join(' · ') || 'Par défaut';
}

const MAX_TITLES = 200;
const storageKey = (basePath: string | undefined, userId: string | undefined) => `client-track-choices-${basePath || ''}-${userId || ''}`;

function readAll(key: string): Record<string, TrackChoice> {
    try {
        const stored = JSON.parse(localStorage.getItem(key) || '{}');
        return stored && typeof stored === 'object' ? stored : {};
    } catch {
        return {};
    }
}

export function readTrackChoice(basePath: string | undefined, userId: string | undefined, titleId: string | null | undefined): TrackChoice {
    return titleId ? readAll(storageKey(basePath, userId))[titleId] || {} : {};
}

export function saveTrackChoice(basePath: string | undefined, userId: string | undefined, titleId: string, choice: TrackChoice) {
    const key = storageKey(basePath, userId);
    const all = readAll(key);
    delete all[titleId];
    if (choice.audio || choice.subtitle) all[titleId] = choice;
    const titles = Object.keys(all);
    for (const title of titles.slice(0, Math.max(0, titles.length - MAX_TITLES))) delete all[title];
    try {
        localStorage.setItem(key, JSON.stringify(all));
    } catch { /* The choice then lasts only for this visit's page. */ }
}
