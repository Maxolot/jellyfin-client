import { describe, expect, it } from 'vitest';

import { previewSource } from './previewSource';

describe('optional short-clip sources', () => {
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
