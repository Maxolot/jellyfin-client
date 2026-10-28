import type { Api } from '@jellyfin/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useApi } from 'hooks/useApi';
import { useWebConfig } from 'hooks/useWebConfig';
import defaultConfig from '../../../../../config.json';

import { proxyClient, SeerrError } from './api';
import type { ProxyStatus, SeerrUser } from './model';

function useConnection() {
    const { api, user } = useApi();
    const config = useWebConfig();
    const cache = useQueryClient();
    const root = useMemo(() => ['ClientSeerr', api?.basePath, user?.Id], [api?.basePath, user?.Id]);
    const storageKey = `client-seerr-${api?.basePath}-${user?.Id}`;
    const [choice, setChoice] = useState<{ key: string; value: boolean }>();
    let stored = true;
    try {
        stored = localStorage.getItem(storageKey) !== 'false';
    } catch { /* Storage may be unavailable. */ }
    const permitted = config.clientSeerr !== false;
    const enabled = permitted && (choice?.key === storageKey ? choice.value : stored);
    const proxy = useMemo(() => api ? proxyClient(api) : undefined, [api]);
    const status = useQuery({ queryKey: [...root, 'Status'], enabled: config !== defaultConfig && enabled && !!proxy && !!user?.Id,
        queryFn: ({ signal }) => proxy!.status(signal), staleTime: 60000, retry: false });
    const call = useCallback(async <T,>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> => {
        if (!proxy || !enabled || !user?.Id) throw new SeerrError(503);
        try {
            return await proxy.call<T>(path, signal, body);
        } catch (error) {
            if (error instanceof SeerrError && error.status === 401) {
                cache.setQueryData<ProxyStatus>([...root, 'Status'], previous => ({ ...previous, enabled: true, authenticated: false }));
            }
            throw error;
        }
    }, [proxy, enabled, user?.Id, cache, root]);
    const me = useQuery({ queryKey: [...root, 'Me'], enabled: enabled && status.data?.authenticated === true,
        queryFn: ({ signal }) => call<SeerrUser>('Api/auth/me', signal), staleTime: 60000, retry: false });
    function setEnabled(value: boolean) {
        try {
            localStorage.setItem(storageKey, String(value));
        } catch { /* Session choice still works. */ }
        setChoice({ key: storageKey, value });
        if (!value) void cache.cancelQueries({ queryKey: root });
    }
    const reconnect = useCallback(async () => {
        await call('Login', undefined, { authType: 'quickconnect' });
        await cache.invalidateQueries({ queryKey: root });
    }, [call, cache, root]);
    const attempted = useRef(new Set<string>());
    useEffect(() => {
        if (!enabled || !status.data?.enabled || status.data.authenticated || attempted.current.has(storageKey)) return;
        attempted.current.add(storageKey);
        void reconnect().catch(() => undefined);
    }, [enabled, status.data, storageKey, reconnect]);
    return { api, root, enabled, permitted, setEnabled, status, me, call, reconnect,
        connected: enabled && status.data?.authenticated === true && !!me.data,
        permissions: me.data?.permissions || 0 };
}
const SeerrContext = createContext<ReturnType<typeof useConnection> | null>(null);
export function SeerrProvider({ children }: Readonly<React.PropsWithChildren>) {
    const connection = useConnection();
    return <SeerrContext.Provider key={connection.root.join(':')} value={connection}>{children}</SeerrContext.Provider>;
}
export function useSeerr() {
    const context = useContext(SeerrContext);
    if (!context) throw new Error('SeerrProvider is required');
    return context;
}
export type SeerrApi = Pick<Api, 'basePath' | 'accessToken' | 'axiosInstance'>;
