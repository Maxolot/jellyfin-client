import { useQuery } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';

import { formatHours, type PersonalStats } from './personalStats';
import { useSeerr } from './seerr/SeerrContext';
import type { Results } from './seerr/model';
import './personal.scss';

const REQUEST_STATES = [['pending', 'en attente'], ['processing', 'en préparation'], ['available', 'disponibles']] as const;

/** Seerr only exposes global counts to admins: each state is read as a one-item page of the user's own requests. */
function useRequestCounts() {
    const seerr = useSeerr();
    const userId = seerr.me.data?.id;
    return useQuery({
        queryKey: [...seerr.root, 'RequestCounts', userId],
        enabled: seerr.connected && !!userId,
        refetchInterval: 60000,
        retry: false,
        queryFn: async ({ signal }) => {
            const read = async (filter: string) => (await seerr.call<Results<unknown>>(`Api/request?take=1&skip=0&filter=${filter}&requestedBy=${userId}`, signal)).pageInfo?.results || 0;
            const [total, ...states] = await Promise.all(['all', ...REQUEST_STATES.map(([state]) => state)].map(read));
            return { total, states: REQUEST_STATES.map(([, label], index) => ({ label, count: states[index] })) };
        }
    });
}

function StatTile({ value, label, detail, pending, target }: { readonly value: ReactNode; readonly label: string; readonly detail?: ReactNode; readonly pending?: boolean; readonly target?: string }) {
    const content = <>
        <strong aria-busy={pending || undefined}>{pending ? <span className='client-stat-placeholder' aria-hidden='true' /> : value}</strong>
        <span>{label}</span>
        {detail && !pending && <small>{detail}</small>}
    </>;
    if (!target) return <div className='client-stat'>{content}</div>;
    return <button type='button' className='client-stat' data-target={target} onClick={scrollToTarget}>{content}</button>;
}

function scrollToTarget(event: React.MouseEvent<HTMLButtonElement>) {
    document.getElementById(event.currentTarget.dataset.target || '')?.scrollIntoView({ block: 'start' });
}

function plural(count: number, one: string, many: string) {
    return `${count.toLocaleString('fr-FR')} ${count > 1 ? many : one}`;
}

/** Four figures that say something, without small print: what was watched, for how long, and what is still to come. */
export function PersonalStatsBand({ stats, pending, favorites, favoritesPending }: { readonly stats?: PersonalStats; readonly pending: boolean; readonly favorites: number; readonly favoritesPending: boolean }) {
    const seerr = useSeerr();
    const requests = useRequestCounts();
    const waiting = (requests.data?.states || []).filter(state => state.label !== 'disponibles').reduce((sum, state) => sum + state.count, 0);
    return <section className='client-stats' aria-label='Vos statistiques'>
        <StatTile pending={pending} value={(stats?.movies || 0).toLocaleString('fr-FR')} label={(stats?.movies || 0) > 1 ? 'Films vus' : 'Film vu'} />
        <StatTile pending={pending} value={(stats?.series || 0).toLocaleString('fr-FR')} label={(stats?.series || 0) > 1 ? 'Séries suivies' : 'Série suivie'} />
        <StatTile pending={pending} value={formatHours(stats?.hours || 0)} label='Devant l’écran' />
        {seerr.connected ?
            <StatTile pending={requests.isPending} value={waiting.toLocaleString('fr-FR')} label={waiting > 1 ? 'Demandes en attente' : 'Demande en attente'} target='client-requests' /> :
            <StatTile pending={favoritesPending} value={favorites.toLocaleString('fr-FR')} label='Dans ma liste' target='client-favorites' />}
    </section>;
}

export function GenreTaste({ stats }: { readonly stats?: PersonalStats }) {
    if (!stats?.genres.length) return null;
    return <section className='client-personal-panel client-genre-taste' aria-labelledby='client-genre-taste'>
        <h2 id='client-genre-taste'>Vos genres préférés</h2>
        <ol>{stats.genres.map(genre => <li key={genre.name}>
            <span>{genre.name}</span><i aria-hidden='true'><b style={{ width: `${Math.max(6, genre.share * 100)}%` }} /></i><small>{plural(genre.count, 'titre', 'titres')}</small>
        </li>)}</ol>
    </section>;
}
