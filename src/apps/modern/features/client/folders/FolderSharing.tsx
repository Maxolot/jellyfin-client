import React, { useState } from 'react';

import { useApi } from 'hooks/useApi';

import ClientIcon from '../ClientIcon';
import { profileTone } from '../profiles/profileStore';
import { folderSharing, type Folder, type FolderShare, type FolderTarget } from './model';
import './folderSharing.scss';

export default function FolderSharing({ folder, shares, targets }: Readonly<{ folder: Folder; shares?: FolderShare[] | null; targets?: FolderTarget[] }>) {
    const { api } = useApi();
    const sharing = folderSharing(folder, shares, targets);
    if (!sharing) return null;
    return <span className='client-folder-sharing' title={sharing.accessible} aria-label={sharing.accessible} role='img'>
        <ClientIcon name='people' />
        <span className='client-folder-avatar-stack' aria-hidden='true'>
            {sharing.people.map(person => <FolderAvatar key={person.id} id={person.id} name={person.name} basePath={api?.basePath} />)}
            {sharing.extra > 0 && <span className='client-folder-avatar client-folder-avatar-extra'>+{sharing.extra}</span>}
        </span>
        <span aria-hidden='true'>{sharing.label}</span>
        {folder.access === 'viewer' && <ClientIcon name='lock' />}
    </span>;
}

function FolderAvatar({ id, name, basePath }: Readonly<{ id: string; name?: string; basePath?: string }>) {
    const [failed, setFailed] = useState(false);
    const image = basePath && name && !failed ? `${basePath}/Users/${encodeURIComponent(id)}/Images/Primary?width=64&quality=85` : '';
    const initials = name?.trim().slice(0, 1).toLocaleUpperCase('fr') || '?';
    return <span className='client-folder-avatar' style={{ backgroundColor: profileTone(id) }} title={name}>
        {initials}
        {image && <img src={image} alt='' loading='lazy' decoding='async'
            // eslint-disable-next-line react/jsx-no-bind -- The fallback belongs to this avatar.
            onError={() => setFailed(true)} />}
    </span>;
}
