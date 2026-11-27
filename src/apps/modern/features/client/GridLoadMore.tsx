import React, { useEffect, useRef } from 'react';

import ClientSkeleton from './ClientSkeleton';
import { ActionButton } from './ui';
import { LABELS } from './labels';

/** Asks for the next titles well before the end of the page is reached. */
export default function GridLoadMore({ loading, failed, pages, load }: Readonly<{ loading: boolean; failed: boolean; pages: number; load: () => void }>) {
    const marker = useRef<HTMLDivElement>(null);
    const supported = 'IntersectionObserver' in window;
    useEffect(() => {
        const element = marker.current;
        if (!element || !supported || loading || failed) return;
        // A new observer per page also covers a tall screen, where the end is still in view after loading.
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) load();
        }, { rootMargin: '1600px 0px' });
        observer.observe(element);
        return () => observer.disconnect();
    }, [loading, failed, pages, load, supported]);
    return <div ref={marker} className='client-load-more'>
        {loading && <ClientSkeleton layout='grid' count={6} contained label='Chargement des titres suivants…' />}
        {failed && <p role='alert'>Impossible de charger la suite. <button type='button' onClick={load}>{LABELS.retry}</button></p>}
        {!supported && !loading && !failed && <ActionButton onClick={load}>{LABELS.showMore}</ActionButton>}
    </div>;
}
