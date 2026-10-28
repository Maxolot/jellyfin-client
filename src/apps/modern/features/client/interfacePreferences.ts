import { useCallback, useMemo, useState } from 'react';

export type Preferences = {
    glass: boolean;
    floating: boolean;
    headerAlignment: 'left' | 'center' | 'right';
    chromatic: boolean;
    ambient: boolean;
    hoverDescriptions: boolean;
    hero: 'framed' | 'background';
    previews: boolean;
    previewMuted: boolean;
    detail: 'continuous' | 'fade' | 'immersive';
};
const defaults: Preferences = { glass: true, floating: false, headerAlignment: 'center', chromatic: false, ambient: true, hoverDescriptions: true, hero: 'framed', previews: true, previewMuted: true, detail: 'continuous' };

export function readInterfacePreferences(key: string): Preferences {
    try {
        const saved = JSON.parse(localStorage.getItem(key) || '{}');
        return {
            glass: typeof saved.glass === 'boolean' ? saved.glass : true,
            floating: saved.floating === true, chromatic: saved.chromatic === true,
            headerAlignment: ['left', 'center', 'right'].includes(saved.headerAlignment) ? saved.headerAlignment : 'center',
            ambient: saved.ambient !== false, previews: saved.previews !== false,
            hoverDescriptions: saved.hoverDescriptions !== false,
            hero: saved.hero === 'background' ? 'background' : 'framed',
            previewMuted: saved.previewMuted !== false,
            detail: ['continuous', 'fade', 'immersive'].includes(saved.detail) ? saved.detail : 'continuous'
        };
    } catch { return defaults; }
}

export function useInterfacePreferences(key: string) {
    const [stored, setStored] = useState<{ key: string; value: Preferences }>();
    const preferences = useMemo(() => stored?.key === key ? stored.value : readInterfacePreferences(key), [stored, key]);
    const save = useCallback((next: Preferences) => {
        setStored({ key, value: next });
        try {
            localStorage.setItem(key, JSON.stringify(next));
        } catch { /* In-memory settings still work when storage is unavailable. */ }
    }, [key]);
    return [preferences, save] as const;
}
