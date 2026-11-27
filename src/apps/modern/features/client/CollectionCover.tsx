import React, { type CSSProperties, type ReactNode, type RefObject, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Artwork from './Artwork';
import ClientIcon from './ClientIcon';
import useArtworkColor from './useArtworkColor';
import './collectionCover.scss';

export function useCoverPreview(anchor: RefObject<HTMLElement>, enabled = true) {
    const [nearby, setNearby] = useState(false);
    useEffect(() => {
        const element = anchor.current;
        if (!element || nearby || !enabled) return;
        if (!('IntersectionObserver' in window)) {
            setNearby(true);
            return;
        }
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                setNearby(true);
                observer.disconnect();
            }
        }, { rootMargin: '280px' });
        observer.observe(element);
        return () => observer.disconnect();
    }, [anchor, nearby, enabled]);
    return nearby;
}

type Props = {
    anchor: RefObject<HTMLAnchorElement>; to: string; id: string; name: string;
    posters: string[]; count?: string; badge?: ReactNode; ready: boolean;
    emptyLabel?: string; className?: string; tinted?: boolean;
};

export default function CollectionCover({ anchor, to, id, name, posters, count, badge, ready, emptyLabel, className, tinted }: Readonly<Props>) {
    const color = useArtworkColor(tinted ? posters[0] : undefined, '128 128 128');
    return <Link ref={anchor} to={to} data-client-focus={id} className={`client-cover ${className || ''}`}
        style={tinted && posters.length ? { '--cover-color': color } as CSSProperties : undefined}>
        <span className='client-cover-art' data-posters={posters.length} aria-hidden='true'>
            {!posters.length && <span className='client-cover-empty'><ClientIcon name='collection' /></span>}
            {posters.map(source => <span key={source} className='client-cover-poster'><Artwork source={source} /></span>)}
        </span>
        <span className='client-cover-info'>
            <strong>{name}</strong>
            {(count || badge) && <span className='client-cover-meta'>{count && <small>{count}</small>}{badge && <span className='client-cover-badge'>{badge}</span>}</span>}
            {ready && !posters.length && emptyLabel && <small>{emptyLabel}</small>}
        </span>
    </Link>;
}
