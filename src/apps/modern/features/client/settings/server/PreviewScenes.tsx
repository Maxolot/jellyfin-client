/* eslint-disable react/jsx-no-bind -- The scene editor owns its inputs. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { LocationType } from '@jellyfin/sdk/lib/generated-client/models/location-type';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';

import { useApi } from 'hooks/useApi';

import { SaveNote, Select, SettingCard, TextField, Toggle } from '../controls';
import { EXTENSIONS } from './extensions';
import { type PreviewScene, sameItem, sceneProblem, sceneState } from './sceneModel';
import { useExtensionEndpoint } from './useServerExtensions';

function useTitles(search: string, parentId?: string, ids?: string[]) {
    const { api, user } = useApi();
    return useQuery({ queryKey: ['ClientPreviewTitles', api?.basePath, user?.Id, search, parentId, ids],
        enabled: !!api && !!user?.Policy?.IsAdministrator && (!!parentId || !!ids?.length || search.trim().length >= 2),
        queryFn: async ({ signal }) => (await getLibraryApi(api!).getItems({ userId: user!.Id, searchTerm: search.trim() || undefined,
            parentId, ids, recursive: true, includeItemTypes: parentId ? [BaseItemKind.Episode] : [BaseItemKind.Movie, BaseItemKind.Series, BaseItemKind.Episode],
            limit: ids?.length || (parentId ? 1000 : 50), excludeLocationTypes: [LocationType.Virtual] }, { signal })).data.Items || [] });
}

function SceneEditor({ item, existing, refresh }: Readonly<{ item: BaseItemDto; existing?: PreviewScene; refresh: () => Promise<unknown> }>) {
    const { api } = useApi();
    const episodes = useTitles('', item.Type === 'Series' ? item.Id : undefined);
    const [source, setSource] = useState(existing?.SourceItemId.replace(/-/g, '') || '');
    const [start, setStart] = useState(String(existing?.StartSeconds || 0));
    const [duration, setDuration] = useState(String(existing?.DurationSeconds || 20));
    const [approved, setApproved] = useState(existing?.Approved || false);
    const [problem, setProblem] = useState('');
    const file = useRef<HTMLInputElement>(null);
    const sourceItem = item.Type === 'Series' ? episodes.data?.find(entry => entry.Id === source) : item;
    const save = useMutation({ mutationFn: async (body: unknown) => {
        await api!.axiosInstance.post(`${api!.basePath}/NativePreviews/Admin/Scenes/${item.Id}`, body, { headers: { Authorization: api!.authorizationHeader } });
    }, onSuccess: refresh });
    const upload = useMutation({ mutationFn: async (clip: File) => {
        const body = new FormData();
        body.append('file', clip);
        await api!.axiosInstance.post(`${api!.basePath}/NativePreviews/Admin/Imports/${item.Id}`, body,
            { params: { approved: true, sourceItemId: source || undefined }, headers: { Authorization: api!.authorizationHeader } });
    }, onSuccess: refresh });
    const busy = save.isPending || upload.isPending;
    return <form noValidate onSubmit={event => {
        event.preventDefault();
        const invalid = sceneProblem(Number(start), Number(duration), sourceItem?.RunTimeTicks);
        setProblem(invalid);
        if (invalid) return;
        save.mutate({ StartSeconds: Number(start), DurationSeconds: Number(duration), SourceItemId: source || null, Approved: approved });
    }}>
        <p className='client-setting-note'>{item.Type === 'Series' ? 'Choisissez l’épisode qui fournit l’extrait de cette série.' : 'La scène est extraite de ce fichier local.'} Les scènes choisies peuvent révéler l’intrigue : vérifiez-les avant de les approuver.</p>
        {item.Type === 'Series' && <Select label='Épisode source' value={source} disabled={busy}
            options={[[source, source ? (episodes.data?.find(entry => entry.Id === source)?.Name || 'Épisode enregistré') : 'Premier épisode de la saison 1'], ...(source ? [['', 'Premier épisode de la saison 1'] as const] : []), ...(episodes.data || []).filter(entry => entry.Id !== source).map(entry => [entry.Id!, `S${entry.ParentIndexNumber || 0}:E${entry.IndexNumber || 0} · ${entry.Name}`] as const)]}
            onChange={setSource} />}
        <TextField label='Début de la scène (secondes)' value={start} type='number' disabled={busy} onChange={setStart} />
        <TextField label='Durée de la scène (secondes)' hint='De 1 à 30 secondes.' value={duration} type='number' disabled={busy} onChange={setDuration} />
        <Toggle label='Scène approuvée pour diffusion' hint='Une scène non approuvée reste enregistrée mais n’est ni préparée ni diffusée.' checked={approved} disabled={busy} onChange={setApproved} />
        <div className='client-settings-actions'>
            <button type='submit' className='client-settings-button-primary' disabled={busy}>{approved ? 'Approuver et préparer' : 'Enregistrer sans diffuser'}</button>
            <button type='button' className='client-settings-button' disabled={busy || !approved} onClick={() => file.current?.click()}>Importer un extrait</button>
            <input ref={file} type='file' accept='video/*' hidden aria-label='Fichier de l’extrait' onChange={event => {
                const clip = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (!clip) return;
                if (clip.size > 32 * 1024 * 1024 || !clip.size) {
                    setProblem('Choisissez un extrait vidéo de 1 à 30 secondes, de 32 Mo maximum.');
                    return;
                }
                setProblem('');
                upload.mutate(clip);
            }} />
        </div>
        <p className='client-setting-note'>L’import remplace la scène choisie par un fichier vidéo approuvé de 1 à 30 secondes (32 Mo maximum). Le serveur crée les deux qualités automatiquement.</p>
        {problem && <p role='alert' className='client-setting-note is-error'>{problem}</p>}
        <SaveNote state={save} error='La scène n’a pas pu être enregistrée. Vérifiez le titre et la durée.' />
        <SaveNote state={upload} error='L’import a échoué : vérifiez la vidéo, sa durée et l’espace libre du serveur.' />
    </form>;
}

export default function PreviewScenes() {
    const cache = useQueryClient();
    const { api } = useApi();
    const scenes = useExtensionEndpoint<PreviewScene[]>(EXTENSIONS.previews, 'NativePreviews/Admin/Scenes', true);
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [selected, setSelected] = useState<BaseItemDto>();
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(search), 300);
        return () => clearTimeout(timer);
    }, [search]);
    const titles = useTitles(debounced);
    const known = useTitles('', undefined, scenes.data?.map(scene => scene.ItemId));
    const refresh = () => cache.invalidateQueries({ queryKey: ['ClientServerExtensions', api?.basePath] });
    return <SettingCard title='Scènes et extraits' scope='server' description='Choisissez les scènes à montrer, ou importez vos propres extraits approuvés.'>
        <TextField label='Rechercher un film, une série ou un épisode' value={search} onChange={setSearch} />
        {debounced.trim().length >= 2 && <div className='client-scene-results'>
            {titles.isFetching && <p role='status'>Recherche…</p>}
            {titles.isError && <p role='alert'>La recherche n’a pas abouti.</p>}
            {titles.data?.map(item => <button type='button' className='client-settings-button' key={item.Id} aria-pressed={selected?.Id === item.Id} onClick={() => setSelected(item)}>{item.SeriesName ? `${item.SeriesName} · ` : ''}{item.Name}{item.ProductionYear ? ` (${item.ProductionYear})` : ''}</button>)}
            {titles.data?.length === 0 && <p>Aucun titre local trouvé.</p>}
        </div>}
        {selected && scenes.data && <div className='client-scene-editor'><h4>{selected.Name}</h4><SceneEditor key={selected.Id} item={selected} existing={scenes.data?.find(scene => sameItem(scene.ItemId, selected.Id))} refresh={refresh} /></div>}
        {scenes.isError && <p role='alert'>La liste des scènes n’a pas pu être chargée.</p>}
        {!!scenes.data?.length && <><h4>Scènes enregistrées</h4><ul className='client-setting-list'>{scenes.data.map(scene => {
            const item = known.data?.find(entry => sameItem(entry.Id, scene.ItemId));
            return <li key={scene.ItemId}><span><strong>{item?.Name || 'Titre enregistré'}</strong><small>{sceneState(scene.State)} · {scene.DurationSeconds} s · {scene.Approved ? 'Approuvée' : 'Non approuvée'}{scene.Automatic ? ' · Automatique' : ''}</small></span>
                {item && <button type='button' className='client-settings-button' onClick={() => setSelected(item)}>Modifier</button>}</li>;
        })}</ul></>}
    </SettingCard>;
}
/* eslint-enable react/jsx-no-bind */
