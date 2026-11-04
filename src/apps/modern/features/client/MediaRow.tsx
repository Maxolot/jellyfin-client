/* eslint-disable react/jsx-no-bind -- Row interactions are local to this component. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { type CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ResizeObserver from 'resize-observer-polyfill';

import ClientIcon from './ClientIcon';
import Artwork from './Artwork';
import PreviewClip from './PreviewClip';
import FavoriteAction from './FavoriteAction';
import useArtworkColor from './useArtworkColor';

import { isExternal, mediaLabel, type CatalogueItem } from './seerr/model';

import { episodeLabel, progressPercent } from './model';

type Props = {
    title: string;
    items: BaseItemDto[];
    continuation?: boolean;
    showDescription?: boolean;
    image: (item: BaseItemDto, backdrop?: boolean) => string;
    logo: (item: BaseItemDto) => string | undefined;
    onPrepare: (item: BaseItemDto) => void;
    onRelease?: () => void;
    onPlay: (item: BaseItemDto) => Promise<void>;
    onFavorite: (item: BaseItemDto) => Promise<void>;
};

function continuationLabel(item: BaseItemDto) {
    return progressPercent(item) > 0 ? 'Reprendre' : 'À suivre';
}

export default function MediaRow({ title, items, continuation, showDescription = true, image, logo, onPrepare, onRelease, onPlay, onFavorite }: Readonly<Props>) {
    const [readyBackdrops, setReadyBackdrops] = useState<Partial<Record<string, boolean>>>({});
    const preparedSources = useRef<Partial<Record<string, boolean>>>({});
    const [active, setActive] = useState(-1);
    const [pending, setPending] = useState(-1);
    const intent = useRef(-1);
    const owner = useId();
    const releaseCallback = useRef(onRelease);
    releaseCallback.current = onRelease;
    useEffect(() => {
        const dismissOther = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== owner && intent.current >= 0) release();
        };
        window.addEventListener('client-card-select', dismissOther);
        return () => window.removeEventListener('client-card-select', dismissOther);
    }, [owner]);
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
    function release() {
        intent.current = -1;
        pointer.current = undefined;
        setPending(-1);
        setActive(-1);
        releaseCallback.current?.();
    }
    function select(index: number) {
        if (intent.current === index) return;
        window.dispatchEvent(new CustomEvent('client-card-select', { detail: owner }));
        intent.current = index;
        setPending(index);
        const source = image(items[index], true);
        if (!source || preparedSources.current[source] !== undefined) setActive(index);
        onPrepare(items[index]);
    }
    function prepared(index: number, source: string, success: boolean) {
        preparedSources.current = { ...preparedSources.current, [source]: success };
        setReadyBackdrops(preparedSources.current);
        if (intent.current === index) setActive(index);
    }
    function move(index: number) {
        const next = Math.max(0, Math.min(items.length - 1, index));
        select(next);
        strip.current?.querySelectorAll<HTMLElement>('.client-card')[next]?.focus({ preventScroll: true });
        strip.current?.children[next]?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest', inline: 'nearest' });
    }
    return <section className={`client-row client-expanding-row${item ? ' has-active-card' : ''}`} aria-label={title} style={{ '--client-media-color': color } as CSSProperties}>
        <header className='client-row-heading'><h2>{title}</h2><div><button aria-label={`Précédents : ${title}`} onClick={() => move(intent.current - 1)}><ClientIcon name='back' /></button><button aria-label={`Suivants : ${title}`} onClick={() => move(intent.current + 1)}><ClientIcon name='next' /></button></div></header>
        <div className='client-section-glow' ref={glow} aria-hidden='true' />
        <div className='client-strip' role='toolbar' aria-label={title} ref={strip} onKeyDown={event => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                move(intent.current + (event.key === 'ArrowRight' ? 1 : -1));
            }
            if (event.key === 'Escape') {
                release();
            }
        }}>{items.map((media, index) => {
                const backdrop = image(media, true);
                return <article className={`client-media-card${active === index ? ' active' : ''}${readyBackdrops[backdrop] ? ' has-backdrop' : ''}`} key={media.Id} onPointerLeave={event => {
                    if (event.pointerType !== 'touch' && intent.current === index) release();
                }} onBlur={event => {
                    if (!event.currentTarget.contains(event.relatedTarget) && intent.current === index) release();
                }} onPointerMove={event => {
                    // Layout-driven pointer entry must not steal a keyboard selection.
                    if (event.pointerType === 'touch') return;
                    if (pointer.current?.x === event.clientX && pointer.current?.y === event.clientY) return;
                    pointer.current = { x: event.clientX, y: event.clientY };
                    select(index);
                }} onFocus={() => {
                    if (!touchOpens.current) {
                        select(index);
                    }
                }}>
                    <Link className='client-card' data-client-focus={media.Id} aria-label={[media.SeriesName, media.Name].filter(Boolean).join(' · ')} to={`/client?id=${media.Type === 'Episode' ? media.SeriesId || media.Id : media.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state }} onPointerDown={event => { touchOpens.current = event.pointerType === 'touch' && intent.current !== index; }} onClick={event => {
                        if (touchOpens.current) {
                            event.preventDefault();
                            select(index);
                        }
                        touchOpens.current = false;
                    }}>
                        <Artwork className='client-card-poster' source={image(media)} />
                        <Artwork className='client-card-backdrop' source={backdrop} eager={pending === index} rootMargin='180px 180px' onReady={() => prepared(index, backdrop, true)} onFailure={() => prepared(index, backdrop, false)} />
                        <span className='client-card-fallback'>{media.SeriesName || media.Name}</span>
                        <span className='client-card-shade' />
                        <span className='client-expanded-title'>{logo(media) && <Artwork source={logo(media)!} enabled={active === index} eager />}<strong>{media.SeriesName || media.Name}</strong></span>
                        {continuation && <span className='client-continue-label'>{media.Type === 'Episode' ? episodeLabel(media) : continuationLabel(media)}</span>}
                        {progressPercent(media) > 0 && <span className='client-progress'><i style={{ width: `${progressPercent(media)}%` }} /></span>}
                    </Link>
                    <PreviewClip item={media} surface='card' enabled={active === index} />
                    <span className='client-availability' aria-label={isExternal(media) ? mediaLabel((media as CatalogueItem).Seerr?.mediaInfo) : 'Disponible dans votre bibliothèque'}><ClientIcon name={isExternal(media) ? 'plus' : 'check'} /><span>{isExternal(media) ? mediaLabel((media as CatalogueItem).Seerr?.mediaInfo) : 'Disponible'}</span></span>
                    <div className='client-card-actions'>
                        <button className='client-card-play' aria-label={`${isExternal(media) ? 'Demander' : 'Lire'} ${media.Name}`} onClick={() => { void onPlay(media); }}><ClientIcon name={isExternal(media) ? 'plus' : 'play'} /></button>
                        {!isExternal(media) && active === index && <FavoriteAction item={media} onFavorite={onFavorite} />}
                        <Link to={`/client?id=${media.Type === 'Episode' ? media.SeriesId || media.Id : media.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state }} aria-label={`Informations sur ${media.Name}`}><ClientIcon name='down' /></Link>
                    </div>
                </article>;
            })}</div>
        {showDescription && <div className='client-row-info' aria-live='polite'>{item && <><h3>{item.SeriesName || item.Name}</h3><span>{[item.Type === 'Episode' ? episodeLabel(item) : item.ProductionYear, ...(item.Genres || []).slice(0, 2)].filter(Boolean).join(' · ')}</span><p>{item.Overview}</p></>}</div>}
    </section>;
}

/* eslint-enable react/jsx-no-bind */
