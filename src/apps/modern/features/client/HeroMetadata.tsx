import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React from 'react';

import FilmFinish from './FilmFinish';
import { releaseDateLabel, runtimeLabel } from './model';

export default function HeroMetadata({ item, detailed }: { readonly item: BaseItemDto; readonly detailed: boolean }) {
    const kind = item.Type === 'Movie' ? 'Film' : 'Série';
    const dateKind = item.Type === 'Movie' ? 'Sortie' : 'Première diffusion';
    const date = detailed ? `${dateKind} : ${releaseDateLabel(item.PremiereDate, item.ProductionYear)}` : item.ProductionYear;
    const meta = [kind, ...(item.Genres || []).slice(0, 2), date, runtimeLabel(item.RunTimeTicks)];
    return <><div className='client-quickfacts'><p className='client-meta'>{meta.filter(Boolean).join(' · ')}</p>{detailed && item.Type === 'Movie' && <FilmFinish ticks={item.RunTimeTicks} />}</div>{detailed && !!item.CommunityRating && <span className='client-public-rating'>★ {(item.CommunityRating / 2).toFixed(1)}/5 · Public</span>}</>;
}
