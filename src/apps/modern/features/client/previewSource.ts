import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

import type { ClientPreviewSources } from 'types/webConfig';

export type PreviewSurface = 'hero' | 'detail' | 'card' | 'episode' | 'spotlight';

function clipUrl(source: string | undefined, base: string) {
    if (typeof source !== 'string' || !source.trim()) return undefined;
    try {
        const url = new URL(source, base);
        if (['http:', 'https:'].includes(url.protocol) && /\.(mp4|webm)$/i.test(url.pathname)) return url.href;
    } catch { /* Invalid configuration retains artwork or the other configured encode. */ }
    return undefined;
}

/** Public runtime configuration supplies clips; library media is never fetched as a preview. */
export function previewSource(sources: ClientPreviewSources, item: BaseItemDto, base: string, seriesFallback = true, surface: PreviewSurface = 'detail') {
    let source = item.Id ? sources[item.Id] : undefined;
    if (!source && seriesFallback && item.SeriesId) source = sources[item.SeriesId];
    if (!source) return undefined;
    const compact = surface === 'card' || surface === 'episode';
    let candidates: (string | undefined)[];
    if (typeof source === 'string') candidates = [source];
    else candidates = compact ? [source.compact, source.full] : [source.full, source.compact];
    for (const candidate of candidates) {
        const url = clipUrl(candidate, base);
        if (url) return url;
    }
    return undefined;
}
