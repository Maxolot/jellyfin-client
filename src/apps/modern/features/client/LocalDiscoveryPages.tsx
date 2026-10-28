/* eslint-disable react/jsx-no-bind -- Local filter controls and selection rendering. */
import type { BaseItemDto, NameGuidPair } from '@jellyfin/sdk/lib/generated-client';
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type Rows = (title: string, items: BaseItemDto[]) => React.ReactNode;

export function RecentPage({ items, row }: { readonly items: BaseItemDto[]; readonly row: Rows }) {
    const [days, setDays] = useState(0);
    const since = Date.now() - days * 86400000;
    const selection = items.filter(item => !days || (item.DateCreated && Date.parse(item.DateCreated) >= since));
    return <div className='client-recent-page'><header className='client-page-heading'><h1>Nouveautés</h1><p>Les derniers films et séries arrivés dans votre bibliothèque.</p></header><div className='client-period-choices' aria-label='Période des ajouts'>{[[0, 'Tous les ajouts'], [7, '7 derniers jours'], [30, '30 derniers jours']].map(([value, label]) => <button key={value} aria-pressed={days === value} onClick={() => setDays(Number(value))}>{label}</button>)}</div>
        {row('Nouveaux films', selection.filter(item => item.Type === 'Movie'))}{row('Nouvelles séries', selection.filter(item => item.Type === 'Series'))}
        {!selection.length && <p className='client-message'>Aucun ajout récent dans cette sélection.</p>}
    </div>;
}

export function TonightPage({ items, genres, row }: { readonly items: BaseItemDto[]; readonly genres: NameGuidPair[]; readonly row: Rows }) {
    const [params, setParams] = useSearchParams();
    const [genre, setGenre] = useState(params.get('genre') || '');
    const [minutes, setMinutes] = useState(Number(params.get('minutes')) || 0);
    const limit = Number(params.get('minutes')) || 0;
    const selection = items.filter(item => !limit || (item.RunTimeTicks && item.RunTimeTicks <= limit * 6e8));
    return <div className='client-tonight-page'><header className='client-page-heading'><h1>Qu’avez-vous envie de regarder ?</h1><p>Choisissez une ambiance et le temps que vous avez devant vous.</p></header><div className='client-tonight-layout'><form className='client-tonight-form' onSubmit={event => {
        event.preventDefault();
        setParams({ view: 'tonight', genre, minutes: String(minutes) });
    }}><h2>Votre séance de ce soir</h2><fieldset><legend>Une envie particulière ?</legend><div className='client-mood-choices'><button type='button' aria-pressed={!genre} onClick={() => setGenre('')}>Surprenez-moi</button>{genres.slice(0, 10).map(entry => <button type='button' key={entry.Id || entry.Name} aria-pressed={genre === entry.Name} onClick={() => setGenre(entry.Name || '')}>{entry.Name}</button>)}</div></fieldset><fieldset><legend>Le temps d’un film</legend><div className='client-time-choices'>{[[0, 'Peu importe'], [90, '1 h 30 max'], [120, '2 h max']].map(([value, label]) => <button type='button' key={value} aria-pressed={minutes === value} onClick={() => setMinutes(Number(value))}>{label}</button>)}</div></fieldset><button className='client-play'>Trouver ma séance</button><p>Une sélection parmi vos films, sans service externe.</p></form><div className='client-tonight-results'><h2>Pour votre soirée</h2><p>{selection.length} films dans cette sélection</p>{row('À vous de choisir', selection.slice(0, 12))}{!selection.length && <p className='client-message'>Aucun film de cette sélection ne correspond. Essayez une autre ambiance ou une durée plus longue.</p>}</div></div></div>;
}
/* eslint-enable react/jsx-no-bind */
