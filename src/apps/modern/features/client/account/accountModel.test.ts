import { describe, expect, it } from 'vitest';

import { avatarProblem, formatBitrate, languageOptions, mergeConfiguration, normalizeQuickConnectCode, passwordProblem } from './accountModel';

describe('account settings model', () => {
    it('only replaces edited configuration fields', () => {
        const current = { AudioLanguagePreference: 'eng', OrderedViews: ['a', 'b'], EnableNextEpisodeAutoPlay: true };
        expect(mergeConfiguration(current, { AudioLanguagePreference: 'fre', EnableNextEpisodeAutoPlay: undefined }))
            .toEqual({ AudioLanguagePreference: 'fre', OrderedViews: ['a', 'b'], EnableNextEpisodeAutoPlay: true });
        expect(current.AudioLanguagePreference).toBe('eng');
    });

    it('validates password changes before sending them', () => {
        expect(passwordProblem('', 'new', 'new', true)).toMatch(/actuel/);
        expect(passwordProblem('', 'new', 'new', false)).toBe('');
        expect(passwordProblem('old', 'new', 'other', true)).toMatch(/correspondent/);
        expect(passwordProblem('old', '', '', true)).toMatch(/vide/);
        expect(passwordProblem('same', 'same', 'same', true)).toMatch(/différent/);
        expect(passwordProblem('old', 'new', 'new', true)).toBe('');
    });

    it('accepts six-digit Quick Connect codes only', () => {
        expect(normalizeQuickConnectCode(' 123 456 ')).toBe('123456');
        expect(normalizeQuickConnectCode('123-456')).toBe('123456');
        expect(normalizeQuickConnectCode('12345')).toBe('');
        expect(normalizeQuickConnectCode('abcdef')).toBe('');
    });

    it('checks avatar files and formats bitrates', () => {
        expect(avatarProblem(new File(['x'], 'a.png', { type: 'image/png' }))).toBe('');
        expect(avatarProblem(new File(['x'], 'a.svg', { type: 'image/svg+xml' }))).toMatch(/PNG/);
        expect(formatBitrate(1.5e6)).toMatch(/^1,5\s?Mbit\/s$/);
        expect(formatBitrate(420e3)).toBe('420 kbit/s');
    });

    it('lists languages in French and keeps an unknown stored code', () => {
        const cultures = [{ ThreeLetterISOLanguageName: 'fra', ThreeLetterISOLanguageNames: ['fra', 'fre'], TwoLetterISOLanguageName: 'fr', DisplayName: 'French' },
            { ThreeLetterISOLanguageName: 'eng', TwoLetterISOLanguageName: 'en', DisplayName: 'English' }];
        const options = languageOptions(cultures, 'fre');
        expect(options[0]).toEqual(['', 'Aucune préférence']);
        expect(options).toContainEqual(['fra', 'Français']);
        expect(options).toContainEqual(['eng', 'Anglais']);
        expect(options).toContainEqual(['fre', 'Français']);
    });
});
