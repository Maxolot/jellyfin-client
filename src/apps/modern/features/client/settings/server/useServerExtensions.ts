import { getPluginApi } from '@jellyfin/sdk/lib/utils/api/plugin-api';
import { getSessionApi } from '@jellyfin/sdk/lib/utils/api/session-api';
import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

import { type Extension, extensionStage, findPackage, findPlugin, withRepository } from './extensions';

const POLL_MS = 3000;
const ATTEMPTS = 60;
const wait = (duration: number) => new Promise(resolve => setTimeout(resolve, duration));

function useRoot() {
    const { api, user } = useApi();
    return { api, administrator: !!user?.Policy?.IsAdministrator, root: ['ClientServerExtensions', api?.basePath, user?.Id] as const };
}

/** What is installed on the server, shared by every extension page. */
export function useServerPlugins() {
    const { api, administrator, root } = useRoot();
    return useQuery({ queryKey: [...root, 'Plugins'], enabled: !!api && administrator, staleTime: 10000,
        queryFn: async ({ signal }) => (await getPluginApi(api!).getPlugins({ signal })).data });
}

export function useExtension(extension: Extension) {
    const plugins = useServerPlugins();
    const plugin = findPlugin(plugins.data, extension);
    return { plugins, plugin, stage: plugins.data ? extensionStage(plugin) : undefined };
}

/** The catalogue the server can install from; asking it reads every repository, so it is only asked for when needed. */
export function useServerCatalogue(enabled: boolean) {
    const { api, administrator, root } = useRoot();
    const packages = useQuery({ queryKey: [...root, 'Packages'], enabled: enabled && !!api && administrator, staleTime: 60000, retry: false,
        queryFn: async ({ signal }) => (await getPluginApi(api!).getPackages({ signal })).data });
    const repositories = useQuery({ queryKey: [...root, 'Repositories'], enabled: enabled && !!api && administrator,
        queryFn: async ({ signal }) => (await getPluginApi(api!).getRepositories({ signal })).data });
    return { packages, repositories };
}

export function useInstallExtension(extension: Extension) {
    const { api, root } = useRoot();
    const cache = useQueryClient();
    const refresh = () => cache.invalidateQueries({ queryKey: root });
    const addRepository = useMutation({
        mutationFn: async (url: string) => {
            const plugins = getPluginApi(api!);
            const repositories = (await plugins.getRepositories()).data;
            await plugins.setRepositories({ repositoryInfo: withRepository(repositories, extension.title, url.trim()) });
        },
        onSettled: refresh
    });
    const install = useMutation({
        mutationFn: async (repositoryUrl?: string) => {
            const plugins = getPluginApi(api!);
            await plugins.installPackage({ name: extension.packageName, assemblyGuid: extension.id, repositoryUrl });
            // The server downloads in the background: the plugin appears once it is on disk.
            for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
                await wait(POLL_MS);
                if (findPlugin((await plugins.getPlugins()).data, extension)) return;
            }
            throw new Error(`${extension.packageName} installation timed out`);
        },
        onSettled: refresh
    });
    return { addRepository, install };
}

/** Whether the catalogue already offers this extension, and from where. */
export function availablePackage(extension: Extension, packages: ReturnType<typeof useServerCatalogue>['packages']['data']) {
    return findPackage(packages, extension);
}

/** Restarting stops every playback: the page counts them first and asks for confirmation. */
export function useServerRestart(enabled: boolean) {
    const { api, administrator, root } = useRoot();
    const cache = useQueryClient();
    const playing = useQuery({ queryKey: [...root, 'Playing'], enabled: enabled && !!api && administrator, refetchInterval: 15000,
        queryFn: async ({ signal }) => (await getSessionApi(api!).getSessions({ activeWithinSeconds: 960 }, { signal })).data.filter(session => session.NowPlayingItem).length });
    const restart = useMutation({
        mutationFn: async () => {
            await getSystemApi(api!).restartApplication();
            await wait(POLL_MS);
            for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
                try {
                    const plugins = (await getPluginApi(api!).getPlugins()).data;
                    if (!plugins.some(plugin => plugin.Status === 'Restart')) return;
                } catch { /* The server does not answer while it restarts. */ }
                await wait(POLL_MS);
            }
            throw new Error('The server did not come back');
        },
        onSettled: () => cache.invalidateQueries({ queryKey: root })
    });
    return { playing, restart };
}

type Raw = Record<string, unknown>;

/**
 * A plugin's own settings. `read` keeps only what the page shows: the query cache is saved in the browser,
 * so a secret must never reach it. Saving reads the settings again, so a change made elsewhere is kept.
 */
export function useExtensionConfiguration<T>(extension: Extension, enabled: boolean, read: (raw: Raw) => T) {
    const { api, administrator, root } = useRoot();
    const cache = useQueryClient();
    const key = [...root, 'Configuration', extension.key];
    const endpoint = () => `${api!.basePath}/Plugins/${extension.id}/Configuration`;
    const headers = () => ({ Authorization: api!.authorizationHeader });
    const configuration = useQuery({ queryKey: key, enabled: enabled && !!api && administrator,
        queryFn: async ({ signal }) => read((await api!.axiosInstance.get<Raw>(endpoint(), { signal, headers: headers() })).data) });
    const save = useMutation({
        mutationFn: async (change: (current: Raw) => Raw) => {
            const current = (await api!.axiosInstance.get<Raw>(endpoint(), { headers: headers() })).data;
            await api!.axiosInstance.post(endpoint(), change(current), { headers: headers() });
        },
        onSettled: async () => {
            await Promise.all([cache.invalidateQueries({ queryKey: root }), cache.invalidateQueries({ queryKey: ['ClientPreviews', api?.basePath] }), cache.invalidateQueries({ queryKey: ['MovieSources', api?.basePath] })]);
        }
    });
    return { configuration, save };
}

/** A plugin's own endpoint, for its status page. */
export function useExtensionEndpoint<T>(extension: Extension, path: string, enabled: boolean) {
    const { api, administrator, root } = useRoot();
    return useQuery({ queryKey: [...root, 'Endpoint', extension.key, path], enabled: enabled && !!api && administrator, retry: false, staleTime: 15000,
        refetchInterval: path === 'NativePreviews/Admin/Scenes' ? 5000 : false,
        queryFn: async ({ signal }) => (await api!.axiosInstance.get<T>(`${api!.basePath}/${path}`, { signal, headers: { Authorization: api!.authorizationHeader } })).data });
}

/** Switching a plugin back on, then the server asks for a restart. */
export function useEnableExtension() {
    const { api, root } = useRoot();
    const cache = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, version }: { id: string; version: string }) => {
            await getPluginApi(api!).enablePlugin({ pluginId: id, version });
        },
        onSettled: () => cache.invalidateQueries({ queryKey: root })
    });
}
