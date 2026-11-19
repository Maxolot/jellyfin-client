import type { MediaUrl } from '@jellyfin/sdk/lib/generated-client';

const youtube = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

export function youtubeTrailerId(value: string | null | undefined) {
    if (!value) return undefined;
    try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return undefined;
        let id;
        if (url.hostname === 'youtu.be') id = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1];
        if (youtube.has(url.hostname)) {
            id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts|live)\/([^/]+)\/?$/.exec(url.pathname)?.[1];
        }
        return id && /^[\w-]{11}$/.test(id) ? id : undefined;
    } catch {
        return undefined;
    }
}

export function remoteTrailer(entries: MediaUrl[] | null | undefined) {
    for (const entry of entries || []) {
        const id = youtubeTrailerId(entry.Url);
        if (id) return id;
    }
    return undefined;
}

export function trailerEmbedUrl(id: string, origin: string) {
    const params = new URLSearchParams({ autoplay: '0', controls: '0', disablekb: '1', enablejsapi: '1', fs: '0', playsinline: '1', rel: '0', origin });
    return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}
