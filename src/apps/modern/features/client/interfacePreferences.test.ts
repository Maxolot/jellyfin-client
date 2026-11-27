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
        expect(readInterfacePreferences('older')).toMatchObject({ floating: true, previews: true, previewMuted: true, hoverDescriptions: true, headerAlignment: 'center', hero: 'background', detailTreatment: 'cinema' });
        localStorage.setItem('broken', '{');
        expect(readInterfacePreferences('broken')).toMatchObject({ glass: true, detail: 'continuous' });
    });
    it('enables watched markers for older settings and preserves an explicit opt-out', () => {
        localStorage.setItem('disabled', JSON.stringify({ watchedMarkers: false }));
        expect(readInterfacePreferences('disabled').watchedMarkers).toBe(false);
        expect(readInterfacePreferences('new').watchedMarkers).toBe(true);
    });
    it('migrates an existing account once and keeps unrelated stored values', () => {
        localStorage.setItem('account', JSON.stringify({
            floating: false, hero: 'framed', detailTreatment: 'clear', glass: false, detailShade: 33, extension: 'keep'
        }));
        expect(readInterfacePreferences('account')).toMatchObject({
            floating: true, hero: 'background', detailTreatment: 'cinema', glass: false, detailShade: 33
        });
        const migrated = JSON.parse(localStorage.getItem('account')!);
        expect(migrated).toMatchObject({ version: 1, extension: 'keep' });
        localStorage.setItem('account', JSON.stringify({ ...migrated, floating: false, hero: 'framed', detailTreatment: 'progressive' }));
        expect(readInterfacePreferences('account')).toMatchObject({ floating: false, hero: 'framed', detailTreatment: 'progressive' });
    });

    it('seeds new accounts independently and uses the same defaults without an active account', () => {
        const presentation = { floating: true, hero: 'background', detailTreatment: 'cinema' };
        expect(readInterfacePreferences(undefined)).toMatchObject(presentation);
        expect(localStorage.length).toBe(0);
        expect(readInterfacePreferences('one')).toMatchObject(presentation);
        expect(readInterfacePreferences('two')).toMatchObject(presentation);
        expect(JSON.parse(localStorage.getItem('one')!)).toMatchObject({ ...presentation, version: 1 });
        expect(JSON.parse(localStorage.getItem('two')!)).toMatchObject({ ...presentation, version: 1 });
    });

    it('defaults detail information to the bottom and preserves the account’s previous-slot choice', () => {
        localStorage.setItem('first', JSON.stringify({ version: 1, detailInfo: 'center' }));
        localStorage.setItem('other', JSON.stringify({ version: 1 }));
        expect(readInterfacePreferences('first').detailInfo).toBe('center');
        expect(readInterfacePreferences('other').detailInfo).toBe('bottom');
        expect(JSON.parse(localStorage.getItem('other')!)).toEqual({ version: 1 });
    });

    it('does not reuse another account settings', () => {
        localStorage.setItem('first', JSON.stringify({ previews: false, glass: false, hoverDescriptions: false, headerAlignment: 'left' }));
        expect(readInterfacePreferences('other')).toMatchObject({ previews: true, glass: true, hoverDescriptions: true, headerAlignment: 'center' });
    });
});
