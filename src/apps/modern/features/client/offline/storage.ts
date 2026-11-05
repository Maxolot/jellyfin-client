/* eslint-disable compat/compat -- Offline mode requires modern storage/stream APIs; capability checks and the UI explain unsupported browsers. */
import { createStore, del, delMany, get, getMany, keys, set, values } from 'idb-keyval';

import createFileWorker from './workerFactory';
import type { OfflineEntry } from './model';

/**
 * Where downloads live on the device. Videos go to the origin private file system when the browser
 * can write it from a worker; otherwise they are kept in IndexedDB in pieces, which every browser offers.
 */
const entryStore = () => createStore('client-offline-entries', 'entries');
const fileStore = () => createStore('client-offline-files', 'files');
let entriesDb: ReturnType<typeof createStore> | undefined;
let filesDb: ReturnType<typeof createStore> | undefined;
const entriesOf = () => (entriesDb ||= entryStore());
const filesOf = () => (filesDb ||= fileStore());

export const loadEntries = () => values<OfflineEntry>(entriesOf());
export const saveEntry = (entry: OfflineEntry) => set(entry.key, entry, entriesOf());
export const forgetEntry = (key: string) => del(key, entriesOf());

/** Small files (posters, subtitles) are simply kept whole. */
export const saveSmallFile = (name: string, blob: Blob) => set(name, blob, filesOf());
export const readSmallFile = (name: string) => get<Blob>(name, filesOf());
export async function removeSmallFiles(prefix: string) {
    const names = (await keys<string>(filesOf())).filter(name => typeof name === 'string' && name.startsWith(prefix));
    if (names.length) await delMany(names, filesOf());
}

export class StorageFullError extends Error {
    constructor() {
        super('quota');
        this.name = 'StorageFullError';
    }
}

export type Writer = { size: () => Promise<number>; truncate: (size: number) => Promise<void>; append: (data: ArrayBuffer) => Promise<number>; close: () => Promise<void> };

type Reply = { id: number; size?: number; error?: string; quota?: boolean };
let worker: Worker | undefined;
let requestId = 0;
const pending = new Map<number, { resolve: (size: number) => void; reject: (error: Error) => void }>();

function call(op: string, path: string[], extra: Record<string, unknown> = {}, transfer: Transferable[] = []) {
    if (!worker) {
        worker = createFileWorker() as Worker;
        worker.onmessage = (event: MessageEvent<Reply>) => {
            const request = pending.get(event.data.id);
            pending.delete(event.data.id);
            if (!request) return;
            if (event.data.quota) request.reject(new StorageFullError());
            else if (event.data.error) request.reject(new Error(event.data.error));
            else request.resolve(event.data.size || 0);
        };
    }
    const id = ++requestId;
    return new Promise<number>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker!.postMessage({ id, op, path, ...extra }, transfer);
    });
}

let backend: Promise<'opfs' | 'idb'> | undefined;
/** Checked once: Safari before 15.2, private windows and some embedded browsers have no usable file system. */
export function storageBackend() {
    backend ||= (async () => {
        try {
            if (!window.isSecureContext || !navigator.storage?.getDirectory || typeof Worker === 'undefined') return 'idb';
            await call('probe', ['probe', `check-${Date.now()}`]);
            return 'opfs';
        } catch {
            return 'idb';
        }
    })();
    return backend;
}

function opfsWriter(path: string[]): Writer {
    let size: number | undefined;
    return {
        size: async () => (size = await call('size', path)),
        truncate: async next => {
            size = await call('truncate', path, { size: next });
        },
        append: async data => {
            const offset = size ?? await call('size', path);
            size = await call('write', path, { offset, data }, [data]);
            return size;
        },
        close: async () => {
            await call('close', path);
        }
    };
}

const CHUNK_PREFIX = 'chunk:';
const chunkName = (path: string[], index: number) => `${CHUNK_PREFIX}${path.join('/')}#${String(index).padStart(7, '0')}`;
async function chunkNames(path: string[]) {
    const prefix = `${CHUNK_PREFIX}${path.join('/')}#`;
    return (await keys<string>(filesOf())).filter(name => typeof name === 'string' && name.startsWith(prefix)).sort((a, b) => a.localeCompare(b));
}

function idbWriter(path: string[]): Writer {
    let state: { names: string[]; sizes: number[] } | undefined;
    const load = async () => {
        if (state) return state;
        const names = await chunkNames(path);
        const blobs = await getMany<Blob>(names, filesOf());
        state = { names, sizes: blobs.map(blob => blob?.size || 0) };
        return state;
    };
    const total = (sizes: number[]) => sizes.reduce((sum, value) => sum + value, 0);
    return {
        size: async () => total((await load()).sizes),
        truncate: async next => {
            const current = await load();
            let kept = 0;
            let index = 0;
            while (index < current.names.length && kept + current.sizes[index] <= next) kept += current.sizes[index++];
            const dropped = current.names.slice(index);
            if (index < current.names.length && kept < next) {
                const blob = await get<Blob>(current.names[index], filesOf());
                if (blob) await set(current.names[index], blob.slice(0, next - kept), filesOf());
                current.sizes[index] = next - kept;
                dropped.shift();
                index++;
            }
            if (dropped.length) await delMany(dropped, filesOf());
            state = { names: current.names.slice(0, index), sizes: current.sizes.slice(0, index) };
        },
        append: async data => {
            const current = await load();
            const last = current.names[current.names.length - 1];
            const index = last ? Number(last.slice(last.lastIndexOf('#') + 1)) + 1 : 0;
            const name = chunkName(path, index);
            try {
                await set(name, new Blob([data]), filesOf());
            } catch (error) {
                if (error instanceof DOMException && error.name === 'QuotaExceededError') throw new StorageFullError();
                throw error;
            }
            current.names.push(name);
            current.sizes.push(data.byteLength);
            return total(current.sizes);
        },
        close: async () => {
            state = undefined;
        }
    };
}

export async function openWriter(path: string[]) {
    return (await storageBackend()) === 'opfs' ? opfsWriter(path) : idbWriter(path);
}

/** The finished video, read from the device; nothing is loaded into memory. */
export async function readVideo(path: string[], type: string): Promise<Blob | undefined> {
    if ((await storageBackend()) === 'opfs') {
        try {
            let directory = await navigator.storage.getDirectory();
            for (const part of path.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
            const file = await (await directory.getFileHandle(path[path.length - 1])).getFile();
            return new Blob([file], { type });
        } catch {
            return undefined;
        }
    }
    const names = await chunkNames(path);
    if (!names.length) return undefined;
    const parts = await getMany<Blob>(names, filesOf());
    return new Blob(parts.filter((part): part is Blob => !!part), { type });
}

export async function removeVideo(path: string[]) {
    if ((await storageBackend()) === 'opfs') {
        await call('close', path).catch(() => 0);
        try {
            let directory = await navigator.storage.getDirectory();
            for (const part of path.slice(0, -2)) directory = await directory.getDirectoryHandle(part);
            await directory.removeEntry(path[path.length - 2], { recursive: true });
        } catch { /* Already gone. */ }
        return;
    }
    const names = await chunkNames(path);
    if (names.length) await delMany(names, filesOf());
}

export type DeviceSpace = { usage: number; quota: number; persisted: boolean; backend: 'opfs' | 'idb' };
export async function deviceSpace(): Promise<DeviceSpace> {
    const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
    const persisted = await navigator.storage?.persisted?.().catch(() => false) || false;
    return { usage: estimate?.usage || 0, quota: estimate?.quota || 0, persisted, backend: await storageBackend() };
}

/** Asks the browser not to clear downloads when space runs low; granted silently or not at all. */
export async function keepDownloads() {
    try {
        return await navigator.storage?.persist?.() || false;
    } catch {
        return false;
    }
}

/* eslint-enable compat/compat */
