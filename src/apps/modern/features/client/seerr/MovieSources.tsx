/* eslint-disable react/jsx-no-bind -- The icon toggles its explanation. */
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useApi } from 'hooks/useApi';
import ClientIcon from '../ClientIcon';

type Capability = { Enabled?: boolean; enabled?: boolean };
type Result = { Found?: boolean; found?: boolean };

export default function MovieSources({ imdbId }: Readonly<{ imdbId?: string }>) {
    const { api, user } = useApi();
    const [showInfo, setShowInfo] = useState(false);
    const request = async <T,>(path: string, signal?: AbortSignal): Promise<T> => {
        if (!api) throw new Error('Service indisponible');
        const response = await api.axiosInstance.request<T>({ url: `${api.basePath.replace(/\/$/, '')}/MovieSources/${path}`,
            headers: { Authorization: `MediaBrowser Token="${api.accessToken}"`, Accept: 'application/json' }, signal, timeout: 25000 });
        return response.data;
    };
    const capability = useQuery({ queryKey: ['MovieSources', api?.basePath, user?.Id], enabled: !!api && !!user?.Id,
        queryFn: ({ signal }) => request<Capability>('Capabilities', signal), staleTime: 300000, retry: false });
    const available = !!(capability.data?.Enabled ?? capability.data?.enabled);
    const validId = !!imdbId && /^tt\d{5,10}$/.test(imdbId);
    const search = useQuery({ queryKey: ['MovieSources', api?.basePath, user?.Id, 'Movie', imdbId], enabled: available && validId,
        queryFn: async ({ signal }) => {
            const result = await request<Result>(`Movies/${imdbId}`, signal);
            if (typeof (result.Found ?? result.found) !== 'boolean') throw new Error('Réponse invalide');
            return result;
        }, staleTime: 300000, retry: (count, error) => count < 1 && (error as { response?: { status?: number } }).response?.status === 429,
        retryDelay: 6000, refetchOnWindowFocus: false });
    if (!available) return null;
    let status: 'unknown' | 'pending' | 'found' | 'empty' = 'unknown';
    if (validId && !search.isError) {
        if (search.isPending) status = 'pending';
        else if (search.data?.Found ?? search.data?.found) status = 'found';
        else status = 'empty';
    }
    const label = { unknown: 'Vérification des sources indisponible.', pending: 'Vérification des sources en cours…',
        found: 'Sources trouvées. Le téléchargement dépend des règles du serveur et de leur disponibilité.',
        empty: 'Aucun résultat pour le moment. Certains indexeurs peuvent être indisponibles ; une demande reste possible.' }[status];
    let icon: 'check' | 'refresh' | 'info' = 'info';
    if (status === 'found') icon = 'check';
    if (status === 'pending') icon = 'refresh';
    return <span role='status' aria-label={label}>
        <button type='button' className={`client-movie-source-indicator is-${status}`} aria-label={label} aria-expanded={showInfo} onClick={() => setShowInfo(!showInfo)}>
            <ClientIcon name={icon} />
            <span className='client-movie-source-tooltip' aria-hidden='true'>{label}</span>
        </button>
    </span>;
}

/* eslint-enable react/jsx-no-bind */
