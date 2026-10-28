import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

type ArtworkKind = 'poster' | 'backdrop' | 'hero' | 'episode' | 'logo' | 'portrait';
const widths = [320, 480, 640, 960, 1280, 1920, 2560, 3200, 3840];

function primaryIdentity(item: BaseItemDto) {
    if (!item.ImageTags?.Primary && item.ImageTags?.Thumb) return { id: item.Id, tag: item.ImageTags.Thumb, type: 'Thumb' };
    if (!item.ImageTags?.Primary && item.BackdropImageTags?.length) return { id: item.Id, tag: item.BackdropImageTags[0], type: 'Backdrop/0' };
    return { id: item.Id, tag: item.ImageTags?.Primary, type: 'Primary' };
}

function imageIdentity(item: BaseItemDto, kind: ArtworkKind) {
    if (kind === 'backdrop' || kind === 'hero') {
        return {
            id: item.BackdropImageTags?.length ? item.Id : item.ParentBackdropItemId || item.SeriesId || item.Id,
            tag: item.BackdropImageTags?.[0] || item.ParentBackdropImageTags?.[0], type: 'Backdrop/0'
        };
    }
    if (kind === 'logo') return { id: item.ImageTags?.Logo ? item.Id : item.SeriesId, tag: item.ImageTags?.Logo, type: 'Logo' };
    if (item.Type === 'Episode' && kind !== 'episode') return { id: item.SeriesId || item.Id, tag: item.SeriesPrimaryImageTag, type: 'Primary' };
    return primaryIdentity(item);
}

function artworkWidth(kind: ArtworkKind) {
    const viewport = typeof window === 'undefined' ? 1440 : window.innerWidth;
    const density = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const margin = Math.max(20, Math.min(80, viewport * 0.04));
    let columns = 6;
    if (viewport <= 1000) columns = 4;
    if (viewport <= 700) columns = 3;
    const gridPoster = (viewport - margin * 2 - 18 * (columns - 1)) / columns;
    const sizes = {
        hero: viewport, backdrop: Math.min(694, viewport - 40), episode: 340,
        logo: Math.min(580, viewport * 0.75), portrait: 118,
        poster: Math.max(gridPoster, 180, Math.min(234, viewport * 0.15))
    };
    return widths.find(value => value >= sizes[kind] * density) || 3840;
}

/** Use stable, versioned image URLs so Jellyfin and the browser can reuse artwork. */
export function artworkUrl(basePath: string, item: BaseItemDto, kind: ArtworkKind = 'poster') {
    const { id, tag, type } = imageIdentity(item, kind);
    if (!basePath || !id) return '';
    const version = tag ? '&tag=' + encodeURIComponent(tag) : '';
    return `${basePath}/Items/${id}/Images/${type}?maxWidth=${artworkWidth(kind)}&quality=85${version}`;
}

// Only the next hero / deliberate navigation intent is warmed, never the whole library.
const warmed = new Map<string, Promise<void>>();
export function preloadArtwork(source: string) {
    if (!source) return Promise.resolve();
    const existing = warmed.get(source);
    if (existing) return existing;
    const image = new Image();
    image.decoding = 'async';
    image.setAttribute('fetchpriority', 'low');
    const pending = new Promise<void>((resolve, reject) => {
        image.onload = () => {
            const decoded = typeof image.decode === 'function' ? image.decode() : Promise.resolve();
            decoded.then(resolve, reject);
        };
        image.onerror = () => reject(new Error('Artwork unavailable'));
        image.src = source;
    });
    warmed.set(source, pending);
    if (warmed.size > 32) warmed.delete(warmed.keys().next().value!);
    // A failed request must be retryable on the next visit.
    void pending.catch(() => warmed.delete(source));
    return pending;
}
