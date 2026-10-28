/* eslint-disable react/jsx-no-bind -- Local dialog and links do not cross memoized boundaries. */
import type { BaseItemDto, BaseItemPerson } from '@jellyfin/sdk/lib/generated-client';
import React, { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';

import Artwork from './Artwork';

type Props = { item: BaseItemDto; basePath: string; similar: BaseItemDto[]; image: (item: BaseItemDto, backdrop?: boolean) => string };

export default function DetailExtras({ item, basePath, similar, image }: Readonly<Props>) {
    const dialog = useRef<HTMLDialogElement>(null);
    const location = useLocation();
    const people = (item.People || []).filter(person => person.Id);
    const cast = people.filter(person => person.Type === 'Actor' || person.Type === 'GuestStar');
    const directors = people.filter(person => person.Type === 'Director');
    function personCard(person: BaseItemPerson) {
        return <Link className='client-person' key={`${person.Id}-${person.Role || person.Type}`} to={`/client?view=search&person=${person.Id}&personName=${encodeURIComponent(person.Name || '')}`} onClick={() => dialog.current?.close()}>
            <span className='client-person-portrait'>{person.PrimaryImageTag && <Artwork source={`${basePath}/Items/${person.Id}/Images/Primary?maxWidth=320&quality=85&tag=${encodeURIComponent(person.PrimaryImageTag)}`} />}<span>{person.Name?.slice(0, 1)}</span></span>
            <strong>{person.Name}</strong><small>{person.Role || person.Type}</small>
        </Link>;
    }
    return <div className='client-detail-extras'>
        {people.length > 0 && <section className='client-cast-section'><header><h2>Distribution et réalisation</h2><button onClick={() => dialog.current?.showModal()}>Voir la distribution ›</button></header>
            {directors.length > 0 && <p className='client-directors'>Réalisation <span>{directors.map(person => <Link key={person.Id} to={`/client?view=search&person=${person.Id}&personName=${encodeURIComponent(person.Name || '')}`}>{person.Name}</Link>)}</span></p>}
            <div className='client-cast-strip'>{cast.slice(0, 12).map(personCard)}</div>
            <dialog ref={dialog} className='client-cast-dialog'><header><div><small>{item.Name}</small><h2>Distribution et réalisation</h2></div><button aria-label='Fermer la distribution' onClick={() => dialog.current?.close()}>×</button></header><div className='client-cast-grid'>{people.map(personCard)}</div></dialog>
        </section>}
        {similar.length > 0 && <section className='client-detail-recommendations'><h2>Dans le même esprit</h2><div className='client-related-grid'>{similar.map(media => <Link key={media.Id} className='client-card' data-client-focus={media.Id} to={`/client?id=${media.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state }} aria-label={media.Name || ''}>
            <Artwork source={image(media)} /><span className='client-card-fallback'>{media.Name}</span>
        </Link>)}</div></section>}
    </div>;
}
/* eslint-enable react/jsx-no-bind */
