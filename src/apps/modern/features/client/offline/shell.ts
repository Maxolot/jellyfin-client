/* eslint-disable compat/compat -- Offline mode requires modern storage/stream APIs; capability checks and the UI explain unsupported browsers. */
declare const __OFFLINE_BUILD__: string;

/** Public assets are prepared explicitly before a first download, never authenticated API responses. */
const scope = new URL('.', window.location.href);
const prefix = `client-offline-shell-${encodeURIComponent(scope.pathname)}-`;
const build = typeof __OFFLINE_BUILD__ === 'undefined' ? 'unbuilt' : __OFFLINE_BUILD__;
const cacheName = `${prefix}${build}`;
let preparing: Promise<void> | undefined;

export async function shellReady() {
    if (!('caches' in window) || !navigator.serviceWorker) return false;
    const cache = await caches.open(cacheName);
    return !!await cache.match(new URL('offline-ready', scope).toString());
}

export function prepareShell(progress: (ratio: number) => void = () => undefined, force = false) {
    if (preparing) return preparing;
    preparing = (async () => {
        if (!window.isSecureContext || !navigator.serviceWorker || !('caches' in window)) {
            throw new Error('Le mode hors ligne nécessite HTTPS (ou localhost).');
        }
        if (!force && await shellReady()) {
            progress(1);
            return;
        }
        await navigator.serviceWorker.register(new URL('serviceworker.js', scope).toString());
        await navigator.serviceWorker.ready;
        const response = await fetch(new URL('offline-shell.json', scope), { cache: 'no-store' });
        if (!response.ok) throw new Error('La préparation de l’application a échoué. Réessayez en ligne.');
        const assets: string[] = await response.json();
        const cache = await caches.open(cacheName);
        const urls = assets.filter(name => !name.startsWith('/') && !name.includes('..') && name !== 'config.json').map(name => new URL(name, scope).toString());
        let completed = 0;
        const pending = urls.slice();
        const save = async () => {
            for (;;) {
                const url = pending.shift();
                if (!url) return;
                const asset = await fetch(url, { cache: 'reload', credentials: 'omit' });
                if (!asset.ok) throw new Error('Impossible de conserver tous les fichiers de l’application. Réessayez.');
                await cache.put(url, asset);
                progress(++completed / urls.length);
            }
        };
        await Promise.all([save(), save(), save(), save()]);
        await cache.put(new URL('offline-ready', scope).toString(), new Response('ready'));
        // Keep the previous revision until this one is complete.
        const old = (await caches.keys()).filter(name => name.startsWith(prefix) && name !== cacheName);
        await Promise.all(old.map(name => caches.delete(name)));
    })().finally(() => { preparing = undefined; });
    return preparing;
}

/* eslint-enable compat/compat */
