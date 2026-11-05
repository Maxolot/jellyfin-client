import { describe, expect, it, vi } from 'vitest';

import { commonLanguages, fileLanguages } from './languageTags';

vi.mock('hooks/useApi', () => ({ useApi: () => ({}) }));
vi.mock('./session', () => ({ clientRequest: (run: () => unknown) => run() }));

const audio = (Language: string) => ({ Type: 'Audio', Language }) as never;
const subtitle = (Language: string, IsForced = false) => ({ Type: 'Subtitle', Language, IsForced }) as never;

describe('fileLanguages', () => {
    it('tags a French dub', () => expect(fileLanguages([audio('fre')])).toEqual(['vf']));
    it('tags original audio with French subtitles', () => expect(fileLanguages([audio('eng'), subtitle('fra')])).toEqual(['vo', 'vostfr']));
    it('tags a multi-audio file', () => expect(fileLanguages([audio('eng'), audio('fra'), subtitle('fra')])).toEqual(['multi', 'vf', 'vostfr']));
    it('ignores forced subtitles and unknown tracks', () => expect(fileLanguages([audio('und'), subtitle('fra', true)])).toEqual([]));
    it('keeps only what every episode offers', () => expect(commonLanguages([['multi', 'vf'], ['vf']])).toEqual(['vf']));
});
