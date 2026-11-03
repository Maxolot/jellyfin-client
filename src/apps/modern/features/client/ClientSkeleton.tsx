import React from 'react';

import './skeletons.scss';

type Layout = 'hero' | 'detail' | 'grid' | 'row' | 'episodes' | 'request' | 'list' | 'settings' | 'draw';
type Props = { layout?: Layout; label?: string; count?: number; contained?: boolean };

/** Decorative shapes share a single loading announcement and never receive focus. */
export default function ClientSkeleton({ layout = 'row', label = 'Chargement…', count = 6, contained = false }: Readonly<Props>) {
    const hero = layout === 'hero' || layout === 'detail';
    let heroClass = '';
    if (hero) heroClass = layout === 'hero' ? ' client-hero client-home-hero' : ' client-hero client-detail';
    return <div className={`client-skeleton client-skeleton-${layout}${contained ? ' contained' : ''}${heroClass}`} role='status' aria-busy='true'>
        <span className='client-loading-label'>{label}</span>
        <div className='client-skeleton-shapes' aria-hidden='true'>
            {hero ? <div className='client-skeleton-copy'><span className='client-skeleton-bar short' /><span className='client-skeleton-bar title' /><span className='client-skeleton-bar' /><span className='client-skeleton-bar' /><span className='client-skeleton-bar medium' /><div className='client-skeleton-buttons'><span /><span /></div></div> : <>
                {['row', 'episodes', 'request', 'settings'].includes(layout) && <span className='client-skeleton-bar heading' />}
                <div className='client-skeleton-items'>{Array.from({ length: count }, (_, index) => <div className='client-skeleton-item' key={`placeholder-${index}`}><span className='client-skeleton-cover' />{['episodes', 'list', 'request', 'settings'].includes(layout) && <div className='client-skeleton-lines'><span className='client-skeleton-bar medium' /><span className='client-skeleton-bar short' /></div>}</div>)}</div>
            </>}
        </div>
    </div>;
}

export function ImageSkeleton() {
    return <span className='client-image-skeleton' aria-hidden='true' />;
}
