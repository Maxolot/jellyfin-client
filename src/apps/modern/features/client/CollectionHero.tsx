import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, type To } from 'react-router-dom';

import Artwork from './Artwork';
import ClientIcon from './ClientIcon';
import { QueueActions } from './QueueActions';
import type { PlayQueue } from './mediaQueue';
import { folderDuration, folderTitleCount, type FolderImage, hasFolderPoster } from './folders/model';
import { useFolderDuration } from './folders/queries';
import useArtworkColor from './useArtworkColor';
import useHeroBackground from './useHeroBackground';

const maxWallPosters = 18;

type Props = {
    title: string; items: BaseItemDto[]; count: number; metadata?: string; metadataBadge?: ReactNode; backTo: To; backLabel: string;
    full: boolean; image: FolderImage; playQueue: PlayQueue; queueBusy: boolean; actions?: ReactNode; children: ReactNode;
};

export default function CollectionHero({ title, items, count, metadata, metadataBadge, backTo, backLabel, full, image, playQueue, queueBusy, actions, children }: Readonly<Props>) {
    const region = useRef<HTMLElement>(null);
    const [frozen, setFrozen] = useState(false);
    const picks = useMemo(() => items.filter(hasFolderPoster).slice(0, maxWallPosters), [items]);
    const posters = useMemo(() => picks.map(item => image(item)), [picks, image]);
    const color = useArtworkColor(posters[0]);
    const featured = items.find(item => item.BackdropImageTags?.length || item.ParentBackdropImageTags?.length)
        ?? picks[0];
    const backdrop = !!(featured?.BackdropImageTags?.length || featured?.ParentBackdropImageTags?.length);
    const fallback = featured ? image(featured, backdrop, backdrop) : '';
    const duration = useFolderDuration(items);
    useHeroBackground(region, full, true);

    useEffect(() => {
        const track = () => {
            const height = region.current?.offsetHeight || 1;
            setFrozen(window.scrollY >= Math.min(140, height / 4));
        };
        track();
        window.addEventListener('scroll', track, { passive: true });
        return () => window.removeEventListener('scroll', track);
    }, []);
    const known = duration.data;
    const qualifier = known?.incomplete ? ' de durée connue' : '';
    const meta = [metadata, folderTitleCount(count), known?.ticks && `${folderDuration(known.ticks)}${qualifier}`];
    return <div className='client-shelf-page' style={{ '--shelf-color': color } as CSSProperties}>
        <section ref={region} className='client-hero client-home-hero client-shelf-hero'>
            <div className='client-hero-image-layer client-shelf-art' aria-hidden='true'>
                {posters.length >= 6 ? <PosterWall posters={posters} frozen={frozen} /> :
                    fallback && <Artwork className='client-shelf-backdrop' source={fallback} eager />}
            </div>
            <div className='client-hero-copy client-shelf-copy'>
                <Link className='client-shelf-back' to={backTo} state={{ restoreFocus: true }}><ClientIcon name='back' />{backLabel}</Link>
                <h1>{title}</h1>
                <div className='client-shelf-meta-line'>
                    <p className='client-shelf-meta'>{meta.filter(Boolean).join(' · ')}</p>
                    {metadataBadge}
                </div>
                {(!!items.length || actions) && <div className='client-actions client-shelf-actions'>
                    {!!items.length && <QueueActions source={items} playQueue={playQueue} pending={queueBusy} />}
                    {actions}
                </div>}
            </div>
        </section>
        {children}
    </div>;
}

function PosterWall({ posters, frozen }: Readonly<{ posters: string[]; frozen: boolean }>) {
    const columns = useMemo(() => Array.from({ length: 6 }, (_, col) => ({
        id: posters[col],
        tiles: Array.from({ length: 8 }, (_tile, row) => ({
            id: `${posters[(col + row * 7) % posters.length]}-${row}`,
            source: posters[(col + row * 7) % posters.length]
        }))
    })), [posters]);
    return <div className='client-shelf-wall' data-frozen={frozen}>
        {columns.map(column => <div className='client-shelf-column' key={column.id}>
            {column.tiles.map(({ id, source }) => <span key={id}><Artwork source={source} eager /></span>)}
        </div>)}
    </div>;
}
