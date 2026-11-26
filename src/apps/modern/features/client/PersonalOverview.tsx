import React from 'react';

import type { PersonalStats } from './personalStats';
import './personal.scss';

function plural(count: number, one: string, many: string) {
    return `${count.toLocaleString('fr-FR')} ${count > 1 ? many : one}`;
}

export function GenreTaste({ stats, limit }: { readonly stats?: PersonalStats; readonly limit?: number }) {
    if (!stats?.genres.length) return null;
    return <section className='client-personal-section client-genre-taste' aria-labelledby='client-genre-taste'>
        <header><h2 id='client-genre-taste'>Vos genres préférés</h2></header>
        <ol>{(limit ? stats.genres.slice(0, limit) : stats.genres).map(genre => <li key={genre.name}>
            <span>{genre.name}</span><i aria-hidden='true'><b style={{ width: `${Math.max(6, genre.share * 100)}%` }} /></i><small>{plural(genre.count, 'titre', 'titres')}</small>
        </li>)}</ol>
    </section>;
}
