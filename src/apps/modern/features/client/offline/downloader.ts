/* eslint-disable compat/compat -- Offline mode requires modern storage/stream APIs; capability checks and the UI explain unsupported browsers. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

import { offlineIdentity } from './identity';

import { accountKey, decideSync, entryKey, estimateBytes, nextToDownload, storageRoom, PRESETS, type OfflineEntry, type Quality } from './model';
import { forgetEntry, keepDownloads, loadEntries, openWriter, readSmallFile, removeSmallFiles, removeVideo, saveEntry, saveSmallFile, deviceSpace, StorageFullError } from './storage';

/** The signed-in account the queue works for; downloads only run while the app is open. */
export type OfflineContext = {
    serverId: string;
    userId: string;
    userName: string;
    basePath: string;
    token: string;
    deviceId: string;
    canDownload: boolean;
    canTranscode: boolean;
};

export type DownloadRequest = {
    item: BaseItemDto;
    quality: Quality;
    mediaSourceId: string;
    audioIndex?: number;
    subtitleIndex?: number;
    subtitleLabel?: string;
    burnSubtitle?: boolean;
    sourceSize?: number;
    videoCodec?: string;
    audioCodec?: string;
};

const FLUSH_BYTES = 4 * 1024 * 1024;
const RETRIES = 4;

export const videoPath = (entry: Pick<OfflineEntry, 'account' | 'itemId'>) => ['downloads', entry.account.replace(/:/g, '-'), entry.itemId, 'video.mp4'];
export const posterName = (entry: Pick<OfflineEntry, 'key'>) => `${entry.key}:poster`;
export const subtitleName = (entry: Pick<OfflineEntry, 'key'>) => `${entry.key}:subtitle`;
export const backdropName = (entry: Pick<OfflineEntry, 'key'>) => `${entry.key}:backdrop`;

class HttpError extends Error {
    constructor(readonly status: number) {
        super(`HTTP ${status}`);
    }
}

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
        window.clearTimeout(timer);
        reject(signal.reason);
    }, { once: true });
});

type Active = { key: string; controller: AbortController; reason?: 'pause' | 'cancel'; done: Promise<void> };

export class Downloader {
    private entries = new Map<string, OfflineEntry>();
    private listeners = new Set<() => void>();
    private snapshot: OfflineEntry[] = [];
    private context?: OfflineContext;
    private active?: Active;
    private ready?: Promise<void>;
    private syncing = false;
    private configurationVersion = 0;

    get account() {
        return this.context ? accountKey(this.context.serverId, this.context.userId) : undefined;
    }

    load() {
        this.ready ||= loadEntries().then(list => {
            for (const entry of list) {
                // A download interrupted by a reload simply waits its turn again.
                this.entries.set(entry.key, entry.state === 'downloading' ? { ...entry, state: 'queued' } : entry);
            }
            this.publish();
        });
        return this.ready;
    }

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    list = () => this.snapshot;

    private publish() {
        this.snapshot = [...this.entries.values()].sort((a, b) => a.createdAt - b.createdAt);
        this.listeners.forEach(listener => {
            listener();
        });
    }

    private async update(key: string, change: Partial<OfflineEntry>, persist = true) {
        const current = this.entries.get(key);
        if (!current) return undefined;
        const next = { ...current, ...change };
        this.entries.set(key, next);
        this.publish();
        if (persist) await saveEntry(next);
        return next;
    }

    async configure(context: OfflineContext | undefined) {
        const version = ++this.configurationVersion;
        await this.load();
        if (version !== this.configurationVersion) return;
        const changed = this.account !== (context ? accountKey(context.serverId, context.userId) : undefined);
        if (changed) {
            // Disable pumping before awaiting the old transfer, otherwise its finally block can restart it.
            this.context = undefined;
            if (this.active) {
                await this.update(this.active.key, { state: 'paused' });
                await this.stop('pause');
            }
        }
        if (version !== this.configurationVersion) return;
        this.context = context;
        if (context && !context.canDownload) {
            for (const entry of this.snapshot) {
                if (entry.account === this.account && entry.state !== 'done') await this.update(entry.key, { state: 'error', error: 'Ce compte n’a plus le droit de télécharger.' });
            }
        }
        this.pump();
    }

    async enqueue(requests: DownloadRequest[]) {
        await this.load();
        const context = this.context;
        if (!context?.canDownload) throw new Error('Téléchargement non autorisé pour ce compte.');
        const account = accountKey(context.serverId, context.userId);
        keepDownloads().catch(() => undefined);
        const space = await deviceSpace();
        const reserved = this.snapshot.filter(entry => entry.account === account && entry.state !== 'done')
            .reduce((sum, entry) => sum + Math.max(0, entry.estimatedBytes - entry.bytes), 0);
        const needed = requests.filter(request => !this.entries.has(entryKey(account, request.item.Id || '')))
            .reduce((sum, request) => sum + estimateBytes(request.quality, request.item.RunTimeTicks || 0, request.sourceSize), 0);
        if (space.quota && !storageRoom(space, reserved + needed).fits) throw new Error('Pas assez d’espace pour cette sélection et la file en attente. Choisissez une qualité plus légère.');
        if (this.context !== context) throw new Error('Le compte actif a changé. Rouvrez la fiche.');
        let added = 0;
        for (const request of requests) {
            const { item } = request;
            if (!item.Id || (request.quality !== 'original' && !context.canTranscode) || item.CanDownload === false) continue;
            const key = entryKey(account, item.Id);
            const existing = this.entries.get(key);
            if (existing && existing.state !== 'error') continue;
            if (existing) await this.discard(existing);
            const runTimeTicks = item.RunTimeTicks || 0;
            const entry: OfflineEntry = {
                key, account, serverId: context.serverId, userId: context.userId, itemId: item.Id,
                type: item.Type === 'Episode' ? 'Episode' : 'Movie', name: item.Name || '',
                seriesId: item.SeriesId || undefined, seriesName: item.SeriesName || undefined,
                seasonNumber: item.ParentIndexNumber ?? undefined, episodeNumber: item.IndexNumber ?? undefined, year: item.ProductionYear ?? undefined,
                quality: request.quality, mediaSourceId: request.mediaSourceId, videoCodec: request.videoCodec, audioCodec: request.audioCodec, audioIndex: request.audioIndex,
                subtitleIndex: request.subtitleIndex, subtitleLabel: request.subtitleLabel, burnSubtitle: request.burnSubtitle,
                runTimeTicks, estimatedBytes: estimateBytes(request.quality, runTimeTicks, request.sourceSize), bytes: 0, segmentsDone: 0, segmentsTotal: 0,
                state: 'queued', hasPoster: false, hasSubtitles: false, createdAt: Date.now() + added,
                position: { ticks: item.UserData?.PlaybackPositionTicks || 0, played: !!item.UserData?.Played, updatedAt: 0, syncedAt: 0 },
                overview: item.Overview || undefined, officialRating: item.OfficialRating || undefined
            };
            this.entries.set(key, entry);
            await saveEntry(entry);
            added++;
        }
        this.publish();
        this.pump();
        return added;
    }

    async pause(key: string) {
        if (this.entries.get(key)?.account !== (this.account || offlineIdentity()?.account)) return;
        // Marked first, so that the queue does not pick it up again while it stops.
        await this.update(key, { state: 'paused' });
        if (this.active?.key === key) await this.stop('pause');
        this.pump();
    }

    async resume(key: string) {
        const entry = this.entries.get(key);
        if (!entry || entry.account !== (this.account || offlineIdentity()?.account) || entry.state === 'done') return;
        await this.update(key, { state: 'queued', error: undefined, createdAt: entry.state === 'error' ? Date.now() : entry.createdAt });
        this.pump();
    }

    /** Removes a download, finished or not, with everything kept for it. */
    async remove(key: string) {
        const entry = this.entries.get(key);
        if (!entry || entry.account !== (this.account || offlineIdentity()?.account)) return;
        this.entries.delete(key);
        this.publish();
        if (this.active?.key === key) await this.stop('cancel');
        await this.discard(entry);
        this.pump();
    }

    async removeAccount(account: string) {
        for (const entry of this.snapshot.filter(item => item.account === account)) await this.remove(entry.key);
    }

    private async discard(entry: OfflineEntry) {
        await removeVideo(videoPath(entry)).catch(() => undefined);
        await removeSmallFiles(`${entry.key}:`).catch(() => undefined);
        await forgetEntry(entry.key);
    }

    private async stop(reason: 'pause' | 'cancel') {
        const active = this.active;
        if (!active) return;
        active.reason = reason;
        active.controller.abort(new DOMException(reason, 'AbortError'));
        await active.done.catch(() => undefined);
    }

    pump() {
        if (this.active || !this.context?.canDownload || !navigator.onLine) return;
        const next = nextToDownload(this.snapshot, accountKey(this.context.serverId, this.context.userId));
        if (!next) return;
        const controller = new AbortController();
        const active: Active = { key: next.key, controller, done: Promise.resolve() };
        this.active = active;
        active.done = this.run(next, this.context, active).finally(() => {
            if (this.active === active) this.active = undefined;
            this.pump();
        });
    }

    private headers(context: OfflineContext, extra: Record<string, string> = {}) {
        return { Authorization: `MediaBrowser Token="${context.token}"`, ...extra };
    }

    private async fetchOk(context: OfflineContext, url: string, signal: AbortSignal, extra?: Record<string, string>) {
        let attempt = 0;
        for (;;) {
            try {
                const response = await fetch(url, { headers: this.headers(context, extra), signal, cache: 'no-store' });
                if (response.ok || response.status === 206 || response.status === 416) return response;
                if (response.status < 500 || attempt >= RETRIES) throw new HttpError(response.status);
            } catch (error) {
                if (signal.aborted || error instanceof HttpError || attempt >= RETRIES || !navigator.onLine) throw error;
            }
            attempt++;
            await wait(1000 * 2 ** attempt, signal);
        }
    }

    private async run(entry: OfflineEntry, context: OfflineContext, active: Active) {
        const { signal } = active.controller;
        await this.update(entry.key, { state: 'downloading', error: undefined });
        try {
            if (entry.quality === 'original') await this.downloadOriginal(entry, context, signal);
            else await this.downloadConverted(entry, context, signal);
            await this.downloadExtras(entry, context, signal);
            const current = this.entries.get(entry.key);
            await this.update(entry.key, { state: 'done', completedAt: Date.now(), estimatedBytes: current?.bytes || entry.estimatedBytes });
        } catch (error) {
            if (active.reason === 'cancel') return;
            if (active.reason === 'pause') return;
            let message = 'Le téléchargement a été interrompu. Il reprendra automatiquement.';
            let state: OfflineEntry['state'] = navigator.onLine ? 'error' : 'queued';
            if (error instanceof StorageFullError) {
                message = 'Plus assez d’espace sur cet appareil.';
                state = 'error';
            } else if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
                message = 'Le serveur refuse ce téléchargement pour ce compte.';
                state = 'error';
            } else if (error instanceof HttpError) {
                message = 'Le serveur n’a pas pu préparer ce fichier.';
            }
            await this.update(entry.key, { state, error: message });
        }
    }

    // eslint-disable-next-line sonarjs/cognitive-complexity -- Recovery and persistence must follow this transfer in the same transaction order.
    private async downloadOriginal(entry: OfflineEntry, context: OfflineContext, signal: AbortSignal) {
        const writer = await openWriter(videoPath(entry));
        try {
            let size = await writer.size();
            if (size !== entry.bytes) {
                await writer.truncate(Math.min(size, entry.bytes));
                size = Math.min(size, entry.bytes);
            }
            const url = `${context.basePath}/Items/${entry.itemId}/Download`;
            const response = await this.fetchOk(context, url, signal, size > 0 ? { Range: `bytes=${size}-` } : {});
            if (response.status === 416) {
                const total = Number(response.headers.get('Content-Range')?.split('/')[1]);
                if (total > 0 && size === total) return;
                throw new HttpError(416);
            }
            if (response.status === 200 && size > 0) {
                // The server ignored the range: start again from the beginning.
                await writer.truncate(0);
                size = 0;
            }
            const total = Number(response.headers.get('Content-Range')?.split('/')[1]) || (Number(response.headers.get('Content-Length')) || 0) + size;
            if (total) await this.update(entry.key, { estimatedBytes: total, bytes: size });
            const reader = response.body!.getReader();
            let parts: Uint8Array[] = [];
            let buffered = 0;
            const flush = async () => {
                if (!buffered) return;
                const data = new Uint8Array(buffered);
                let offset = 0;
                for (const part of parts) {
                    data.set(part, offset);
                    offset += part.byteLength;
                }
                parts = [];
                buffered = 0;
                size = await writer.append(data.buffer);
                await this.update(entry.key, { bytes: size });
            };
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                parts.push(value);
                buffered += value.byteLength;
                if (buffered >= FLUSH_BYTES) await flush();
            }
            await flush();
            if (total && size < total) throw new Error('incomplete');
        } finally {
            await writer.close();
        }
    }

    /** Never forward the account credential to a URL supplied outside this server. */
    private localMediaUrl(path: string, base: string, context: OfflineContext) {
        const url = new URL(path, base);
        const server = new URL(context.basePath);
        if (url.origin !== server.origin || !url.pathname.startsWith(`${server.pathname.replace(/\/$/, '')}/Videos/`)) throw new HttpError(400);
        return url.toString();
    }

    private conversionQuery(entry: OfflineEntry, context: OfflineContext, playSessionId: string) {
        const preset = PRESETS[entry.quality as Exclude<Quality, 'original'>];
        const query = new URLSearchParams({
            MediaSourceId: entry.mediaSourceId, DeviceId: context.deviceId, PlaySessionId: playSessionId,
            VideoCodec: 'h264', AudioCodec: 'aac', SegmentContainer: 'mp4', TranscodingMaxAudioChannels: '2',
            MaxWidth: String(preset.maxWidth), VideoBitrate: String(preset.videoBitrate), AudioBitrate: '192000',
            MaxStreamingBitrate: String(preset.videoBitrate + 192000), BreakOnNonKeyFrames: 'false', RequireAvc: 'false'
        });
        if (entry.audioIndex != null) query.set('AudioStreamIndex', String(entry.audioIndex));
        if (entry.burnSubtitle && entry.subtitleIndex != null && entry.subtitleIndex >= 0) {
            query.set('SubtitleStreamIndex', String(entry.subtitleIndex));
            query.set('SubtitleMethod', 'Encode');
        }
        return query;
    }

    /** A converted copy is fetched segment by segment, so that a pause or a reload loses at most one segment. */
    private async downloadConverted(entry: OfflineEntry, context: OfflineContext, signal: AbortSignal) {
        const playSessionId = randomId();
        const base = `${context.basePath}/Videos/${entry.itemId}/`;
        const master = await (await this.fetchOk(context, `${base}master.m3u8?${this.conversionQuery(entry, context, playSessionId)}`, signal)).text();
        const variant = master.split('\n').map(line => line.trim()).find(line => line && !line.startsWith('#'));
        if (!variant) throw new HttpError(500);
        const playlistUrl = this.localMediaUrl(variant, base, context);
        const playlist = await (await this.fetchOk(context, playlistUrl, signal)).text();
        const init = /#EXT-X-MAP:URI="([^"]+)"/.exec(playlist)?.[1];
        const segments = playlist.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
        if (!init || !segments.length) throw new HttpError(500);
        const writer = await openWriter(videoPath(entry));
        try {
            const current = this.entries.get(entry.key) || entry;
            let done = current.segmentsDone;
            if (done === 0) {
                await writer.truncate(0);
                const initData = await (await this.fetchOk(context, this.localMediaUrl(init, playlistUrl, context), signal)).arrayBuffer();
                await writer.append(initData);
            } else {
                await writer.truncate(current.bytes);
            }
            await this.update(entry.key, { segmentsTotal: segments.length });
            for (; done < segments.length; done++) {
                const data = await (await this.fetchOk(context, this.localMediaUrl(segments[done], playlistUrl, context), signal)).arrayBuffer();
                const size = await writer.append(data);
                // Size and progress are saved together, so that a resume always starts on a whole segment.
                await this.update(entry.key, { bytes: size, segmentsDone: done + 1 });
            }
        } finally {
            await writer.close();
            const query = new URLSearchParams({ DeviceId: context.deviceId, PlaySessionId: playSessionId });
            fetch(`${context.basePath}/Videos/ActiveEncodings?${query}`, { method: 'DELETE', headers: this.headers(context), keepalive: true }).catch(() => undefined);
        }
    }

    // eslint-disable-next-line sonarjs/cognitive-complexity -- Recovery and persistence must follow this transfer in the same transaction order.
    private async downloadExtras(entry: OfflineEntry, context: OfflineContext, signal: AbortSignal) {
        const images: [string, string][] = [
            [posterName(entry), `${context.basePath}/Items/${entry.seriesId || entry.itemId}/Images/Primary?fillHeight=480&quality=85`],
            [backdropName(entry), `${context.basePath}/Items/${entry.itemId}/Images/${entry.type === 'Episode' ? 'Primary' : 'Backdrop'}?fillWidth=1280&quality=80`]
        ];
        let hasPoster = false;
        for (const [name, url] of images) {
            try {
                const response = await fetch(url, { headers: this.headers(context), signal });
                if (response.ok) {
                    await saveSmallFile(name, await response.blob());
                    if (name === posterName(entry)) hasPoster = true;
                }
            } catch (error) {
                if (signal.aborted) throw error;
            }
        }
        let hasSubtitles = false;
        if (!entry.burnSubtitle && entry.subtitleIndex != null && entry.subtitleIndex >= 0) {
            // The player draws subtitles from timed text events; the server converts any text format into them.
            const url = `${context.basePath}/Videos/${entry.itemId}/${entry.mediaSourceId}/Subtitles/${entry.subtitleIndex}/0/Stream.js`;
            const response = await this.fetchOk(context, url, signal);
            if (response.ok) {
                await saveSmallFile(subtitleName(entry), new Blob([await response.text()], { type: 'application/json' }));
                hasSubtitles = true;
            }
        }
        await this.update(entry.key, { hasPoster, hasSubtitles });
    }

    /** Called by the player: the position is only kept on the device until the server is reachable. */
    async savePosition(key: string, position: OfflineEntry['position']) {
        await this.load();
        if (this.entries.get(key)?.account !== (this.account || offlineIdentity()?.account)) return;
        await this.update(key, { position });
    }

    /**
     * Sends positions watched offline, and takes the server's own when it is newer,
     * so that a reconnection never takes a viewer back in a film already continued elsewhere.
     */
    // eslint-disable-next-line sonarjs/cognitive-complexity -- Recovery and persistence must follow this transfer in the same transaction order.
    async syncPositions() {
        const context = this.context;
        if (!context || this.syncing || !navigator.onLine) return;
        const account = accountKey(context.serverId, context.userId);
        const done = this.snapshot.filter(entry => entry.account === account && entry.state === 'done');
        if (!done.length) return;
        this.syncing = true;
        try {
            const ids = done.map(entry => entry.itemId).join(',');
            const response = await fetch(`${context.basePath}/Users/${context.userId}/Items?Ids=${ids}&Fields=UserData&EnableImages=false`, { headers: this.headers(context) });
            if (!response.ok) return;
            const items: BaseItemDto[] = (await response.json()).Items || [];
            for (const entry of done) {
                if (this.context !== context) return;
                const found = items.find(item => item.Id?.replace(/-/g, '').toLowerCase() === entry.itemId.replace(/-/g, '').toLowerCase());
                if (!found?.UserData) continue;
                const server = found.UserData;
                const decision = decideSync(entry.position, server);
                const now = Date.now();
                if (decision === 'push') {
                    const pushed = await fetch(`${context.basePath}/UserItems/${entry.itemId}/UserData?userId=${context.userId}`, {
                        method: 'POST', headers: this.headers(context, { 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ ...server, PlaybackPositionTicks: entry.position.ticks, Played: entry.position.played, LastPlayedDate: new Date(entry.position.updatedAt).toISOString() })
                    });
                    if (pushed.ok && this.entries.get(entry.key)?.position.updatedAt === entry.position.updatedAt) await this.update(entry.key, { position: { ...entry.position, syncedAt: now } });
                } else if (decision === 'pull' || entry.position.updatedAt <= entry.position.syncedAt) {
                    const ticks = server.PlaybackPositionTicks || 0;
                    if (ticks !== entry.position.ticks || !!server.Played !== entry.position.played || decision === 'pull') {
                        await this.update(entry.key, { position: { ticks, played: !!server.Played, updatedAt: now, syncedAt: now } });
                    }
                }
            }
        } catch { /* Tried again at the next reconnection. */ } finally {
            this.syncing = false;
        }
    }
}

export const downloader = new Downloader();

export { readSmallFile };

/* eslint-enable compat/compat */
