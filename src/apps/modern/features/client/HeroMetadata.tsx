import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

import { personPath } from './person/model';

import FilmFinish from './FilmFinish';
import LanguageTags from './LanguageTags';
import { releaseDateLabel, runtimeLabel } from './model';

export default function HeroMetadata({ item, detailed }: { readonly item: BaseItemDto; readonly detailed: boolean }) {
    const kind = item.Type === 'Movie' ? 'Film' : 'Série';
    const dateKind = item.Type === 'Movie' ? 'Sortie' : 'Première diffusion';
    const date = detailed ? `${dateKind} : ${releaseDateLabel(item.PremiereDate, item.ProductionYear)}` : item.ProductionYear;
    const meta = [kind, ...(item.Genres || []).slice(0, 2), date, runtimeLabel(item.RunTimeTicks)];
    return <><div className='client-quickfacts'><p className='client-meta'>{meta.filter(Boolean).join(' · ')}</p>{detailed && <DirectorCredits item={item} />}{detailed && <LanguageTags key={item.Id} item={item} />}{detailed && item.Type === 'Movie' && <FilmFinish ticks={item.RunTimeTicks} />}</div>{detailed && !!item.CommunityRating && <span className='client-public-rating'>★ {(item.CommunityRating / 2).toFixed(1)}/5 · Public</span>}</>;
}

function DirectorCredits({ item }: Readonly<{ item: BaseItemDto }>) {
    const location = useLocation();
    const directors = (item.People || []).filter(person => person.Type === 'Director' && person.Id && person.Name);
    if (!directors.length) return null;
    return <span className='client-director-credits'>Réalisation {directors.map((person, index) =>
        <React.Fragment key={person.Id}>{index > 0 && ', '}<Link to={personPath(person.Id, person.Name)}
            state={{ returnTo: location.pathname + location.search, returnState: location.state }}>{person.Name}</Link></React.Fragment>)}</span>;
}
