import type { UserConfiguration } from '@jellyfin/sdk/lib/generated-client';
import { getAuthenticationApi } from '@jellyfin/sdk/lib/utils/api/authentication-api';
import { getImageApi } from '@jellyfin/sdk/lib/utils/api/image-api';
import { getLocalizationApi } from '@jellyfin/sdk/lib/utils/api/localization-api';
import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';
import { ImageType } from '@jellyfin/sdk/lib/generated-client/models/image-type';

import { mergeConfiguration } from './accountModel';
import { clientRequest } from '../session';

export function useAccount() {
    const { api, user, __legacyApiClient__: legacy } = useApi();
    const cache = useQueryClient();
    const root = ['Client', api?.basePath, user?.Id];
    const account = useQuery({
        queryKey: [...root, 'Account'],
        enabled: !!api && !!user?.Id,
        queryFn: ({ signal }) => clientRequest(async () => (await getUserApi(api!).getCurrentUser({ signal })).data)
    });
    const cultures = useQuery({
        queryKey: ['Client', api?.basePath, 'Cultures'],
        enabled: !!api,
        staleTime: Infinity,
        queryFn: ({ signal }) => clientRequest(async () => (await getLocalizationApi(api!).getCultures({ signal })).data
            .filter(culture => culture.ThreeLetterISOLanguageName)
            .sort((a, b) => (a.DisplayName || '').localeCompare(b.DisplayName || '', 'fr')))
    });
    const quickConnect = useQuery({
        queryKey: ['Client', api?.basePath, 'QuickConnectEnabled'],
        enabled: !!api,
        queryFn: ({ signal }) => clientRequest(async () => (await getAuthenticationApi(api!).getQuickConnectEnabled({ signal })).data)
    });
    async function refresh() {
        await cache.invalidateQueries({ queryKey: root });
    }

    const configuration = useMutation({
        mutationFn: async (patch: Partial<UserConfiguration>) => {
            // Re-read the server copy so changes made elsewhere (another device, the admin) are not overwritten.
            const fresh = (await getUserApi(api!).getCurrentUser()).data;
            const next = mergeConfiguration(fresh.Configuration || {}, patch);
            await getUserApi(api!).updateUserConfiguration({ userId: user!.Id!, userConfiguration: next });
            // Library queries read the session user's configuration when they run; keep it in step without a new login.
            if (user) user.Configuration = next;
            return next;
        },
        onSettled: refresh
    });
    const password = useMutation({
        mutationFn: ({ current, next }: { current: string; next: string }) => getUserApi(api!).updateUserPassword({ userId: user!.Id!,
            updateUserPassword: { CurrentPw: current, NewPw: next } })
    });
    const avatar = useMutation({
        // The server expects the base64 image body produced by the retained API client.
        mutationFn: async (file: File | null) => {
            if (file) await legacy!.uploadUserImage(user!.Id!, ImageType.Primary, file);
            else await getImageApi(api!).deleteUserImage({ userId: user!.Id! });
        },
        onSettled: refresh
    });
    const authorize = useMutation({
        mutationFn: async (code: string) => (await getAuthenticationApi(api!).authorizeQuickConnect({ code, userId: user!.Id! })).data
    });
    return { api, user, account, cultures, quickConnect, configuration, password, avatar, authorize };
}
