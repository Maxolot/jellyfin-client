import type { PreviewSurface } from '../previewSource';

type Manifest = { DurationSeconds: number; ExpiresAt: string; ItemId: string; Sources: Record<string, { Url: string; Width: number; Height: number }> };
export type ResolvedPreview = { state: 'ready'; compact?: string; full?: string } | { state: 'none' | 'pending' };
const normalizeId = (id: string) => id.replace(/-/g, '').toLowerCase();
export function parsePreviewManifest(input: unknown, server: string, ids: string[], now = Date.now()): ResolvedPreview {
    if (!input || typeof input !== 'object') return { state: 'none' };
    const data = input as Partial<Manifest>;
    if (typeof data.ItemId !== 'string' || !ids.some(id => normalizeId(id) === normalizeId(data.ItemId || ''))
        || typeof data.DurationSeconds !== 'number' || !Number.isFinite(data.DurationSeconds) || data.DurationSeconds < 1 || data.DurationSeconds > 30
        || typeof data.ExpiresAt !== 'string' || !data.Sources || typeof data.Sources !== 'object') return { state: 'none' };
    const expires = Date.parse(data.ExpiresAt);
    if (!Number.isFinite(expires) || expires <= now + 1000 || expires > now + 600000) return { state: 'none' };
    const base = new URL(server.replace(/\/$/, '') + '/');
    const sources: { compact?: string; full?: string } = {};
    for (const variant of ['compact', 'full'] as const) {
        const source = data.Sources[variant];
        if (!source || typeof source.Url !== 'string' || typeof source.Width !== 'number' || typeof source.Height !== 'number'
            || !Number.isFinite(source.Width) || !Number.isFinite(source.Height) || source.Width < 2 || source.Width > 4096 || source.Height < 2 || source.Height > 1080) continue;
        try {
            const url = new URL(source.Url, base);
            const expected = base.pathname + 'NativePreviews/Media/';
            const tail = url.pathname.startsWith(expected) ? url.pathname.slice(expected.length) : '';
            const parts = tail.split('/');
            if (url.origin !== base.origin || url.username || url.password || url.hash || !['http:', 'https:'].includes(url.protocol)
                || parts.length !== 2 || normalizeId(parts[0]) !== normalizeId(data.ItemId) || parts[1] !== variant + '.mp4'
                || !url.searchParams.get('ticket') || url.searchParams.get('ApiKey') || url.searchParams.get('api_key')) continue;
            sources[variant] = url.href;
        } catch { /* Untrusted or invalid provider URLs retain artwork. */ }
    }
    return sources.compact || sources.full ? { state: 'ready', ...sources } : { state: 'none' };
}
export function compactPreview(surface: PreviewSurface, smallScreen: boolean, saveData: boolean) {
    return surface === 'card' || surface === 'episode' || smallScreen || saveData;
}
