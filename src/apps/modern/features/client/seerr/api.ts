import type { Api } from '@jellyfin/sdk';
import { isAxiosError } from 'axios';

import type { ProxyStatus } from './model';

export class SeerrError extends Error {
    constructor(readonly status: number) {
        const messages: Record<number, string> = {
            401: 'La connexion aux demandes a expiré.',
            403: 'Vos droits ou votre quota ne permettent pas cette demande.',
            409: 'Cette demande existe déjà.',
            202: 'Aucune nouvelle demande nécessaire. Actualisez le statut.'
        };
        super(messages[status] || 'Le service de demandes est indisponible. Réessayez.');
        // TypeScript ES5 output otherwise returns a native Error with the wrong prototype.
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = 'SeerrError';
    }
}

/** Only the authenticated Jellyfin origin is contacted; Seerr sessions stay in Moonbase. */
export function proxyClient(api: Pick<Api, 'basePath' | 'accessToken' | 'axiosInstance'>) {
    async function call<T>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
        const route = path.split('?')[0];
        const simple = ['Status', 'Validate', 'Login', 'Api/auth/me', 'Api/search', 'Api/request',
            'Api/discover/trending', 'Api/discover/movies', 'Api/discover/tv',
            'Api/discover/movies/upcoming', 'Api/discover/tv/upcoming', 'Api/genres/movie', 'Api/genres/tv'];
        const detail = /^Api\/(movie|tv|request)\/\d+(\/(recommendations|similar))?$/.test(route);
        const quota = /^Api\/user\/\d+\/quota$/.test(route);
        if (path.includes('#') || (!simple.includes(route) && !detail && !quota)
            || (body !== undefined && !['Login', 'Api/request'].includes(route))) throw new Error('Unsupported Seerr route');
        try {
            const response = await api.axiosInstance.request<T>({
                url: api.basePath.replace(/\/$/, '') + '/Moonfin/Seerr/' + path,
                method: body === undefined ? 'GET' : 'POST', signal, timeout: 20000,
                headers: { Authorization: `MediaBrowser Token="${api.accessToken}"`, Accept: 'application/json' },
                data: body
            });
            if (response.status === 202) throw new SeerrError(202);
            let data: unknown = response.data;
            if (data && typeof data === 'object' && 'FileContents' in data) {
                const bytes = Uint8Array.from(atob(String(data.FileContents)), c => c.charCodeAt(0));
                data = JSON.parse(new TextDecoder().decode(bytes));
            }
            if (!data || typeof data !== 'object') throw new SeerrError(502);
            return data as T;
        } catch (error) {
            if (isAxiosError(error) && error.code !== 'ERR_CANCELED') throw new SeerrError(error.response?.status || 503);
            throw error;
        }
    }
    async function status(signal?: AbortSignal): Promise<ProxyStatus> {
        try {
            const data = await call<ProxyStatus>('Status', signal);
            return { ...data, enabled: data.enabled === true, authenticated: data.authenticated === true };
        } catch (error) {
            if (error instanceof SeerrError && [404, 405, 501].includes(error.status)) return { enabled: false, authenticated: false };
            throw error;
        }
    }
    return { call, status };
}
