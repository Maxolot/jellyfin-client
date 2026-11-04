/* eslint-disable react/jsx-no-bind -- Personal-library filters are local to this surface. */
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import Artwork from './Artwork';
import ClientSkeleton from './ClientSkeleton';
import { artworkUrl } from './artwork';
import { loadRatedItems, personalStars } from './ratings';
import { clientRequest } from './session';

function RatedLibrary() {
    const { api, user } = useApi();
    const location = useLocation();
    const [type, setType] = useState('');
    const [limit, setLimit] = useState(24);
    const ratings = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Rated'],
        queryFn: ({ signal }) => clientRequest(() => loadRatedItems(api!, user!.Id!, signal)),
        staleTime: 30000,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true
    });
    const items = (ratings.data || []).filter(item => !type || item.Type === type);
    return <section className='client-rated-section' id='client-ratings' aria-label='Mes notes'>
        <header><h2>Mes notes</h2><select aria-label='Filtrer mes notes' value={type} onChange={event => {
            setType(event.target.value);
            setLimit(24);
        }}><option value=''>Films et séries</option><option value='Movie'>Films</option><option value='Series'>Séries</option></select></header>
        {ratings.isPending && <ClientSkeleton layout='grid' contained label='Chargement de vos notes…' />}
        {ratings.isFetching && !ratings.isPending && <p role='status'>Actualisation de vos notes…</p>}
        {ratings.isError && <p role='alert'>Impossible de charger vos notes. <button onClick={() => { void ratings.refetch(); }}>Réessayer</button></p>}
        {ratings.isSuccess && !items.length && <p>{type ? 'Aucun titre noté dans cette catégorie.' : 'Notez un film ou une série depuis sa fiche pour le retrouver ici.'}</p>}
        <div className='client-grid'>{items.slice(0, limit).map(item => <Link className='client-card client-rated-card' key={item.Id} data-client-focus={`rating-${item.Id}`} aria-label={`${item.Name} · Votre note : ${personalStars(item)!.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} sur 5`} to={`/client?id=${item.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state }}>
            <Artwork source={artworkUrl(api!.basePath, item)} /><span className='client-personal-score'>★ {personalStars(item)!.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/5</span>
        </Link>)}</div>
        {items.length > limit && <button className='client-button' onClick={() => setLimit(value => value + 24)}>Voir plus de titres notés</button>}
    </section>;
}

export default function RatingsOverview() {
    const { api, user } = useApi();
    if (!api || !user?.Id) return null;
    return <RatedLibrary key={`${api.basePath}/${user.Id}`} />;
}
/* eslint-enable react/jsx-no-bind */
