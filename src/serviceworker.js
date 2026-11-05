/* eslint-disable no-restricted-globals, compat/compat -- Service-worker-only scope, registered after a capability check. */
function getApiClient(serverId) {
    return Promise.resolve(window.connectionManager.getApiClient(serverId));
}

function executeAction(action, data, serverId) {
    return getApiClient(serverId).then(function (apiClient) {
        switch (action) {
            case 'cancel-install':
                return apiClient.cancelPackageInstallation(data.id);
            case 'restart':
                return apiClient.restartServer();
            default:
                clients.openWindow('/');
                return Promise.resolve();
        }
    });
}

self.addEventListener('notificationclick', function (event) {
    const notification = event.notification;
    notification.close();

    const data = notification.data;
    const serverId = data.serverId;
    const action = event.action;

    if (!action) {
        clients.openWindow('/');
        event.waitUntil(Promise.resolve());
        return;
    }

    event.waitUntil(executeAction(action, data, serverId));
}, false);

self.addEventListener('activate', () => self.clients.claim());

// Explicitly prepared public application files only. Media lives separately in OPFS/IndexedDB.
// No API, cross-origin response, authorization header or runtime config ever enters this cache.
const offlineScope = new URL(self.registration.scope);
const shellPrefix = `client-offline-shell-${encodeURIComponent(offlineScope.pathname)}-`;
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== offlineScope.origin
        || !url.pathname.startsWith(offlineScope.pathname) || request.headers.has('Authorization')) return;
    event.respondWith((async () => {
        try {
            return await fetch(request);
        } catch (error) {
            const names = (await caches.keys()).filter(name => name.startsWith(shellPrefix)).reverse();
            const match = new URL(request.url);
            match.search = '';
            // HtmlWebpack encodes scoped package names (%40), while the asset manifest uses @.
            match.pathname = decodeURIComponent(match.pathname);
            if (request.mode === 'navigate' && (match.pathname === offlineScope.pathname || match.pathname === `${offlineScope.pathname}index.html`)) {
                match.pathname = `${offlineScope.pathname}index.html`;
            }
            for (const name of names) {
                const cache = await caches.open(name);
                if (!await cache.match(new URL('offline-ready', offlineScope).toString())) continue;
                const response = await cache.match(match.toString());
                if (response) return response;
            }
            throw error;
        }
    })());
});

/* eslint-enable no-restricted-globals, compat/compat */
