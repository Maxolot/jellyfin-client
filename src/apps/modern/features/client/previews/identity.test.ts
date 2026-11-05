import { describe, expect, it } from 'vitest';
import { previewConnection, type PreviewTransport } from './identity';
const api = () => ({ basePath: 'https://server.example.test', accessToken: 'test-session-a', axiosInstance: {} } as PreviewTransport);
const user = { Id: 'a', ServerId: 'server' };
const legacy = { serverAddress: () => 'https://server.example.test/', serverId: () => 'server', getCurrentUserId: () => 'a', accessToken: () => 'test-session-a' };
describe('preview connection identity', () => {
    it('snapshots the matched session instead of retaining a mutable SDK token', () => {
        const mutable = api();
        const snapshot = previewConnection(mutable, user, legacy);
        expect(snapshot).toBeDefined();
        Object.assign(mutable, { accessToken: 'test-session-b' });
        expect(snapshot?.accessToken).toBe('test-session-a');
    });
    it('blocks transient account, server and session mismatches', () => {
        expect(previewConnection(api(), { ...user, Id: 'b' }, legacy)).toBeUndefined();
        expect(previewConnection(api(), { ...user, ServerId: 'other' }, legacy)).toBeUndefined();
        expect(previewConnection({ ...api(), accessToken: 'test-session-b' }, user, legacy)).toBeUndefined();
        expect(previewConnection({ ...api(), basePath: 'https://other.example.test' }, user, legacy)).toBeUndefined();
        expect(previewConnection(api(), undefined, legacy)).toBeUndefined();
    });
});
