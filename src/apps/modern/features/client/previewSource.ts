import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

/** Public runtime configuration supplies clips; library media is never fetched as a preview. */
export function previewSource(sources: Record<string, string>, item: BaseItemDto, base: string, seriesFallback = true) {
    let source = item.Id ? sources[item.Id] : undefined;
    if (!source && seriesFallback && item.SeriesId) source = sources[item.SeriesId];
    if (!source) return undefined;
    try {
        const url = new URL(source, base);
        if (!['http:', 'https:'].includes(url.protocol) || !/\.(mp4|webm)$/i.test(url.pathname)) return undefined;
        return url.href;
    } catch { return undefined; }
}
