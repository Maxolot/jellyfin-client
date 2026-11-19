import type { Api } from '@jellyfin/sdk';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { useApi } from 'hooks/useApi';

export async function membershipRequest<T>(api: Api, path: string, signal?: AbortSignal, method = 'GET') {
    const response = await api.axiosInstance.request<T>({
        method, url: api.basePath + '/SharedCatalog/' + path, signal,
        headers: { Authorization: `MediaBrowser Token="${api.accessToken}"` }
    });
    return response.data;
}

export function useFollowedMemberships(enabled = true) {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['ClientMemberships', api?.basePath, user?.Id], enabled: enabled && !!api && !!user?.Id,
        staleTime: 300000, retry: false,
        queryFn: async ({ signal }) => {
            try {
                return (await membershipRequest<{ followed?: boolean }>(api!, 'Memberships', signal)).followed === true;
            } catch (error) {
                if (isAxiosError(error) && error.response?.status === 404) return false;
                throw error;
            }
        }
    });
}
