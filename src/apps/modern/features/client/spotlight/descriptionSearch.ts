import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { type Api } from '@jellyfin/sdk';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';

import { useApi } from 'hooks/useApi';

import { catalogueItem, type MediaType } from '../seerr/model';

export type DescriptionHit = {
    itemId?: string | null;
    tmdb?: number | null;
    type: MediaType;
    title: string;
    poster?: string | null;
    score: number;
    reason: string;
};

export function descriptionWords(value: string) {
    return value.trim().split(/[\s,.!?;:()«»]+/).filter(word => word.length > 0);
}

export function descriptionItem(hit: DescriptionHit): BaseItemDto | undefined {
    if (hit.type !== 'movie' && hit.type !== 'tv') return undefined;
    if (hit.itemId) return { Id: hit.itemId, Name: hit.title, Type: hit.type === 'movie' ? 'Movie' : 'Series', MediaType: 'Video' };
    if (!hit.tmdb || !Number.isSafeInteger(hit.tmdb) || hit.tmdb < 1) return undefined;
    return catalogueItem({ id: hit.tmdb, title: hit.title, posterPath: hit.poster || undefined }, hit.type, []);
}

async function getDescription<T>(api: Api, signal: AbortSignal, q?: string) {
    try {
        const response = await api.axiosInstance.get<T>(api.basePath + '/SharedCatalog/Describe', {
            signal, params: q ? { q } : undefined, headers: { Authorization: `MediaBrowser Token="${api.accessToken}"` }
        });
        return response.data;
    } catch (error) {
        if (isAxiosError(error) && error.response?.status === 404) return null;
        throw error;
    }
}

export function useDescriptionSearch(open: boolean, query: string, forced: boolean) {
    const { api, user } = useApi();
    const key = ['SharedCatalog', 'Describe', api?.basePath, user?.Id];
    const capabilities = useQuery({
        queryKey: [...key, 'capability'], enabled: open && !!api && !!user?.Id,
        retry: false, staleTime: 300000,
        queryFn: ({ signal }) => getDescription<{ available?: boolean }>(api!, signal)
    });
    const available = capabilities.data?.available === true;
    const q = query.trim().slice(0, 240);
    const eligible = available && !!q && (forced || descriptionWords(q).length >= 5);
    const [settled, setSettled] = useState('');
    useEffect(() => {
        if (!open || !eligible) return;
        const timer = window.setTimeout(() => setSettled(q), 350);
        return () => window.clearTimeout(timer);
    }, [open, eligible, q]);
    const active = open && eligible;
    const search = useQuery({
        queryKey: [...key, q], enabled: active && settled === q,
        retry: false, staleTime: 300000,
        queryFn: ({ signal }) => getDescription<{ results: DescriptionHit[] }>(api!, signal, q)
    });
    return {
        available, active,
        results: active && settled === q ? search.data?.results || [] : [],
        pending: active && (settled !== q || search.isPending),
        failed: active && search.isError
    };
}
