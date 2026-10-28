/* eslint-disable react/jsx-no-bind -- Row interactions are local to this component. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { episodeLabel, progressPercent } from './model';

type Props = {
    title: string;
    items: BaseItemDto[];
    continuation?: boolean;
    image: (item: BaseItemDto, backdrop?: boolean) => string;
    logo: (item: BaseItemDto) => string | undefined;
    onPlay: (item: BaseItemDto) => Promise<void>;
    onFavorite: (item: BaseItemDto) => Promise<void>;
};

function continuationLabel(item: BaseItemDto) {
    return progressPercent(item) > 0 ? 'Reprendre' : 'À suivre';
}

export default function MediaRow({ title, items, continuation, image, logo, onPlay, onFavorite }: Readonly<Props>) {
    const [active, setActive] = useState(-1);
    const strip = useRef<HTMLDivElement>(null);
    const location = useLocation();
    const item = items[active];
    if (!items.length) return null;
    function move(index: number) {
        const next = Math.max(0, Math.min(items.length - 1, index));
        setActive(next);
        strip.current?.querySelectorAll<HTMLElement>('.client-card')[next]?.focus({ preventScroll: true });
        strip.current?.children[next]?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest', inline: 'nearest' });
    }
    return <section className={`client-row client-expanding-row${item ? ' has-active-card' : ''}`} aria-label={title}>
        <header className='client-row-heading'><h2>{title}</h2><div><button aria-label={`Précédents : ${title}`} onClick={() => move(active - 1)}>‹</button><button aria-label={`Suivants : ${title}`} onClick={() => move(active + 1)}>›</button></div></header>
        <div className='client-section-glow' aria-hidden='true' />
        <div className='client-strip' role='toolbar' aria-label={title} ref={strip} onKeyDown={event => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                move(active + (event.key === 'ArrowRight' ? 1 : -1));
            }
            if (event.key === 'Escape') setActive(-1);
        }}>{items.map((media, index) => <article className={`client-media-card${active === index ? ' active' : ''}`} key={media.Id} onPointerEnter={event => { if (event.pointerType !== 'touch') setActive(index); }} onFocus={() => setActive(index)}>
                <Link className='client-card' data-client-focus={media.Id} aria-label={[media.SeriesName, media.Name].filter(Boolean).join(' · ')} to={`/client?id=${media.Type === 'Episode' ? media.SeriesId || media.Id : media.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state }} onClick={event => {
                    if (event.detail > 0 && matchMedia('(hover: none)').matches && active !== index) {
                        event.preventDefault();
                        setActive(index);
                    }
                }}>
                    <img className='client-card-poster' src={image(media)} alt='' loading='lazy' onError={event => { event.currentTarget.hidden = true; }} />
                    <img className='client-card-backdrop' src={image(media, true)} alt='' loading='lazy' onError={event => { event.currentTarget.hidden = true; }} />
                    <span className='client-card-fallback'>{media.SeriesName || media.Name}</span>
                    <span className='client-card-shade' />
                    <span className='client-expanded-title'>{logo(media) && <img src={logo(media)} alt='' loading='lazy' onError={event => { event.currentTarget.hidden = true; }} />}<strong>{media.SeriesName || media.Name}</strong></span>
                    {continuation && <span className='client-continue-label'>{media.Type === 'Episode' ? episodeLabel(media) : continuationLabel(media)}</span>}
                    {progressPercent(media) > 0 && <span className='client-progress'><i style={{ width: `${progressPercent(media)}%` }} /></span>}
                </Link>
                <span className='client-availability' aria-label='Disponible dans votre bibliothèque'>✓<span>Disponible</span></span>
                <div className='client-card-actions'>
                    <button className='client-card-play' aria-label={`Lire ${media.Name}`} onClick={() => { void onPlay(media); }}>▶</button>
                    <button aria-label={`${media.UserData?.IsFavorite ? 'Retirer' : 'Ajouter'} ${media.Name} ${media.UserData?.IsFavorite ? 'de' : 'à'} ma liste`} aria-pressed={!!media.UserData?.IsFavorite} onClick={() => { void onFavorite(media); }}>{media.UserData?.IsFavorite ? '✓' : '+'}</button>
                    <Link to={`/client?id=${media.Type === 'Episode' ? media.SeriesId || media.Id : media.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state }} aria-label={`Informations sur ${media.Name}`}>⌄</Link>
                </div>
            </article>)}</div>
        <div className='client-row-info' aria-live='polite'>{item && <><h3>{item.SeriesName || item.Name}</h3><span>{[item.Type === 'Episode' ? episodeLabel(item) : item.ProductionYear, ...(item.Genres || []).slice(0, 2)].filter(Boolean).join(' · ')}</span><p>{item.Overview}</p></>}</div>
    </section>;
}

/* eslint-enable react/jsx-no-bind */
