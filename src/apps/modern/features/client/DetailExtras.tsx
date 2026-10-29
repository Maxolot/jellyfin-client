import type { BaseItemDto, BaseItemPerson } from '@jellyfin/sdk/lib/generated-client';
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

import Artwork from './Artwork';
import ClientDialog from './ClientDialog';

type Props = { similar: BaseItemDto[]; image: (item: BaseItemDto, backdrop?: boolean) => string };

export function CastAction({ item, basePath }: Readonly<{ item: BaseItemDto; basePath: string }>) {
    const people = (item.People || []).filter(person => person.Id);
    if (!people.length) return null;
    function personCard(person: BaseItemPerson, close: () => void) {
        const roles: Record<string, string> = { Director: 'Réalisation', Writer: 'Scénario', Actor: 'Interprétation', GuestStar: 'Interprétation' };
        const role = person.Role || roles[person.Type || ''] || person.Type;
        return <Link className='client-person' key={`${person.Id}-${person.Role || person.Type}`} to={`/client?view=search&person=${person.Id}&personName=${encodeURIComponent(person.Name || '')}`} onClick={close}>
            <span className='client-person-portrait'>{person.PrimaryImageTag && <Artwork source={`${basePath}/Items/${person.Id}/Images/Primary?maxWidth=320&quality=85&tag=${encodeURIComponent(person.PrimaryImageTag)}`} />}<span>{person.Name?.slice(0, 1)}</span></span>
            <strong>{person.Name}</strong><small>{role}</small>
        </Link>;
    }
    return <ClientDialog label='Voir la distribution' title='Distribution et réalisation' subtitle={item.Name || ''} buttonClassName='client-cast-action'>{close => <div className='client-cast-grid'>{people.map(person => personCard(person, close))}</div>}</ClientDialog>;
}

export default function DetailExtras({ similar, image }: Readonly<Props>) {
    const location = useLocation();
    return <div className='client-detail-extras'>
        {similar.length > 0 && <section className='client-detail-recommendations'><h2>Dans le même esprit</h2><div className='client-related-grid'>{similar.map(media => <Link key={media.Id} className='client-card' data-client-focus={media.Id} to={`/client?id=${media.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state }} aria-label={media.Name || ''}>
            <Artwork source={image(media)} /><span className='client-card-fallback'>{media.Name}</span>
        </Link>)}</div></section>}
    </div>;
}
