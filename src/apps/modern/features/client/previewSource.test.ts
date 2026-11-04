import { describe, expect, it } from 'vitest';

import { previewSource } from './previewSource';

describe('optional short-clip sources', () => {
    const variants = { film: { compact: './clips/film-480.mp4', full: './clips/film-1080.mp4' } };
    it.each(['card', 'episode'] as const)('selects only the compact encode for %s', surface => {
        expect(previewSource(variants, { Id: 'film' }, 'https://client.example.test/web/', false, surface))
            .toBe('https://client.example.test/web/clips/film-480.mp4');
    });
    it.each(['hero', 'detail', 'spotlight'] as const)('selects only the full encode for %s', surface => {
        expect(previewSource(variants, { Id: 'film' }, 'https://client.example.test/web/', true, surface))
            .toBe('https://client.example.test/web/clips/film-1080.mp4');
    });
    it('uses the other configured encode when the preferred variant is absent or invalid', () => {
        const base = 'https://client.example.test/';
        expect(previewSource({ film: { full: '/full.mp4' } }, { Id: 'film' }, base, true, 'card')).toBe(base + 'full.mp4');
        expect(previewSource({ film: { compact: '/small.mp4' } }, { Id: 'film' }, base)).toBe(base + 'small.mp4');
        expect(previewSource({ film: { full: '/stream.m3u8', compact: '/small.mp4' } }, { Id: 'film' }, base)).toBe(base + 'small.mp4');
        expect(previewSource({ film: { compact: 'file:///private.mp4', full: '/full.mp4' } }, { Id: 'film' }, base, true, 'card')).toBe(base + 'full.mp4');
        expect(previewSource({ film: {} }, { Id: 'film' }, base)).toBeUndefined();
    });
    it('preserves series variant selection without borrowing a series scene for episodes', () => {
        const sources = { series: variants.film };
        const item = { Id: 'episode', SeriesId: 'series' };
        expect(previewSource(sources, item, 'https://client.example.test/', true, 'card')).toContain('film-480.mp4');
        expect(previewSource(sources, item, 'https://client.example.test/', false, 'episode')).toBeUndefined();
    });
    it('resolves configured clips relative to the installation root', () => {
        expect(previewSource({ film: './client-previews/clip.mp4' }, { Id: 'film' }, 'https://client.example.test/web/'))
            .toBe('https://client.example.test/web/client-previews/clip.mp4');
    });
    it('uses a series clip only when that surface allows a series fallback', () => {
        const sources = { series: '/clips/series.mp4', episode: '/clips/episode.webm' };
        expect(previewSource(sources, { Id: 'other', SeriesId: 'series' }, 'https://client.example.test/')).toContain('/clips/series.mp4');
        expect(previewSource(sources, { Id: 'other', SeriesId: 'series' }, 'https://client.example.test/', false)).toBeUndefined();
        expect(previewSource(sources, { Id: 'episode', SeriesId: 'series' }, 'https://client.example.test/', false)).toContain('/clips/episode.webm');
    });
    it('does not manufacture a stream URL for an unconfigured item', () => {
        expect(previewSource({}, { Id: 'film' }, 'https://client.example.test/')).toBeUndefined();
    });
    it('rejects scripts, local files, manifests and full-stream endpoint paths', () => {
        // eslint-disable-next-line sonarjs/code-eval -- These malicious input strings must be rejected, never executed.
        for (const source of ['javascript:alert(1)', 'file:///private.mp4', 'data:video/mp4,abc', '/Videos/film/master.m3u8', '/Videos/film/stream']) {
            expect(previewSource({ film: source }, { Id: 'film' }, 'https://client.example.test/')).toBeUndefined();
        }
    });
});
