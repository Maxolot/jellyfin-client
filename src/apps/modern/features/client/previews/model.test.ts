import { describe, expect, it } from 'vitest';
import { compactPreview, parsePreviewManifest } from './model';
const id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const series = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const server = 'https://server.example.test/jellyfin';
const now = Date.now();
const source = (variant: string, item = id) => ({ Url: `/jellyfin/NativePreviews/Media/${item}/${variant}.mp4?ticket=limited`, Width: 640, Height: 360 });
const manifest = { ItemId: id, DurationSeconds: 20, ExpiresAt: new Date(now + 180000).toISOString(), Sources: { compact: source('compact'), full: source('full') } };
describe('server preview transport contract', () => {
    it('accepts only signed-clip routes on the selected server including reverse proxy base paths', () => {
        expect(parsePreviewManifest(manifest, server, [id], now)).toMatchObject({ state: 'ready', compact: server + `/NativePreviews/Media/${id}/compact.mp4?ticket=limited` });
        expect(parsePreviewManifest({ ...manifest, ItemId: series, Sources: { full: source('full', series) } }, server, [id], now)).toEqual({ state: 'none' });
        expect(parsePreviewManifest({ ...manifest, ItemId: series, Sources: { full: source('full', series) } }, server, [id, series], now).state).toBe('ready');
    });
    it.each(['https://other.example.test/clip.mp4?ticket=limited', `/jellyfin/Videos/${id}/stream.mp4?ticket=limited`, `/jellyfin/NativePreviews/Media/${series}/full.mp4?ticket=limited`, `/jellyfin/NativePreviews/Media/${id}/full.mp4`, `/jellyfin/NativePreviews/Media/${id}/full.mp4?ticket=limited&api_key=forbidden`])('rejects unsafe or mismatched URLs: %s', Url => {
        expect(parsePreviewManifest({ ...manifest, Sources: { full: { ...source('full'), Url } } }, server, [id], now)).toEqual({ state: 'none' });
    });
    it('rejects expired, excessive and malformed previews without manufacturing a full-stream fallback', () => {
        for (const input of [null, {}, { ...manifest, DurationSeconds: 600 }, { ...manifest, ExpiresAt: new Date(now - 1).toISOString() }, { ...manifest, ExpiresAt: new Date(now + 900000).toISOString() }]) {
            expect(parsePreviewManifest(input, server, [id], now)).toEqual({ state: 'none' });
        }
    });
    it('chooses compact for thumbnails, small viewports and data-saving connections', () => {
        expect(compactPreview('card', false, false)).toBe(true);
        expect(compactPreview('episode', false, false)).toBe(true);
        expect(compactPreview('hero', true, false)).toBe(true);
        expect(compactPreview('detail', false, true)).toBe(true);
        expect(compactPreview('hero', false, false)).toBe(false);
    });
});
