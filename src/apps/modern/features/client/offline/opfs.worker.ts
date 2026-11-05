/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals, compat/compat -- Worker scope and OPFS are feature-probed before this backend is selected. */
/* Writes downloads straight into the origin private file system, without blocking the page. */
type SyncHandle = { write: (data: BufferSource, options: { at: number }) => number; truncate: (size: number) => void; getSize: () => number; flush: () => void; close: () => void };
type Message = { id: number; op: 'probe' | 'write' | 'truncate' | 'size' | 'close'; path: string[]; offset?: number; data?: ArrayBuffer; size?: number };

const handles = new Map<string, SyncHandle>();

async function directoryFor(path: string[]) {
    let directory = await navigator.storage.getDirectory();
    for (const part of path.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create: true });
    return directory;
}

async function handleFor(path: string[]) {
    const key = path.join('/');
    const existing = handles.get(key);
    if (existing) return existing;
    const file = await (await directoryFor(path)).getFileHandle(path[path.length - 1], { create: true });
    const handle = await (file as unknown as { createSyncAccessHandle: () => Promise<SyncHandle> }).createSyncAccessHandle();
    handles.set(key, handle);
    return handle;
}

async function probe(path: string[]) {
    const handle = await handleFor(path);
    handle.write(new Uint8Array([1]), { at: 0 });
    handle.close();
    handles.delete(path.join('/'));
    await (await directoryFor(path)).removeEntry(path[path.length - 1]);
}

self.onmessage = async (event: MessageEvent<Message>) => {
    const { id, op, path } = event.data;
    try {
        if (op === 'probe') {
            await probe(path);
            self.postMessage({ id, size: 0 });
            return;
        }
        if (op === 'close') {
            const key = path.join('/');
            handles.get(key)?.close();
            handles.delete(key);
            self.postMessage({ id, size: 0 });
            return;
        }
        const handle = await handleFor(path);
        if (op === 'write' && event.data.data) {
            handle.write(new Uint8Array(event.data.data), { at: event.data.offset || 0 });
            handle.flush();
        } else if (op === 'truncate') {
            handle.truncate(event.data.size || 0);
            handle.flush();
        }
        self.postMessage({ id, size: handle.getSize() });
    } catch (error) {
        self.postMessage({ id, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error), quota: error instanceof DOMException && error.name === 'QuotaExceededError' });
    }
};

export default null;

/* eslint-enable no-restricted-globals, compat/compat */
