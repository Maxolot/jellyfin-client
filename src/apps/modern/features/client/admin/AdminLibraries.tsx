/* eslint-disable react/jsx-no-bind -- Row actions are local closures. */
import type { VirtualFolderInfo } from '@jellyfin/sdk/lib/generated-client';
import React from 'react';

import { useApi } from 'hooks/useApi';

import { SaveNote, SettingCard, StatusBadge, Toggle } from '../settings/controls';
import { serverAdminUrl } from '../session/ServerInterfacePage';
import ConfirmButton from './ConfirmButton';
import { useScanLibraries, useTrickplayOptions, useVirtualFolders } from './useAdmin';
import './admin.scss';

const KINDS: Record<string, string> = { movies: 'Films', tvshows: 'Séries', music: 'Musique', homevideos: 'Vidéos personnelles', boxsets: 'Collections', books: 'Livres', mixed: 'Mixte', musicvideos: 'Clips' };

function Library({ folder }: Readonly<{ folder: VirtualFolderInfo }>) {
    const scan = useScanLibraries();
    const trickplay = useTrickplayOptions();
    const options = folder.LibraryOptions;
    const active = folder.RefreshStatus === 'Active';
    const progress = Math.round(folder.RefreshProgress || 0);
    const extraction = !!options?.EnableTrickplayImageExtraction;
    const duringScan = !!options?.ExtractTrickplayImagesDuringLibraryScan;
    return <SettingCard title={folder.Name || 'Bibliothèque'} description={[KINDS[folder.CollectionType || ''] || 'Autre', `${folder.Locations?.length || 0} dossier${(folder.Locations?.length || 0) > 1 ? 's' : ''}`].join(' · ')}
        aside={active ? <StatusBadge tone='busy'>Analyse {progress} %</StatusBadge> : <StatusBadge tone='ok'>À jour</StatusBadge>}>
        {active && <div className='client-admin-progress' role='progressbar' aria-label={`Analyse de ${folder.Name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div>}
        <ul className='client-setting-list'>{(folder.Locations || []).map(path => <li key={path}><span><small>{path}</small></span></li>)}</ul>
        {options && folder.ItemId && <>
            <Toggle label='Aperçus de navigation' hint='Vignettes affichées au survol de la barre de lecture.' checked={extraction} disabled={trickplay.isPending}
                onChange={value => trickplay.mutate({ id: folder.ItemId!, extraction: value, duringScan })} />
            {extraction && <Toggle label='Les générer pendant l’analyse' hint='Sinon, la tâche planifiée s’en charge plus tard.' checked={duringScan} disabled={trickplay.isPending}
                onChange={value => trickplay.mutate({ id: folder.ItemId!, extraction, duringScan: value })} />}
            <SaveNote state={trickplay} error='Le réglage n’a pas été enregistré.' />
        </>}
        <div className='client-settings-actions'>
            {folder.ItemId && <button type='button' className='client-settings-button' disabled={active || scan.isPending} onClick={() => scan.mutate(folder.ItemId!)}>Analyser cette bibliothèque</button>}
            {scan.isError && <p className='client-save-note is-error' role='status'>L’analyse n’a pas pu démarrer.</p>}
        </div>
    </SettingCard>;
}

/** Administration, libraries: scans and the preview images of each library. */
export default function AdminLibraries() {
    const { user } = useApi();
    const folders = useVirtualFolders();
    const scan = useScanLibraries();
    if (!user?.Policy?.IsAdministrator) return null;
    return <div className='client-admin'>
        <SettingCard title='Toutes les bibliothèques' description='Cherche les nouveaux fichiers et ceux qui ont disparu, puis met les fiches à jour.'>
            <div className='client-settings-actions'>
                <ConfirmButton danger={false} label='Analyser toutes les bibliothèques' confirm='Confirmer l’analyse complète' busy={scan.isPending} onConfirm={() => scan.mutate(undefined)} />
                {scan.isSuccess && <p className='client-save-note' role='status'>Analyse lancée.</p>}
                <a className='client-settings-button' href={serverAdminUrl('dashboard/libraries')}>Ajouter ou modifier des dossiers</a>
            </div>
        </SettingCard>
        {folders.isError && <p className='client-setting-note is-error' role='alert'>Les bibliothèques n’ont pas pu être lues.</p>}
        {folders.isPending && <p className='client-setting-note'>Chargement…</p>}
        {(folders.data || []).map(folder => <Library key={folder.ItemId || folder.Name} folder={folder} />)}
    </div>;
}
/* eslint-enable react/jsx-no-bind */
