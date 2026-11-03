import React from 'react';
import { Link, useLocation } from 'react-router-dom';

import Artwork from './Artwork';
import { imageUrl, isExternal, mediaLabel, type CatalogueItem } from './seerr/model';

type Upcoming = { date: string; item: CatalogueItem };
type NavigationState = { returnTo?: string, returnState?: NavigationState | null };

function releaseDate(date: string) {
    return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

// Grandes affiches verticales de la maquette : date et nature restent visibles, le titre est porté par l'affiche.
export default function UpcomingRow({ items }: Readonly<{ items: Upcoming[] }>) {
    const location = useLocation();
    if (!items.length) return null;
    return <section className='client-row client-upcoming' aria-label='Bientôt à découvrir'>
        <header className='client-row-heading'><h2>Bientôt à découvrir</h2></header>
        <div className='client-upcoming-strip'>{items.map(({ date, item }) => {
            const poster = imageUrl(item.Seerr?.posterPath).replace('/w500/', '/w780/');
            const status = isExternal(item) ? mediaLabel(item.Seerr?.mediaInfo) : 'Disponible';
            return <Link key={item.Id} className='client-upcoming-card' data-client-focus={item.Id} to={`/client?id=${item.Id}`}
                state={{ returnTo: location.pathname + location.search, returnState: location.state as NavigationState | null }}
                aria-label={`${item.Name}, ${item.Type === 'Series' ? 'série' : 'film'}, le ${releaseDate(date)}`}>
                <Artwork source={poster} />
                <span className='client-card-fallback'>{item.Name}</span>
                <span className='client-upcoming-shade' aria-hidden='true' />
                <span className='client-upcoming-date'>{releaseDate(date)}</span>
                <small className='client-upcoming-kind'>{item.Type === 'Series' ? 'Nouvelle série' : 'Sortie du film'}{status !== 'À demander' ? ` · ${status}` : ''}</small>
            </Link>;
        })}</div>
    </section>;
}
