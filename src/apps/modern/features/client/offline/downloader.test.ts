import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Downloader, type OfflineContext } from './downloader';
import type { OfflineEntry } from './model';
import { openWriter } from './storage';

const storage = vi.hoisted(() => ({ entries: new Map<string, OfflineEntry>(), writes: [] as OfflineEntry[] }));
vi.mock('./storage', () => ({
    loadEntries: async () => [...storage.entries.values()].map(entry => JSON.parse(JSON.stringify(entry)) as OfflineEntry),
    saveEntry: async (entry: OfflineEntry) => {
        storage.entries.set(entry.key, JSON.parse(JSON.stringify(entry)) as OfflineEntry);
        storage.writes.push(JSON.parse(JSON.stringify(entry)) as OfflineEntry);
    },
    forgetEntry: async (key: string) => { storage.entries.delete(key); },
    removeVideo: async () => undefined, removeSmallFiles: async () => undefined,
    keepDownloads: async () => true, deviceSpace: async () => ({ quota: 10000000, usage: 0 }),
    openWriter: vi.fn(), readSmallFile: vi.fn(), saveSmallFile: vi.fn(), StorageFullError: class extends Error {}
}));
vi.mock('./identity', () => ({ offlineIdentity: () => undefined }));

const context: OfflineContext = { serverId: 'server', userId: 'user', userName: 'Compte', basePath: 'https://example.invalid', token: 'fixture', deviceId: 'test', canDownload: true, canTranscode: true };
const entry = (fields: Partial<OfflineEntry> = {}): OfflineEntry => ({
    key: 'server:user:film', account: 'server:user', serverId: 'server', userId: 'user', itemId: 'film', name: 'Film synthétique', type: 'Movie', quality: 'original', mediaSourceId: 'source', runTimeTicks: 600000000,
    estimatedBytes: 100, bytes: 100, segmentsDone: 0, segmentsTotal: 0, state: 'done', hasPoster: false, hasSubtitles: false, createdAt: 1,
    position: { ticks: 200000000, played: false, updatedAt: 1000, syncedAt: 0 }, ...fields
});

beforeEach(() => {
    storage.entries.clear();
    storage.writes.length = 0;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    vi.restoreAllMocks();
});

describe('persistent download queue and account isolation', () => {
    it('recovers an interrupted download after a new instance is loaded', async () => {
        storage.entries.set('server:user:film', entry({ state: 'downloading', bytes: 50 }));
        const queue = new Downloader();
        await queue.configure(context);
        expect(queue.list()[0]).toMatchObject({ state: 'queued', bytes: 50 });
        await queue.pause('server:user:film');
        const reloaded = new Downloader();
        await reloaded.configure(context);
        expect(reloaded.list()[0].state).toBe('paused');
        await reloaded.resume('server:user:film');
        expect(reloaded.list()[0].state).toBe('queued');
    });
    it('does not let another account remove, resume or change the position of a local file', async () => {
        storage.entries.set('server:user:film', entry({ state: 'paused' }));
        const queue = new Downloader();
        await queue.configure({ ...context, userId: 'other' });
        await queue.remove('server:user:film');
        await queue.resume('server:user:film');
        await queue.savePosition('server:user:film', { ticks: 9, played: true, updatedAt: 9, syncedAt: 0 });
        expect(storage.entries.get('server:user:film')).toMatchObject({ state: 'paused', position: { ticks: 200000000 } });
    });
    it('stops the old account before a transfer finalizer can restart it', async () => {
        const queue = new Downloader();
        await queue.configure(context);
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        vi.mocked(openWriter).mockResolvedValue({ size: async () => 0, truncate: async () => undefined, append: async () => 0, close: async () => undefined });
        const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new DOMException('paused', 'AbortError')), { once: true });
        }));
        await queue.enqueue([{ item: { Id: 'film', Type: 'Movie' }, quality: 'original', mediaSourceId: 'source' }]);
        await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
        await queue.configure({ ...context, userId: 'other' });
        await Promise.resolve();
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(queue.list()[0].state).toBe('paused');
        expect(queue.account).toBe('server:other');
    });
    it('rejects new downloads when the server policy disallows them', async () => {
        const queue = new Downloader();
        await queue.configure({ ...context, canDownload: false });
        await expect(queue.enqueue([{ item: { Id: 'film', Type: 'Movie' }, quality: 'original', mediaSourceId: 'source' }])).rejects.toThrow('non autorisé');
    });
    it('does not duplicate titles already queued for the active account', async () => {
        storage.entries.set('server:user:film', entry({ state: 'paused' }));
        const queue = new Downloader();
        await queue.configure(context);
        expect(await queue.enqueue([{ item: { Id: 'film', Type: 'Movie' }, quality: 'original', mediaSourceId: 'source' }])).toBe(0);
        expect(queue.list()).toHaveLength(1);
    });
});

describe('reconnection without losing other user data', () => {
    it('pushes the offline position while preserving favourite and rating fields', async () => {
        storage.entries.set('server:user:film', entry());
        const queue = new Downloader();
        await queue.configure(context);
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        const fetcher = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(JSON.stringify({ Items: [{ Id: 'film', UserData: { IsFavorite: true, Rating: 8, Played: false, PlaybackPositionTicks: 0 } }] })))
            .mockResolvedValueOnce(new Response('{}'));
        await queue.syncPositions();
        const body = JSON.parse(fetcher.mock.calls[1][1]?.body as string);
        expect(body).toMatchObject({ IsFavorite: true, Rating: 8, PlaybackPositionTicks: 200000000, Played: false });
        expect(queue.list()[0].position.syncedAt).toBeGreaterThan(0);
    });
    it('keeps a newer server position instead of overwriting it', async () => {
        storage.entries.set('server:user:film', entry());
        const queue = new Downloader();
        await queue.configure(context);
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ Items: [{ Id: 'film', UserData: { PlaybackPositionTicks: 400000000, Played: false, LastPlayedDate: new Date(2000).toISOString() } }] })));
        await queue.syncPositions();
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(queue.list()[0].position.ticks).toBe(400000000);
    });
    it('does not send a position for an item the account can no longer access', async () => {
        storage.entries.set('server:user:film', entry());
        const queue = new Downloader();
        await queue.configure(context);
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ Items: [] })));
        await queue.syncPositions();
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(queue.list()[0].position.syncedAt).toBe(0);
    });
});
