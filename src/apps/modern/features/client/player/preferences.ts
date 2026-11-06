import { useCallback, useMemo, useState } from 'react';

export type PlayerPreferences = {
    style: 'glass' | 'classic' | 'minimal';
    accent: 'white' | 'red' | 'blue' | 'gold';
    size: number;
    hideAfter: number;
    skip: number;
    time: 'remaining' | 'total' | 'end';
    previews: boolean;
    intro: 'button' | 'auto' | 'never';
    next: number;
    subtitleSize: number;
    subtitleBackground: boolean;
    subtitlePosition: number;
};
export const playerDefaults: PlayerPreferences = {
    style: 'glass', accent: 'white', size: 100, hideAfter: 4, skip: 15,
    time: 'remaining', previews: true, intro: 'button', next: 10,
    subtitleSize: 100, subtitleBackground: true, subtitlePosition: 8
};
const choice = <T>(value: unknown, options: readonly T[], fallback: T): T => options.includes(value as T) ? value as T : fallback;
const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
export const playerPreferenceKey = (server: string, userId: string) => `client-player-${server}-${userId}`;
export function readPlayerPreferences(key: string): PlayerPreferences {
    try {
        const saved = JSON.parse(localStorage.getItem(key) || '{}') || {};
        return {
            style: choice(saved.style, ['glass', 'classic', 'minimal'], 'glass'),
            accent: choice(saved.accent, ['white', 'red', 'blue', 'gold'], 'white'),
            size: bounded(saved.size, 100, 80, 130), hideAfter: bounded(saved.hideAfter, 4, 2, 12),
            skip: choice(saved.skip, [5, 10, 15, 30], 15),
            time: choice(saved.time, ['remaining', 'total', 'end'], 'remaining'),
            previews: saved.previews !== false, intro: choice(saved.intro, ['button', 'auto', 'never'], 'button'),
            next: choice(saved.next, [0, 5, 10, 15, 30], 10),
            subtitleSize: bounded(saved.subtitleSize, 100, 70, 180),
            subtitleBackground: saved.subtitleBackground !== false,
            subtitlePosition: bounded(saved.subtitlePosition, 8, 0, 25)
        };
    } catch { return { ...playerDefaults }; }
}
export function usePlayerPreferences(key: string) {
    const [stored, setStored] = useState<{ key: string; value: PlayerPreferences }>();
    const value = useMemo(() => stored?.key === key ? stored.value : readPlayerPreferences(key), [key, stored]);
    const save = useCallback((next: PlayerPreferences) => {
        setStored({ key, value: next });
        try {
            localStorage.setItem(key, JSON.stringify(next));
        } catch { /* Keep the session usable without browser storage. */ }
    }, [key]);
    return [value, save] as const;
}
