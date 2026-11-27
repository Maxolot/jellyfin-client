import type { TaskInfo, UserPolicy, VirtualFolderInfo } from '@jellyfin/sdk/lib/generated-client';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getLibraryStructureApi } from '@jellyfin/sdk/lib/utils/api/library-structure-api';
import { getScheduledTaskApi } from '@jellyfin/sdk/lib/utils/api/scheduled-task-api';
import { getSessionApi } from '@jellyfin/sdk/lib/utils/api/session-api';
import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api';
import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

import { clientRequest } from '../session';
import { isRunning, type PolicyChanges, withPolicy } from './model';

const LIVE_MS = 10000;
const BUSY_MS = 3000;

/** Every admin query lives under one key per server and account, so that another profile never sees it. */
function useAdminRoot() {
    const { api, user } = useApi();
    const administrator = !!api && user?.Policy?.IsAdministrator === true;
    return { api: api!, administrator, userId: user?.Id, root: ['ClientAdmin', api?.basePath, user?.Id] as const };
}

export function useAdminSessions() {
    const { api, administrator, root } = useAdminRoot();
    return useQuery({ queryKey: [...root, 'Sessions'], enabled: administrator, refetchInterval: LIVE_MS, refetchIntervalInBackground: false,
        queryFn: ({ signal }) => clientRequest(async () => (await getSessionApi(api).getSessions({ activeWithinSeconds: 960 }, { signal })).data) });
}

export function useStopSession() {
    const { api, root } = useAdminRoot();
    const cache = useQueryClient();
    return useMutation({
        mutationFn: (sessionId: string) => getSessionApi(api).sendPlaystateCommand({ sessionId, command: 'Stop' }),
        onSettled: () => cache.invalidateQueries({ queryKey: [...root, 'Sessions'] })
    });
}

export function useSystemInfo() {
    const { api, administrator, root } = useAdminRoot();
    return useQuery({ queryKey: [...root, 'System'], enabled: administrator, refetchInterval: 60000,
        queryFn: ({ signal }) => clientRequest(async () => (await getSystemApi(api).getSystemInfo({ signal })).data) });
}

export function useRestartServer() {
    const { api, root } = useAdminRoot();
    const cache = useQueryClient();
    return useMutation({
        mutationFn: () => getSystemApi(api).restartApplication(),
        onSettled: () => setTimeout(() => {
            cache.invalidateQueries({ queryKey: root }).catch(() => undefined);
        }, 15000)
    });
}

export function useStorage() {
    const { api, administrator, root } = useAdminRoot();
    return useQuery({ queryKey: [...root, 'Storage'], enabled: administrator, staleTime: 300000, retry: false,
        queryFn: ({ signal }) => clientRequest(async () => (await getSystemApi(api).getSystemStorage({ signal })).data) });
}

export function useItemCounts() {
    const { api, administrator, root } = useAdminRoot();
    return useQuery({ queryKey: [...root, 'Counts'], enabled: administrator, staleTime: 300000,
        queryFn: ({ signal }) => clientRequest(async () => (await getLibraryApi(api).getItemCounts({}, { signal })).data) });
}

export function useTasks() {
    const { api, administrator, root } = useAdminRoot();
    return useQuery<TaskInfo[]>({ queryKey: [...root, 'Tasks'], enabled: administrator,
        refetchInterval: query => (query.state.data?.some(isRunning) ? BUSY_MS : LIVE_MS * 3),
        queryFn: ({ signal }) => clientRequest(async () => (await getScheduledTaskApi(api).getTasks({ isHidden: false }, { signal })).data) });
}

export function useTaskAction() {
    const { api, root } = useAdminRoot();
    const cache = useQueryClient();
    return useMutation({
        mutationFn: ({ taskId, start }: { taskId: string; start: boolean }) => (start ?
            getScheduledTaskApi(api).startTask({ taskId }) :
            getScheduledTaskApi(api).stopTask({ taskId })),
        onSettled: () => cache.invalidateQueries({ queryKey: [...root, 'Tasks'] })
    });
}

export type LogFilters = { days: number; severity: 'all' | 'problems'; source: 'all' | 'users' | 'system' };
const LOG_PAGE = 40;
const DAY_MS = 86400000;

export function useActivityLog(filters: LogFilters, pages: number) {
    const { api, administrator, root } = useAdminRoot();
    return useQuery({ queryKey: [...root, 'Log', filters, pages], enabled: administrator, placeholderData: keepPreviousData, refetchInterval: LIVE_MS * 3,
        queryFn: ({ signal }) => clientRequest(async () => {
            const minDate = new Date(Date.now() - filters.days * DAY_MS).toISOString();
            const hasUserId = filters.source === 'all' ? undefined : filters.source === 'users';
            const system = getSystemApi(api);
            const read = (severity?: 'Warning' | 'Error') => system.getLogEntries({ startIndex: 0, limit: pages * LOG_PAGE, minDate, hasUserId, severity }, { signal }).then(response => response.data);
            if (filters.severity === 'all') return read();
            // The server filters on one severity at a time: problems are warnings and errors together.
            const [warnings, errors] = await Promise.all([read('Warning'), read('Error')]);
            const items = [...(warnings.Items || []), ...(errors.Items || [])].sort((a, b) => Date.parse(b.Date || '') - Date.parse(a.Date || '')).slice(0, pages * LOG_PAGE);
            return { Items: items, TotalRecordCount: (warnings.TotalRecordCount || 0) + (errors.TotalRecordCount || 0), StartIndex: 0 };
        }) });
}
useActivityLog.PAGE = LOG_PAGE;

export function useRecentActivity() {
    const { api, administrator, root } = useAdminRoot();
    return useQuery({ queryKey: [...root, 'Recent'], enabled: administrator, refetchInterval: LIVE_MS * 3,
        queryFn: ({ signal }) => clientRequest(async () => (await getSystemApi(api).getLogEntries({ startIndex: 0, limit: 8 }, { signal })).data.Items || []) });
}

export function useUsers() {
    const { api, administrator, root } = useAdminRoot();
    return useQuery({ queryKey: [...root, 'Users'], enabled: administrator,
        queryFn: ({ signal }) => clientRequest(async () => {
            const users = [...(await getUserApi(api).getUsers({}, { signal })).data];
            return users.sort((a, b) => (a.Name || '').localeCompare(b.Name || '', 'fr'));
        }) });
}

export function useVirtualFolders(live = false) {
    const { api, administrator, root } = useAdminRoot();
    return useQuery<VirtualFolderInfo[]>({ queryKey: [...root, 'Libraries'], enabled: administrator,
        refetchInterval: query => (live || query.state.data?.some(folder => folder.RefreshStatus === 'Active') ? BUSY_MS : false),
        queryFn: ({ signal }) => clientRequest(async () => (await getLibraryStructureApi(api).getVirtualFolders({ signal })).data) });
}

/** Saves the form's changes on top of the policy the server has now, so that a change made elsewhere meanwhile is kept. */
export function useSavePolicy() {
    const { api, root } = useAdminRoot();
    const cache = useQueryClient();
    return useMutation({
        mutationFn: async ({ userId, changes }: { userId: string; changes: PolicyChanges }) => {
            const users = getUserApi(api);
            const current = (await users.getUserById({ userId })).data.Policy as UserPolicy;
            await users.updateUserPolicy({ userId, userPolicy: withPolicy(current, changes) });
        },
        onSettled: () => cache.invalidateQueries({ queryKey: [...root, 'Users'] })
    });
}

export function useResetPassword() {
    const { api } = useAdminRoot();
    return useMutation({
        mutationFn: ({ userId, password }: { userId: string; password: string }) => getUserApi(api).updateUserPassword({ userId, updateUserPassword: { NewPw: password } })
    });
}

export function useCreateUser() {
    const { api, root } = useAdminRoot();
    const cache = useQueryClient();
    return useMutation({
        mutationFn: async ({ name, password }: { name: string; password: string }) => (await getUserApi(api).createUserByName({ createUserByName: { Name: name.trim(), Password: password } })).data,
        onSettled: () => cache.invalidateQueries({ queryKey: [...root, 'Users'] })
    });
}

export function useScanLibraries() {
    const { api, root } = useAdminRoot();
    const cache = useQueryClient();
    return useMutation({
        mutationFn: (itemId?: string) => (itemId ?
            getLibraryApi(api).refreshItem({ itemId, metadataRefreshMode: 'Default', imageRefreshMode: 'Default', replaceAllMetadata: false, replaceAllImages: false }) :
            getLibraryApi(api).refreshLibrary()),
        onSettled: () => cache.invalidateQueries({ queryKey: [...root] })
    });
}

export function useTrickplayOptions() {
    const { api, root } = useAdminRoot();
    const cache = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, extraction, duringScan }: { id: string; extraction: boolean; duringScan: boolean }) => {
            const structure = getLibraryStructureApi(api);
            const folder = (await structure.getVirtualFolders()).data.find(entry => entry.ItemId === id);
            if (!folder?.LibraryOptions) throw new Error('Bibliothèque introuvable');
            await structure.updateLibraryOptions({ updateLibraryOptionsDto: { Id: id, LibraryOptions: {
                ...folder.LibraryOptions, EnableTrickplayImageExtraction: extraction, ExtractTrickplayImagesDuringLibraryScan: extraction && duringScan } } });
        },
        onSettled: () => cache.invalidateQueries({ queryKey: [...root, 'Libraries'] })
    });
}

export function useCurrentUserId() {
    return useAdminRoot().userId;
}
