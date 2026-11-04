import { getPluginApi } from '@jellyfin/sdk/lib/utils/api/plugin-api';
import { getSessionApi } from '@jellyfin/sdk/lib/utils/api/session-api';
import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

import { findMoonbase, MOONBASE_ID, MOONBASE_NAME, MOONBASE_REPOSITORY, setupStage, withMoonbaseRepository, withSeerrUrl } from './setup';

const RESTART_POLL_MS = 3000;
const RESTART_ATTEMPTS = 60;
const wait = (duration: number) => new Promise(resolve => setTimeout(resolve, duration));

export function useSeerrSetup() {
    const { api, user } = useApi();
    const cache = useQueryClient();
    const administrator = !!user?.Policy?.IsAdministrator;
    const root = ['ClientSeerrSetup', api?.basePath];
    const plugin = useQuery({
        queryKey: [...root, 'Plugin'],
        enabled: !!api && administrator,
        queryFn: async ({ signal }) => findMoonbase((await getPluginApi(api!).getPlugins({ signal })).data) ?? null
    });
    const stage = plugin.data === undefined ? undefined : setupStage(plugin.data ?? undefined);
    const playing = useQuery({
        queryKey: [...root, 'Playing'],
        enabled: !!api && administrator && stage === 'restart',
        refetchInterval: 15000,
        queryFn: async ({ signal }) => (await getSessionApi(api!).getSessions({ activeWithinSeconds: 960 }, { signal })).data
            .filter(session => session.NowPlayingItem).length
    });
    const configuration = useQuery({
        queryKey: [...root, 'Configuration'],
        enabled: !!api && administrator && stage === 'ready',
        queryFn: async ({ signal }) => (await api!.axiosInstance.get<Record<string, unknown>>(`${api!.basePath}/Plugins/${MOONBASE_ID}/Configuration`, {
            signal, headers: { Authorization: api!.authorizationHeader } })).data
    });
    const refresh = () => cache.invalidateQueries({ queryKey: root });

    const install = useMutation({
        mutationFn: async () => {
            const plugins = getPluginApi(api!);
            const repositories = (await plugins.getRepositories()).data;
            await plugins.setRepositories({ repositoryInfo: withMoonbaseRepository(repositories) });
            await plugins.installPackage({ name: MOONBASE_NAME, assemblyGuid: MOONBASE_ID, repositoryUrl: MOONBASE_REPOSITORY });
            // The catalogue installs in the background: the plugin appears in the list once it is on disk.
            for (let attempt = 0; attempt < RESTART_ATTEMPTS; attempt++) {
                await wait(RESTART_POLL_MS);
                if (findMoonbase((await plugins.getPlugins()).data)) return;
            }
            throw new Error('Moonbase installation timed out');
        },
        onSettled: refresh
    });
    const restart = useMutation({
        mutationFn: async () => {
            await getSystemApi(api!).restartApplication();
            for (let attempt = 0; attempt < RESTART_ATTEMPTS; attempt++) {
                await wait(RESTART_POLL_MS);
                try {
                    if (setupStage(findMoonbase((await getPluginApi(api!).getPlugins()).data)) === 'ready') return;
                } catch { /* The server does not answer while it restarts. */ }
            }
            throw new Error('Jellyfin did not come back with Moonbase active');
        },
        onSettled: refresh
    });
    const save = useMutation({
        mutationFn: async (url: string) => {
            // Re-read the plugin settings so a change made in the dashboard meanwhile is not overwritten.
            const endpoint = `${api!.basePath}/Plugins/${MOONBASE_ID}/Configuration`;
            const headers = { Authorization: api!.authorizationHeader };
            const current = (await api!.axiosInstance.get<Record<string, unknown>>(endpoint, { headers })).data;
            await api!.axiosInstance.post(endpoint, withSeerrUrl(current, url), { headers });
        },
        onSettled: refresh
    });
    return { administrator, plugin, stage, playing, configuration, install, restart, save };
}
