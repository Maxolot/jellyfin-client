import type { MediaStream } from '@jellyfin/sdk/lib/generated-client';
import { beforeEach, describe, expect, it } from 'vitest';

import { choiceSummary, languageLabel, NO_SUBTITLES, normalizeLanguage, readTrackChoice, resolveTracks, saveTrackChoice, trackOptions } from './trackChoice';

const stream = (Type: string, Index: number, Language?: string, extra: Partial<MediaStream> = {}) => ({ Type, Index, Language, ...extra }) as MediaStream;
const film = [
    stream('Video', 0), stream('Audio', 1, 'eng', { IsDefault: true }), stream('Audio', 2, 'fre'), stream('Audio', 3, 'fra', { Title: 'Commentaire du réalisateur' }),
    stream('Subtitle', 4, 'fre', { IsForced: true }), stream('Subtitle', 5, 'fre'), stream('Subtitle', 6, 'eng'), stream('Audio', 7, 'und')
];

describe('language names', () => {
    it('treats the spellings of one language alike', () => {
        expect(normalizeLanguage('fre')).toBe('fra');
        expect(normalizeLanguage('FR')).toBe('fra');
    });
    it('names a language in French', () => expect(languageLabel('fra')).toBe('Français'));
    it('keeps an unknown code readable', () => expect(languageLabel('zzq')).toMatch(/zzq/i));
});

describe('trackOptions', () => {
    it('lists each spoken language once, without commentaries or unknown tracks', () => expect(trackOptions(film, 'Audio').map(option => option.key)).toEqual(['eng', 'fra']));
    it('leaves forced subtitles out', () => {
        expect(trackOptions([stream('Subtitle', 1, 'fre', { IsForced: true })], 'Subtitle')).toEqual([]);
        expect(trackOptions(film, 'Subtitle').map(option => option.key)).toEqual(['fra', 'eng']);
    });
});

describe('resolveTracks', () => {
    it('finds the numbers of this file', () => expect(resolveTracks(film, { audio: 'fra', subtitle: 'fra' })).toEqual({ audioStreamIndex: 2, subtitleStreamIndex: 5 }));
    it('prefers the default track of a language', () => expect(resolveTracks(film, { audio: 'eng' })).toEqual({ audioStreamIndex: 1 }));
    it('turns subtitles off explicitly', () => expect(resolveTracks(film, { subtitle: NO_SUBTITLES })).toEqual({ subtitleStreamIndex: -1 }));
    it('leaves the default when the file lacks the language', () => expect(resolveTracks(film, { audio: 'jpn', subtitle: 'jpn' })).toEqual({}));
    it('adapts to another episode with other numbers', () => expect(resolveTracks([stream('Audio', 9, 'fr')], { audio: 'fra' })).toEqual({ audioStreamIndex: 9 }));
});

describe('choiceSummary', () => {
    it('says when nothing was chosen', () => expect(choiceSummary({})).toBe('Par défaut'));
    it('sums up a choice', () => expect(choiceSummary({ audio: 'fra', subtitle: NO_SUBTITLES })).toBe('Français · sans sous-titres'));
});

describe('stored choices', () => {
    beforeEach(() => localStorage.clear());
    it('keeps a choice per title and per account', () => {
        saveTrackChoice('s', 'u', 'film', { audio: 'fra' });
        expect(readTrackChoice('s', 'u', 'film')).toEqual({ audio: 'fra' });
        expect(readTrackChoice('s', 'u', 'other')).toEqual({});
        expect(readTrackChoice('s', 'someone', 'film')).toEqual({});
    });
    it('forgets a title back on default', () => {
        saveTrackChoice('s', 'u', 'film', { audio: 'fra' });
        saveTrackChoice('s', 'u', 'film', {});
        expect(Object.keys(JSON.parse(localStorage.getItem('client-track-choices-s-u') || '{}'))).toEqual([]);
    });
    it('stays bounded, dropping the oldest titles', () => {
        for (let index = 0; index < 205; index++) saveTrackChoice('s', 'u', `title-${index}`, { audio: 'fra' });
        expect(readTrackChoice('s', 'u', 'title-0')).toEqual({});
        expect(readTrackChoice('s', 'u', 'title-204')).toEqual({ audio: 'fra' });
    });
    it('survives a damaged store', () => {
        localStorage.setItem('client-track-choices-s-u', 'not json');
        expect(readTrackChoice('s', 'u', 'film')).toEqual({});
    });
});
