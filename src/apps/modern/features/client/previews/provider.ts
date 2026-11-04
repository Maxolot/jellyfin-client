import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from 'hooks/useApi';
import { clientRequest } from '../session';
import type { PreviewSurface } from '../previewSource';
import { parsePreviewManifest, type ResolvedPreview } from './model';
import { previewConnection, type PreviewTransport } from './identity';

async function request(api: PreviewTransport, path: string, signal: AbortSignal) {
    return clientRequest(() => api.axiosInstance.get(api.basePath.replace(/\/$/, '') + '/NativePreviews/' + path, {
        signal, timeout: 10000, headers: { Authorization: `MediaBrowser Token="${api.accessToken}"` }
    }));
}
export function usePreviewCapabilities(enabled: boolean) {
    const { api, user, __legacyApiClient__: legacy } = useApi();
    const transport = previewConnection(api, user, legacy);
    const query = useQuery({
        queryKey: ['ClientPreviews', api?.basePath, user?.Id, 'Capabilities'],
        enabled: enabled && !!transport, staleTime: 300000, gcTime: 600000, retry: false,
        queryFn: async ({ signal }) => {
            try {
                const { data } = await request(transport!, 'Capabilities', signal);
                return data?.Version === 1 && data.Enabled === true;
            } catch (error) {
                if (isAxiosError(error) && [403, 404].includes(error.response?.status || 0)) return false;
                throw error;
            }
        }
    });
    return { ...query, data: transport ? query.data : undefined };
}
export function useServerPreview(item: BaseItemDto, surface: PreviewSurface, enabled: boolean) {
    const { api, user, __legacyApiClient__: legacy } = useApi();
    const transport = previewConnection(api, user, legacy);
    const fallback = surface !== 'episode' && !!item.SeriesId;
    const query = useQuery<ResolvedPreview>({
        queryKey: ['ClientPreviews', api?.basePath, user?.Id, 'Manifest', item.Id, fallback],
        enabled: enabled && !!transport && !!item.Id,
        staleTime: 90000, gcTime: 120000, retry: false,
        refetchInterval: state => state.state.data?.state === 'pending' && state.state.dataUpdateCount < 24 ? 5000 : false,
        queryFn: async ({ signal }): Promise<ResolvedPreview> => {
            try {
                const response = await request(transport!, `Items/${item.Id}/Manifest?seriesFallback=${fallback}`, signal);
                if (response.status === 204) return { state: response.headers['retry-after'] ? 'pending' : 'none' };
                return parsePreviewManifest(response.data, transport!.basePath, fallback ? [item.Id!, item.SeriesId!] : [item.Id!]);
            } catch (error) {
                if (isAxiosError(error) && [403, 404].includes(error.response?.status || 0)) return { state: 'none' };
                throw error;
            }
        }
    });
    return { ...query, data: transport ? query.data : undefined };
}
