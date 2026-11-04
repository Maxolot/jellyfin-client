import type { Api } from '@jellyfin/sdk';
import { AxiosError } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { proxyClient } from './api';

function client() {
    const send = vi.fn();
    const api = { basePath: 'https://jellyfin.example.test/base/', accessToken: 'test-user-session', axiosInstance: { request: send } };
    return { send, proxy: proxyClient(api as unknown as Api) };
}
describe('authenticated Moonbase transport', () => {
    it('keeps user authentication on the connected Jellyfin origin', async () => {
        const { send, proxy } = client();
        send.mockResolvedValue({ status: 200, data: { results: [] } });
        await proxy.call('Api/search?query=film&page=1');
        expect(send).toHaveBeenCalledWith(expect.objectContaining({
            url: 'https://jellyfin.example.test/base/Moonfin/Seerr/Api/search?query=film&page=1',
            method: 'GET', headers: expect.objectContaining({ Authorization: 'MediaBrowser Token="test-user-session"' })
        }));
    });
    it('allows collection reads but rejects writes and invalid collection identifiers', async () => {
        const { send, proxy } = client();
        send.mockResolvedValue({ status: 200, data: { id: 42, parts: [] } });
        await expect(proxy.call('Api/collection/42?language=fr')).resolves.toMatchObject({ id: 42 });
        await expect(proxy.call('Api/collection/42', undefined, {})).rejects.toThrow('Unsupported');
        await expect(proxy.call('Api/collection/../settings')).rejects.toThrow('Unsupported');
        expect(send).toHaveBeenCalledTimes(1);
    });
    it('degrades to absent integration only for an unsupported proxy', async () => {
        const { send, proxy } = client();
        send.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
        await expect(proxy.status()).resolves.toEqual({ enabled: false, authenticated: false });
        send.mockRejectedValue({ isAxiosError: true, response: { status: 503 } });
        await expect(proxy.status()).rejects.toMatchObject({ status: 503 });
    });
    it('does not send unexpected methods, paths or tokens to an arbitrary URL', async () => {
        const { send, proxy } = client();
        await expect(proxy.call('https://evil.example/Api/request')).rejects.toThrow('Unsupported');
        await expect(proxy.call('Api/settings/main')).rejects.toThrow('Unsupported');
        await expect(proxy.call('Api/search', undefined, {})).rejects.toThrow('Unsupported');
        expect(send).not.toHaveBeenCalled();
    });
    it('sends the selected seasons and quality once without automatic retries', async () => {
        const { send, proxy } = client();
        send.mockRejectedValue(new AxiosError('private server detail', undefined, undefined, undefined, { status: 409 } as never));
        await expect(proxy.call('Api/request', undefined, { mediaType: 'tv', mediaId: 42, seasons: [2, 4], is4k: false })).rejects.toMatchObject({ status: 409, message: 'Cette demande existe déjà.' });
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].data.seasons).toEqual([2, 4]);
    });
    it('decodes the installed proxy envelope without accepting an HTML error page', async () => {
        const { send, proxy } = client();
        send.mockResolvedValue({ status: 200, data: { FileContents: btoa('{"results":[]}') } });
        await expect(proxy.call('Api/request')).resolves.toEqual({ results: [] });
        send.mockResolvedValue({ status: 200, data: '<html>private error</html>' });
        await expect(proxy.call('Api/request')).rejects.toMatchObject({ status: 502 });
    });
    it('preserves cancellation and does not misreport an accepted no-op as a new request', async () => {
        const { send, proxy } = client();
        send.mockRejectedValue({ isAxiosError: true, code: 'ERR_CANCELED' });
        await expect(proxy.call('Api/auth/me')).rejects.toMatchObject({ code: 'ERR_CANCELED' });
        send.mockResolvedValue({ status: 202, data: { message: 'No seasons available' } });
        await expect(proxy.call('Api/request', undefined, {})).rejects.toMatchObject({ status: 202 });
    });
});
