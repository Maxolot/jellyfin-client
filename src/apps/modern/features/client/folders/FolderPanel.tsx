/* eslint-disable react/jsx-no-bind -- The dialog belongs to this section. */
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import CollectionCover, { useCoverPreview } from '../CollectionCover';
import ClientDialog from '../ClientDialog';
import ClientIcon from '../ClientIcon';
import FolderSharing from './FolderSharing';
import { FolderNameForm } from './FolderForms';
import { useFolderPicker } from './FolderPicker';
import { type Folder, type FolderImage, type FolderTarget, folderPath, folderTitleCount, hasFolderPoster, orderedFolderItems, personalFoldersFirst, shelfPoster } from './model';
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
        <FolderTiles folders={personalFoldersFirst(folders)} image={image} />
        <h3 className='client-folder-favorites-heading'>Favoris</h3>
    </section>;
}

function FolderTiles({ folders, image }: Readonly<{ folders: Folder[]; image: FolderImage }>) {
    const targets = useFolderTargets(folders.length > 0);
    if (!folders.length) return <p className='client-folder-empty'>Aucun dossier pour le moment.</p>;
    return <ul className='client-folder-tiles'>{folders.map(folder => <li key={folder.id}>
        <FolderTile folder={folder} image={image} targets={targets.data} />
    </li>)}</ul>;
}

function FolderTile({ folder, image, targets }: Readonly<{ folder: Folder; image: FolderImage; targets?: FolderTarget[] }>) {
    const tile = useRef<HTMLAnchorElement>(null);
    const nearby = useCoverPreview(tile);
    const detail = useFolderDetail(nearby ? folder.id : undefined);
    const entries = detail.data?.items.slice(0, 3);
    const preview = useFolderTitles(entries);
    const posters = entries && preview.data ? orderedFolderItems(entries, preview.data)
        .filter(({ item }) => hasFolderPoster(item)) : [];
    return <CollectionCover anchor={tile} className='client-folder-tile' to={folderPath(folder.id)} id={folder.id} name={folder.name}
        count={detail.data && folderTitleCount(detail.data.items.length)} badge={folder.access !== 'owner' || !!detail.data?.shares?.length ? <FolderSharing folder={folder} shares={detail.data?.shares} targets={targets} /> : undefined} posters={posters.map(({ item }) => shelfPoster(item, image)).filter(Boolean)}
        ready={detail.isSuccess && (!entries?.length || preview.isSuccess)} emptyLabel={folder.access === 'viewer' || detail.data?.items.length ? undefined : 'Ajoutez un titre'} />;
}

/* eslint-enable react/jsx-no-bind */
