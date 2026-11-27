import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { useApi } from 'hooks/useApi';

import type { MediaType } from '../seerr/model';

export type Notification = {
    id: string;
    requestId: number;
    type: MediaType;
    tmdb: number;
    title: string;
    event: 'approved' | 'declined' | 'downloading' | 'available' | 'blocked' | 'episodes';
    created: string;
    readAt?: string | null;
    etaFrom?: string | null;
    etaTo?: string | null;
    reason?: string | null;
    season?: number | null;
    episodes?: number | null;
};

const events = {
    approved: 'Demande approuvée',
    declined: 'Demande refusée',
    downloading: 'Téléchargement commencé',
    available: 'Disponible dans Jellyfin',
    blocked: 'Demande bloquée'
};

export function notificationLabel(entry: Notification) {
    if (entry.event !== 'episodes') return events[entry.event] || 'Demande mise à jour';
    const count = entry.episodes || 1;
    const numbers = count === 1 ? '1 nouvel épisode' : `${count} nouveaux épisodes`;
    return entry.season ? `Saison ${entry.season} · ${numbers}` : numbers;
}

export function useNotifications() {
    const { api, user } = useApi();
    const queryKey = ['SharedCatalog', 'Notifications', api?.basePath, user?.Id];
    const cache = useQueryClient();
    const headers = { Authorization: `MediaBrowser Token="${api?.accessToken || ''}"` };
    const query = useQuery<Notification[] | null>({
        queryKey, enabled: !!api && !!user?.Id, retry: false, staleTime: 25000,
        refetchInterval: queryState => Array.isArray(queryState.state.data) ? 30000 : false,
        refetchIntervalInBackground: false,
        queryFn: async ({ signal }) => {
            try {
                const { data } = await api!.axiosInstance.get<Notification[]>(api!.basePath + '/SharedCatalog/Notifications', { signal, headers });
                return Array.isArray(data) ? data : null;
            } catch (error) {
                if (isAxiosError(error) && error.response?.status === 404) return null;
                throw error;
            }
        }
    });
    const mark = useMutation({
        mutationFn: async (ids: string[] | null) => {
            if (!api || !user?.Id) throw new Error('Disconnected');
            await api.axiosInstance.post(api.basePath + '/SharedCatalog/Notifications/Read', { ids }, { headers });
        },
        onSuccess: (_, ids) => {
            const readAt = new Date().toISOString();
            const selected = ids ? new Set(ids) : undefined;
            cache.setQueryData<Notification[] | null>(queryKey, data => data?.map(entry =>
                entry.readAt || (selected && !selected.has(entry.id)) ? entry : { ...entry, readAt }) ?? data);
            return cache.invalidateQueries({ queryKey });
        }
    });
    return { query, mark };
}
