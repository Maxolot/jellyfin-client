/* eslint-disable react/jsx-no-bind -- The dialog belongs to this section. */
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import CollectionCover, { useCoverPreview } from '../CollectionCover';
import ClientDialog from '../ClientDialog';
import ClientIcon from '../ClientIcon';
import { FolderNameForm } from './FolderForms';
import { useFolderPicker } from './FolderPicker';
import { type Folder, type FolderImage, folderItemId, folderPath, folderTitleCount, orderedFolderItems } from './model';
import { useFolderDetail, useFolderTargets, useFolderTitles } from './queries';

export default function FolderPanel({ image }: Readonly<{ image: FolderImage }>) {
    const folders = useFolderPicker()?.folders;
    const navigate = useNavigate();
    const [creating, setCreating] = useState(false);
    if (!folders) return null;
    return <section className='client-folders' aria-label='Dossiers de Ma liste'>
        <header className='client-folders-header'>
            <h3>Mes dossiers</h3>
            <button type='button' className='client-button' aria-haspopup='dialog' onClick={() => setCreating(true)}>
                <ClientIcon name='plus' />Nouveau dossier
            </button>
            <ClientDialog className='client-folder-modal' label='Nouveau dossier' title='Nouveau dossier' controlled={{ open: creating, onClose: () => setCreating(false) }}>
                {close => creating && <FolderNameForm onSave={created => {
                    close();
                    if (created) navigate(folderPath(created.id));
                }} />}
            </ClientDialog>
        </header>
        <FolderTiles folders={folders.filter(folder => folder.access === 'owner')} image={image} empty='Aucun dossier personnel.' />
        <h3>Partagées avec moi</h3>
        <FolderTiles folders={folders.filter(folder => folder.access !== 'owner')} image={image} empty='Aucun dossier partagé pour le moment.' shared />
        <h3 className='client-folder-favorites-heading'>Favoris</h3>
    </section>;
}

function FolderTiles({ folders, empty, image, shared = false }: Readonly<{ folders: Folder[]; empty: string; image: FolderImage; shared?: boolean }>) {
    const owners = useFolderTargets(shared && folders.length > 0);
    if (!folders.length) return <p className='client-folder-empty'>{empty}</p>;
    return <ul className='client-folder-tiles'>{folders.map(folder => <li key={folder.id}>
        <FolderTile folder={folder} image={image} owner={owners.data?.find(entry => folderItemId(entry.userId) === folderItemId(folder.ownerId))?.name} />
    </li>)}</ul>;
}

function FolderTile({ folder, image, owner }: Readonly<{ folder: Folder; image: FolderImage; owner?: string }>) {
    const tile = useRef<HTMLAnchorElement>(null);
    const nearby = useCoverPreview(tile);
    const detail = useFolderDetail(nearby ? folder.id : undefined);
    const entries = detail.data?.items.slice(0, 3);
    const preview = useFolderTitles(entries);
    const posters = entries && preview.data ? orderedFolderItems(entries, preview.data)
        .filter(({ item }) => item.ImageTags?.Primary || item.ImageTags?.Thumb || item.BackdropImageTags?.length) : [];
    const sharedBy = owner ? `Partagé par ${owner}` : 'Partagé avec moi';
    const badge = folder.access === 'owner' ? !!detail.data?.shares?.length && 'Partagé' : sharedBy;
    return <CollectionCover anchor={tile} className='client-folder-tile' to={folderPath(folder.id)} id={folder.id} name={folder.name}
        count={detail.data && folderTitleCount(detail.data.items.length)} badge={badge} posters={posters.map(({ item }) => image(item))}
        ready={detail.isSuccess && (!entries?.length || preview.isSuccess)} emptyLabel={folder.access === 'viewer' || detail.data?.items.length ? undefined : 'Ajoutez un titre'} />;
}

/* eslint-enable react/jsx-no-bind */
