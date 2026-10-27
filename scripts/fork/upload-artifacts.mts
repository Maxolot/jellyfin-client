// Forgejo v3 artifact transport using the runner's authenticated instance endpoint.
// Keep all pipeline requests on that endpoint: the public web URL may be unreachable
// from an isolated runner. No administrator token or instance address is embedded.
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const runtime = process.env.ACTIONS_RUNTIME_URL;
const token = process.env.ACTIONS_RUNTIME_TOKEN;
const runId = process.env.GITHUB_RUN_ID;
const sha = process.env.GITHUB_SHA;
if (!runtime || !token || !runId || !sha || !/^\d+$/.test(runId)) {
    throw new Error('Missing Forgejo runner artifact environment');
}
const base = new URL(runtime);
const name = process.env.INPUT_NAME || `jellyfin-client-${sha}`;
if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error('Invalid artifact name');
const collection = new URL(`_apis/pipelines/workflows/${runId}/artifacts?api-version=6.0-preview`, base);

async function request(url: URL, method: string, body: Buffer | string, headers: Record<string, string> = {}) {
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
        throw new Error('Artifact destination is outside the authenticated pipeline endpoint');
    }
    const response = await fetch(url, {
        method,
        body: typeof body === 'string' ? body : new Uint8Array(body),
        headers: { Authorization: `Bearer ${token}`, ...headers },
        signal: AbortSignal.timeout(60000),
        redirect: 'error'
    });
    if (!response.ok) throw new Error(`Artifact ${method} request failed: HTTP ${response.status}`);
    return response;
}

const created = await request(collection, 'POST', JSON.stringify({
    Type: 'actions_storage', Name: name, RetentionDays: 30
}), { 'Content-Type': 'application/json' });
const metadata = await created.json() as { fileContainerResourceUrl?: string };
if (!metadata.fileContainerResourceUrl) throw new Error('Missing upload destination');
const returned = new URL(metadata.fileContainerResourceUrl);
if (!returned.pathname.startsWith(`${base.pathname}_apis/pipelines/workflows/${runId}/artifacts/`)) {
    throw new Error('Unexpected artifact upload path');
}
const target = new URL(returned.pathname + returned.search, base.origin);
let total = 0;
const folder = resolve(process.env.INPUT_PATH || 'artifacts');
for (const file of (await readdir(folder)).sort()) {
    if (!(await stat(resolve(folder, file))).isFile()) throw new Error('Artifact must be a regular file');
    const data = await readFile(resolve(folder, file));
    if (!data.length) throw new Error('Empty artifact file');
    const url = new URL(target);
    url.searchParams.set('itemPath', `${name}/${file}`);
    const chunkSize = 4 * 1024 * 1024;
    for (let start = 0; start < data.length; start += chunkSize) {
        const end = Math.min(start + chunkSize, data.length);
        const response = await request(url, 'PUT', data.subarray(start, end), {
            'Content-Type': 'application/octet-stream',
            'x-actions-results-md5': createHash('md5').update(data.subarray(start, end)).digest('base64'),
            'Content-Range': `bytes ${start}-${end - 1}/${data.length}`
        });
        await response.arrayBuffer();
    }
    total += data.length;
    console.log(`Uploaded ${file} (${data.length} bytes)`);
}
const finalize = new URL(collection);
finalize.searchParams.set('artifactName', name);
await request(finalize, 'PATCH', JSON.stringify({ Size: total }), { 'Content-Type': 'application/json' });
console.log(`Artifact finalized (${total} bytes)`);
