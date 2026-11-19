import { useCallback, useMemo, useState } from 'react';

export type Preferences = {
    glass: boolean;
    floating: boolean;
    headerAlignment: 'left' | 'center' | 'right';
    chromatic: boolean;
    ambient: boolean;
    hoverDescriptions: boolean;
    watchedMarkers: boolean;
    hero: 'framed' | 'background';
    detailTreatment: 'progressive' | 'cinema' | 'clear';
    detailBlur: number;
    detailShade: number;
    detailWidth: number;
    previews: boolean;
    previewMuted: boolean;
    detail: 'continuous' | 'fade' | 'immersive';
};
const PREFERENCE_VERSION = 1;
const presentationDefaults = { floating: true, hero: 'background', detailTreatment: 'cinema' } as const;
const defaults: Preferences = { ...presentationDefaults, detailBlur: 24, detailShade: 75, detailWidth: 58, glass: true, headerAlignment: 'center', chromatic: false, ambient: true, hoverDescriptions: true, watchedMarkers: true, previews: true, previewMuted: true, detail: 'continuous' };

function bounded(value: unknown, fallback: number, min: number, max: number) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function preferenceRecord(key: string): Record<string, unknown> {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function versionOf(saved: Record<string, unknown>) {
    return typeof saved.version === 'number' && Number.isFinite(saved.version) ? saved.version : 0;
}

function persist(key: string, saved: Record<string, unknown>) {
    try {
        localStorage.setItem(key, JSON.stringify(saved));
    } catch { /* The interface still works without writable storage. */ }
}

function option<T>(value: unknown, choices: readonly T[], fallback: T): T {
    return choices.includes(value as T) ? value as T : fallback;
}

export function interfacePreferenceKey(address: string | undefined, userId: string | null | undefined) {
    return address && userId ? `client-interface-${address}-${userId}` : undefined;
}

export function readInterfacePreferences(key: string | undefined): Preferences {
    if (!key) return defaults;
    try {
        let saved = preferenceRecord(key);
        if (versionOf(saved) < PREFERENCE_VERSION) {
            saved = { ...saved, ...presentationDefaults, version: PREFERENCE_VERSION };
            persist(key, saved);
        }
        return {
            glass: typeof saved.glass === 'boolean' ? saved.glass : true,
            floating: saved.floating !== false, chromatic: saved.chromatic === true,
            headerAlignment: option(saved.headerAlignment, ['left', 'center', 'right'], defaults.headerAlignment),
            ambient: saved.ambient !== false, previews: saved.previews !== false,
            hoverDescriptions: saved.hoverDescriptions !== false, watchedMarkers: saved.watchedMarkers !== false,
            hero: option(saved.hero, ['framed', 'background'], defaults.hero),
            detailTreatment: option(saved.detailTreatment, ['progressive', 'cinema', 'clear'], defaults.detailTreatment),
            detailBlur: bounded(saved.detailBlur, 24, 0, 48),
            detailShade: bounded(saved.detailShade, 75, 0, 95),
            detailWidth: bounded(saved.detailWidth, 58, 35, 85),
            previewMuted: saved.previewMuted !== false,
            detail: option(saved.detail, ['continuous', 'fade', 'immersive'], defaults.detail)
        };
    } catch { return defaults; }
}

export function useInterfacePreferences(key: string | undefined) {
    const [stored, setStored] = useState<{ key: string | undefined; value: Preferences }>();
    const preferences = useMemo(() => stored && stored.key === key ? stored.value : readInterfacePreferences(key), [stored, key]);
    const save = useCallback((next: Preferences) => {
        setStored({ key, value: next });
        if (!key) return;
        let saved: Record<string, unknown>;
        try {
            saved = preferenceRecord(key);
        } catch {
            saved = {};
        }
        persist(key, { ...saved, ...next, version: Math.max(PREFERENCE_VERSION, versionOf(saved)) });
    }, [key]);
    return [preferences, save] as const;
}
