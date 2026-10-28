import { afterEach, describe, expect, it } from 'vitest';

import { readInterfacePreferences } from './interfacePreferences';

afterEach(() => localStorage.clear());
describe('interface preference restoration', () => {
    it('restores disabled previews, their mute state and classic layout synchronously', () => {
        localStorage.setItem('account', JSON.stringify({ glass: false, previews: false, previewMuted: false, detail: 'immersive' }));
        expect(readInterfacePreferences('account')).toMatchObject({ glass: false, previews: false, previewMuted: false, detail: 'immersive' });
    });
    it('uses safe defaults for older settings and malformed storage', () => {
        localStorage.setItem('older', JSON.stringify({ floating: true }));
        expect(readInterfacePreferences('older')).toMatchObject({ floating: true, previews: true, previewMuted: true });
        localStorage.setItem('broken', '{');
        expect(readInterfacePreferences('broken')).toMatchObject({ glass: true, detail: 'continuous' });
    });
    it('does not reuse another account settings', () => {
        localStorage.setItem('first', JSON.stringify({ previews: false, glass: false }));
        expect(readInterfacePreferences('other')).toMatchObject({ previews: true, glass: true });
    });
});
