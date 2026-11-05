/* eslint-disable react/jsx-no-bind -- Choices are local to this page. */
import React, { useEffect, useMemo, useState } from 'react';

import { groupGallery, parseGallery, type GalleryAvatar } from './avatars';

type Props = { manifest: string; name: string; busy: boolean; problem: string; choose: (avatar: GalleryAvatar) => void; cancel: () => void };

/** The gallery of pictures offered for one profile. */
export default function AvatarPicker({ manifest, name, busy, problem, choose, cancel }: Readonly<Props>) {
    const [avatars, setAvatars] = useState<GalleryAvatar[]>();
    const [failed, setFailed] = useState(false);
    const [search, setSearch] = useState('');
    useEffect(() => {
        let left = false;
        const address = new URL(manifest, document.baseURI).href;
        fetch(address).then(response => {
            if (!response.ok) throw new Error(String(response.status));
            return response.json();
        }).then(data => {
            if (!left) setAvatars(parseGallery(data, address));
        }).catch(() => {
            if (!left) setFailed(true);
        });
        return () => {
            left = true;
        };
    }, [manifest]);
    const groups = useMemo(() => groupGallery(avatars || [], search), [avatars, search]);
    return <section className='client-avatar-picker' aria-label={`Photo de ${name}`}>
        <header>
            <h1>Photo de {name}</h1>
            <button type='button' disabled={busy} onClick={cancel}>Annuler</button>
        </header>
        <input type='search' aria-label='Chercher une photo' placeholder='Chercher un personnage ou une série' value={search} disabled={busy} onChange={event => setSearch(event.target.value)} />
        {problem && <p role='alert' className='client-profile-error'>{problem}</p>}
        {failed && <p role='alert' className='client-profile-error'>La galerie de photos est indisponible.</p>}
        {avatars && !groups.length && <p>Aucune photo ne correspond.</p>}
        {groups.map(group => <div key={group.collection}>
            <h2>{group.collection}</h2>
            <ul>{group.items.map(avatar => <li key={avatar.id}>
                <button type='button' title={avatar.name} aria-label={avatar.name} disabled={busy} onClick={() => choose(avatar)}><img src={avatar.url} alt='' loading='lazy' decoding='async' /></button>
            </li>)}</ul>
        </div>)}
    </section>;
}
/* eslint-enable react/jsx-no-bind */
