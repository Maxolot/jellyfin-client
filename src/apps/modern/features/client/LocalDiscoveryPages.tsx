/* eslint-disable react/jsx-no-bind -- Local filter controls and selection rendering. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useState } from 'react';

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

/* eslint-enable react/jsx-no-bind */
