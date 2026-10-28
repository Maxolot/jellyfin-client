/* eslint-disable react/jsx-no-bind -- Row interactions are local to this component. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ResizeObserver from 'resize-observer-polyfill';

import ClientIcon from './ClientIcon';
import Artwork from './Artwork';
import PreviewClip from './PreviewClip';
import FavoriteAction from './FavoriteAction';
import useArtworkColor from './useArtworkColor';

import { episodeLabel, progressPercent } from './model';

type Props = {
    title: string;
    items: BaseItemDto[];
    continuation?: boolean;
    image: (item: BaseItemDto, backdrop?: boolean) => string;
    logo: (item: BaseItemDto) => string | undefined;
    onPrepare: (item: BaseItemDto) => void;
    onPlay: (item: BaseItemDto) => Promise<void>;
    onFavorite: (item: BaseItemDto) => Promise<void>;
};

function continuationLabel(item: BaseItemDto) {
    return progressPercent(item) > 0 ? 'Reprendre' : 'À suivre';
}

export default function MediaRow({ title, items, continuation, image, logo, onPrepare, onPlay, onFavorite }: Readonly<Props>) {
    const [readyBackdrops, setReadyBackdrops] = useState<Record<string, boolean>>({});
    const [active, setActive] = useState(-1);
    const strip = useRef<HTMLDivElement>(null);
    const touchOpens = useRef(false);
    const pointer = useRef<{ x: number; y: number }>();
    const location = useLocation();
    const item = items[active];
    const color = useArtworkColor(item ? image(item, true) : undefined);
    const glow = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const list = strip.current;
        const card = list?.children[active];
        if (!(card instanceof HTMLElement) || !glow.current || !list) return;
        const update = () => {
            const rect = card.getBoundingClientRect();
            const parent = list.parentElement!.getBoundingClientRect();
            if (glow.current) {
                glow.current.style.left = `${rect.left - parent.left}px`;
                glow.current.style.top = `${rect.top - parent.top}px`;
                glow.current.style.width = `${rect.width}px`;
                glow.current.style.height = `${rect.height}px`;
            }
        };
        update();
        const resize = new ResizeObserver(update);
        resize.observe(card);
        list.addEventListener('scroll', update, { passive: true });
        return () => {
            resize.disconnect();
            list.removeEventListener('scroll', update);
        };
    }, [active]);
    if (!items.length) return null;
    function move(index: number) {
        const next = Math.max(0, Math.min(items.length - 1, index));
        setActive(next);
        strip.current?.querySelectorAll<HTMLElement>('.client-card')[next]?.focus({ preventScroll: true });
        strip.current?.children[next]?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest', inline: 'nearest' });
    }
    return <section className={`client-row client-expanding-row${item ? ' has-active-card' : ''}`} aria-label={title} style={{ '--client-media-color': color } as CSSProperties}>
        <header className='client-row-heading'><h2>{title}</h2><div><button aria-label={`Précédents : ${title}`} onClick={() => move(active - 1)}><ClientIcon name='back' /></button><button aria-label={`Suivants : ${title}`} onClick={() => move(active + 1)}><ClientIcon name='next' /></button></div></header>
        <div className='client-section-glow' ref={glow} aria-hidden='true' />
        <div className='client-strip' role='toolbar' aria-label={title} ref={strip} onKeyDown={event => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                move(active + (event.key === 'ArrowRight' ? 1 : -1));
            }
            if (event.key === 'Escape') setActive(-1);
        }}>{items.map((media, index) => <article className={`client-media-card${active === index ? ' active' : ''}${readyBackdrops[media.Id || ''] ? ' has-backdrop' : ''}`} key={media.Id} onPointerMove={event => {
            // Layout-driven pointer entry must not steal a keyboard selection.
                if (event.pointerType === 'touch') return;
                if (pointer.current?.x === event.clientX && pointer.current?.y === event.clientY) return;
                pointer.current = { x: event.clientX, y: event.clientY };
                if (active === index) return;
                setActive(index);
                onPrepare(media);
            }} onFocus={() => {
                if (!touchOpens.current) {
                    setActive(index);
                    onPrepare(media);
                }
            }}>
                <Link className='client-card' data-client-focus={media.Id} aria-label={[media.SeriesName, media.Name].filter(Boolean).join(' · ')} to={`/client?id=${media.Type === 'Episode' ? media.SeriesId || media.Id : media.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state }} onPointerDown={event => { touchOpens.current = event.pointerType === 'touch' && active !== index; }} onClick={event => {
                    if (touchOpens.current) {
                        event.preventDefault();
                        setActive(index);
                        onPrepare(media);
                    }
                    touchOpens.current = false;
                }}>
                    <Artwork className='client-card-poster' source={image(media)} />
                    <Artwork className='client-card-backdrop' source={image(media, true)} enabled={active === index} eager onReady={() => setReadyBackdrops(previous => previous[media.Id || ''] ? previous : { ...previous, [media.Id || '']: true })} />
                    <span className='client-card-fallback'>{media.SeriesName || media.Name}</span>
                    <span className='client-card-shade' />
                    <span className='client-expanded-title'>{logo(media) && <Artwork source={logo(media)!} enabled={active === index} eager />}<strong>{media.SeriesName || media.Name}</strong></span>
                    {continuation && <span className='client-continue-label'>{media.Type === 'Episode' ? episodeLabel(media) : continuationLabel(media)}</span>}
                    {progressPercent(media) > 0 && <span className='client-progress'><i style={{ width: `${progressPercent(media)}%` }} /></span>}
                </Link>
                <PreviewClip item={media} surface='card' enabled={active === index} />
                <span className='client-availability' aria-label='Disponible dans votre bibliothèque'><ClientIcon name='check' /><span>Disponible</span></span>
                <div className='client-card-actions'>
                    <button className='client-card-play' aria-label={`Lire ${media.Name}`} onClick={() => { void onPlay(media); }}><ClientIcon name='play' /></button>
                    {active === index && <FavoriteAction item={media} onFavorite={onFavorite} />}
                    <Link to={`/client?id=${media.Type === 'Episode' ? media.SeriesId || media.Id : media.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state }} aria-label={`Informations sur ${media.Name}`}><ClientIcon name='down' /></Link>
                </div>
            </article>)}</div>
        <div className='client-row-info' aria-live='polite'>{item && <><h3>{item.SeriesName || item.Name}</h3><span>{[item.Type === 'Episode' ? episodeLabel(item) : item.ProductionYear, ...(item.Genres || []).slice(0, 2)].filter(Boolean).join(' · ')}</span><p>{item.Overview}</p></>}</div>
    </section>;
}

/* eslint-enable react/jsx-no-bind */
