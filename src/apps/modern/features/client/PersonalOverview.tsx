import { useQuery } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';

import { useApi } from 'hooks/useApi';

import { loadRatedItems, personalStars } from './ratings';
import { formatHours, type PersonalStats } from './personalStats';
import { clientRequest } from './session';
import { useSeerr } from './seerr/SeerrContext';
import type { Results } from './seerr/model';
import './personal.scss';

const REQUEST_STATES = [['pending', 'en attente'], ['processing', 'en préparation'], ['available', 'disponibles']] as const;

function useRatingSummary() {
    const { api, user } = useApi();
    // Shares its cache with the "Mes notes" section below.
    const ratings = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'Rated'],
        enabled: !!api && !!user?.Id,
        queryFn: ({ signal }) => clientRequest(() => loadRatedItems(api!, user!.Id!, signal)),
        staleTime: 30000
    });
    const stars = (ratings.data || []).map(item => personalStars(item) || 0);
    return { pending: ratings.isPending, count: stars.length, average: stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : 0 };
}

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

function seriesDetail(stats?: PersonalStats) {
    if (!stats?.series) return undefined;
    const finished = stats.finishedSeries ? ' · ' + plural(stats.finishedSeries, 'terminée', 'terminées') : '';
    return plural(stats.series, 'série', 'séries') + finished;
}

function plural(count: number, one: string, many: string) {
    return `${count.toLocaleString('fr-FR')} ${count > 1 ? many : one}`;
}

export function PersonalStatsBand({ stats, pending, favorites, favoritesPending }: { readonly stats?: PersonalStats; readonly pending: boolean; readonly favorites: number; readonly favoritesPending: boolean }) {
    const ratings = useRatingSummary();
    const seerr = useSeerr();
    const requests = useRequestCounts();
    const days = (stats?.hours || 0) / 24;
    return <section className='client-stats' aria-label='Vos statistiques'>
        <StatTile pending={pending} value={(stats?.movies || 0).toLocaleString('fr-FR')} label='Films vus'
            detail={stats?.recent ? `${plural(stats.recent, 'titre vu', 'titres vus')} ces 30 derniers jours` : undefined} />
        <StatTile pending={pending} value={(stats?.episodes || 0).toLocaleString('fr-FR')} label='Épisodes vus'
            detail={seriesDetail(stats)} />
        <StatTile pending={pending} value={formatHours(stats?.hours || 0)} label='De visionnage'
            detail={days >= 1 ? `soit ${days.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} jours` : undefined} />
        <StatTile pending={ratings.pending} value={ratings.count.toLocaleString('fr-FR')} label='Titres notés' target='client-ratings'
            detail={ratings.count ? `moyenne ${ratings.average.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/5` : undefined} />
        <StatTile pending={favoritesPending} value={favorites.toLocaleString('fr-FR')} label='Dans ma liste' target='client-favorites' />
        {seerr.connected && <StatTile pending={requests.isPending} value={(requests.data?.total || 0).toLocaleString('fr-FR')} label='Demandes' target='client-requests'
            detail={requests.data?.states.filter(state => state.count).map(state => `${state.count} ${state.label}`).join(' · ') || undefined} />}
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
