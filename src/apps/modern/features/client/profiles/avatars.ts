export type GalleryAvatar = { id: string; name: string; collection: string; url: string };

const FILE = /^[\w-]+\.(?:webp|png|jpe?g)$/i;
const MAX_BYTES = 5 * 1024 * 1024;

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/** Reads a self-hosted gallery; anything malformed or pointing elsewhere is left out. */
export function parseGallery(input: unknown, manifest: string): GalleryAvatar[] {
    if (!Array.isArray(input)) return [];
    const avatars: GalleryAvatar[] = [];
    const seen = new Set<string>();
    for (const entry of input) {
        const record = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
        const file = text(record.file);
        const id = text(record.id) || file;
        if (!FILE.test(file) || seen.has(id)) continue;
        seen.add(id);
        avatars.push({ id, name: text(record.name) || 'Sans nom', collection: text(record.collection) || 'Autres', url: new URL(file, manifest).href });
    }
    return avatars;
}

const folded = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Collections in gallery order, narrowed by a search on names and collections, accents ignored. */
export function groupGallery(avatars: GalleryAvatar[], search: string) {
    const words = folded(search).split(/\s+/).filter(Boolean);
    const groups = new Map<string, GalleryAvatar[]>();
    for (const avatar of avatars) {
        const haystack = folded(`${avatar.name} ${avatar.collection}`);
        if (!words.every(word => haystack.includes(word))) continue;
        groups.set(avatar.collection, [...groups.get(avatar.collection) || [], avatar]);
    }
    return [...groups.entries()].map(([collection, items]) => ({ collection, items }));
}

function toBase64(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Image illisible'));
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.readAsDataURL(blob);
    });
}

/** Saves the picture on the Jellyfin account itself, so that it follows the person on every device. */
export async function saveAvatar(basePath: string, userId: string, token: string, avatar: GalleryAvatar) {
    const image = await fetch(avatar.url);
    if (!image.ok) throw new Error('Image indisponible');
    const blob = await image.blob();
    if (blob.size > MAX_BYTES) throw new Error('Image trop lourde');
    const saved = await fetch(`${basePath}/Users/${userId}/Images/Primary`, { method: 'POST',
        headers: { Authorization: `MediaBrowser Token="${token}"`, 'Content-Type': blob.type || 'image/webp' }, body: await toBase64(blob) });
    if (!saved.ok) throw new Error(String(saved.status));
    const account = await fetch(`${basePath}/Users/Me`, { headers: { Authorization: `MediaBrowser Token="${token}"` } });
    return account.ok ? (await account.json() as { PrimaryImageTag?: string }).PrimaryImageTag : undefined;
}
