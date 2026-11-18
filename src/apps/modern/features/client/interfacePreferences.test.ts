import { afterEach, describe, expect, it } from 'vitest';

import { readInterfacePreferences } from './interfacePreferences';

afterEach(() => localStorage.clear());
describe('interface preference restoration', () => {
    it('restores disabled previews, their mute state and classic layout synchronously', () => {
        localStorage.setItem('account', JSON.stringify({ glass: false, previews: false, previewMuted: false, hoverDescriptions: false, headerAlignment: 'right', hero: 'background', detail: 'immersive' }));
        expect(readInterfacePreferences('account')).toMatchObject({ glass: false, previews: false, previewMuted: false, hoverDescriptions: false, headerAlignment: 'right', hero: 'background', detail: 'immersive' });
    });
    it('uses safe defaults for older settings and malformed storage', () => {
        localStorage.setItem('older', JSON.stringify({ floating: true }));
        expect(readInterfacePreferences('older')).toMatchObject({ floating: true, previews: true, previewMuted: true, hoverDescriptions: true, headerAlignment: 'center', hero: 'framed' });
        localStorage.setItem('broken', '{');
        expect(readInterfacePreferences('broken')).toMatchObject({ glass: true, detail: 'continuous' });
    });
    it('enables watched markers for older settings and preserves an explicit opt-out', () => {
        localStorage.setItem('disabled', JSON.stringify({ watchedMarkers: false }));
        expect(readInterfacePreferences('disabled').watchedMarkers).toBe(false);
        expect(readInterfacePreferences('new').watchedMarkers).toBe(true);
    });
    it('does not reuse another account settings', () => {
        localStorage.setItem('first', JSON.stringify({ previews: false, glass: false, hoverDescriptions: false, headerAlignment: 'left' }));
        expect(readInterfacePreferences('other')).toMatchObject({ previews: true, glass: true, hoverDescriptions: true, headerAlignment: 'center' });
    });
});
