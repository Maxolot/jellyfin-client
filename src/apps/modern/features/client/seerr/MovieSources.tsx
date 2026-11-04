/* eslint-disable react/jsx-no-bind -- The button starts a single explicit search. */
import { useMutation, useQuery } from '@tanstack/react-query';
import React from 'react';
import { useApi } from 'hooks/useApi';

type Capability = { Enabled?: boolean; enabled?: boolean };
type Result = { Found?: boolean; found?: boolean };

export default function MovieSources({ imdbId }: Readonly<{ imdbId?: string }>) {
    const { api, user } = useApi();
    const request = async <T,>(path: string, signal?: AbortSignal): Promise<T> => {
        if (!api) throw new Error('Service indisponible');
        const response = await api.axiosInstance.request<T>({ url: `${api.basePath.replace(/\/$/, '')}/MovieSources/${path}`,
            headers: { Authorization: `MediaBrowser Token="${api.accessToken}"`, Accept: 'application/json' }, signal, timeout: 25000 });
        return response.data;
    };
    const capability = useQuery({ queryKey: ['MovieSources', api?.basePath, user?.Id], enabled: !!api && !!user?.Id,
        queryFn: ({ signal }) => request<Capability>('Capabilities', signal), staleTime: 300000, retry: false });
    const search = useMutation({ mutationFn: async () => {
        if (!imdbId || !/^tt\d{5,10}$/.test(imdbId)) throw new Error('Identifiant indisponible');
        const result = await request<Result>(`Movies/${imdbId}`);
        if (typeof (result.Found ?? result.found) !== 'boolean') throw new Error('Réponse invalide');
        return result;
    }, retry: false });
    if (!(capability.data?.Enabled ?? capability.data?.enabled)) return null;
    return <div className='client-movie-sources'>
        <button type='button' className='client-button' disabled={!imdbId || search.isPending} onClick={() => search.mutate()}>{search.isPending ? 'Vérification des sources…' : 'Vérifier les sources'}</button>
        {!imdbId && <p>Vérification impossible : identifiant du film indisponible.</p>}
        {search.isSuccess && <p role='status'>{(search.data.Found ?? search.data.found) ? 'Sources trouvées. Le téléchargement dépend des règles du serveur et de leur disponibilité.' : 'Aucun résultat retourné pour le moment. Certains indexeurs peuvent être indisponibles. Vous pouvez demander ce film.'}</p>}
        {search.isError && <p role='status'>Vérification indisponible pour le moment. Réessayez plus tard.</p>}
    </div>;
}

/* eslint-enable react/jsx-no-bind */
