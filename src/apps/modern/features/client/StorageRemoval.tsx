/* eslint-disable react/jsx-no-bind -- Actions belong to this confirmation dialog. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import React, { useState } from 'react';

import { useApi } from 'hooks/useApi';

import { ChoiceSelect, type Option } from './ui/controls';
import ClientDialog from './ClientDialog';
import { formatSize } from './mediaInfo';
import { resolveCatalogueArtwork } from './catalogArtwork';
import { externalIdentity } from './seerr/model';
import { useSharedCatalog } from './sharedCatalog';
import { useCatalogArtworkLookup } from './useCatalogArtwork';
import { useLocalSeasons } from './seerr/queries';
import { ActionButton } from './ui';

type Plan = { revision: string; bytes: number; files: { id: number; name: string; size: number }[] };
type Capabilities = { radarr?: boolean; sonarr?: boolean };
type Props = Readonly<{ item: BaseItemDto }>;

const messages: Record<string, string> = {
    notConfigured: 'Le retrait des fichiers n’est pas configuré pour ce serveur.',
    unmanaged: 'Impossible d’identifier ce titre avec certitude dans Radarr ou Sonarr.',
    queued: 'Un téléchargement est déjà en file pour ce titre. Traitez-le avant de réessayer.',
    queueUnknown: 'Impossible de vérifier la file de téléchargements.',
    playing: 'Le titre est en cours de lecture ou en pause. Fermez la lecture pour continuer.',
    filesChanged: 'Les fichiers ont changé. Vérifiez la nouvelle liste avant de confirmer.',
    monitoring: 'Le service n’a pas confirmé l’arrêt de la surveillance. Vérifiez ses réglages.',
    sharedFile: 'Un même fichier appartient à deux saisons. Choisissez la série entière pour le retirer.',
    noFiles: 'Aucun fichier correspondant à cette sélection.',
    busy: 'Un retrait est déjà en cours. Réessayez dans un instant.',
    checkPartial: 'Le service n’a pas confirmé le retrait complet. Vérifiez les fichiers restants avant de réessayer.'
};

function message(error: unknown) {
    const code = isAxiosError<{ code?: string }>(error) ? error.response?.data?.code : undefined;
    return (code && messages[code]) || 'Impossible de joindre le service de retrait.';
}

function useStorageApi() {
    const { api, user } = useApi();
    return {
        key: ['SharedCatalogStorage', api?.basePath, user?.Id],
        async call<T>(path: string, signal?: AbortSignal, data?: unknown) {
            if (!api) throw new Error('Missing server');
            const response = await api.axiosInstance.request<T>({
                url: `${api.basePath}/SharedCatalog/Storage/${path}`,
                method: data ? 'POST' : 'GET', signal, data,
                timeout: data ? 190000 : 60000,
                headers: { Authorization: `MediaBrowser Token="${api.accessToken}"` }
            });
            return response.data;
        }
    };
}

export function useStorageRemovalAvailable(item: BaseItemDto, enabled: boolean) {
    const storage = useStorageApi();
    const query = useQuery({
        queryKey: [...storage.key, 'Capabilities'],
        enabled,
        queryFn: ({ signal }) => storage.call<Capabilities>('Capabilities', signal),
        staleTime: 60000,
        retry: false
    });
    return item.Type === 'Movie' ? query.data?.radarr === true : item.Type === 'Series' && query.data?.sonarr === true;
}

export default function StorageRemoval({ item, onClose }: Props & Readonly<{ onClose: () => void }>) {
    const series = item.Type === 'Series';
    const seasons = useLocalSeasons(series ? item : undefined);
    const [selection, select] = useState('');
    const season = selection === '' ? undefined : Number(selection);
    const storage = useStorageApi();
    const cache = useQueryClient();
    const catalogue = useSharedCatalog();
    const lookup = useCatalogArtworkLookup();
    const target = season === undefined ? item.Id || '' : item.Id + '?season=' + season;
    const plan = useQuery({
        queryKey: [...storage.key, item.Id, season],
        enabled: !!item.Id,
        queryFn: ({ signal }) => storage.call<Plan>(target, signal),
        staleTime: Infinity,
        retry: false
    });
    const removal = useMutation({
        mutationFn: async (selected: Plan) => {
            const identity = externalIdentity(item);
            const existing = catalogue.data?.find(entry => entry.type === identity?.type && entry.id === identity.id);
            const artwork = identity ? await resolveCatalogueArtwork(identity, existing, lookup) : undefined;
            return storage.call<void>(item.Id!, undefined, { revision: selected.revision, season, artwork });
        },
        onSuccess: () => {
            void cache.invalidateQueries({ queryKey: ['SharedCatalog'] });
            void cache.invalidateQueries({ queryKey: ['Client'] });
            void cache.invalidateQueries({ predicate: query => query.queryKey.includes('LocalIdentities') });
        }
    });
    const current = plan.data;
    const pending = removal.isPending;
    const done = removal.isSuccess;
    const refresh = () => {
        removal.reset();
        void plan.refetch();
    };
    return <ClientDialog controlled={{ open: true, onClose: pending ? () => undefined : onClose }}
        label='Retirer les fichiers' title='Retirer les fichiers' subtitle={item.Name || ''}>
        <div className='client-media-info'>
            {done ? <p role='status'>Les fichiers ont été retirés. La fiche reste dans le catalogue partagé. La disponibilité se mettra à jour après l’analyse de la bibliothèque.</p> : <>
                {series && <ChoiceSelect label='Saisons à retirer' value={selection} disabled={pending} options={[
                    ['', 'Série entière'],
                    ...(seasons.data || []).flatMap((entry): Option<string>[] => entry.IndexNumber == null ? [] :
                        [[String(entry.IndexNumber), entry.Name || `Saison ${entry.IndexNumber}`]])
                ]} onChange={value => {
                    removal.reset();
                    select(value);
                }} />}
                <p>La fiche restera dans le catalogue. Radarr ou Sonarr arrêtera de surveiller cette sélection avant de supprimer ses fichiers.</p>
                {plan.isFetching && <p role='status'>Vérification des fichiers et des téléchargements…</p>}
                {plan.isError && <p role='alert'>{message(plan.error)}</p>}
                {removal.isError && <p role='alert'>{message(removal.error)}</p>}
                {current && !plan.isError && <section>
                    <h3>{current.files.length} fichier{current.files.length === 1 ? '' : 's'} · {formatSize(current.bytes)}</h3>
                    <ul>{current.files.map(file => <li key={file.id}>{file.name}</li>)}</ul>
                    <p>L’espace libéré peut être inférieur si le téléchargement d’origine est encore partagé.</p>
                </section>}
            </>}
            <div className='client-actions'>
                <ActionButton disabled={pending} onClick={onClose}>{done ? 'Fermer' : 'Annuler'}</ActionButton>
                {!done && (plan.isError || removal.isError) && <ActionButton onClick={refresh}>Vérifier à nouveau</ActionButton>}
                {!done && !removal.isError && <ActionButton disabled={!current || plan.isError || plan.isFetching || pending}
                    onClick={() => { if (current) removal.mutate(current); }}>{pending ? 'Retrait en cours…' : 'Confirmer la suppression des fichiers'}</ActionButton>}
            </div>
        </div>
    </ClientDialog>;
}

/* eslint-enable react/jsx-no-bind */
