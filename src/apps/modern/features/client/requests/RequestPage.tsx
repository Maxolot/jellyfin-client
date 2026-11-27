/* eslint-disable react/jsx-no-bind -- Each action targets the associated request. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import Artwork from '../Artwork';
import ClientIcon from '../ClientIcon';
import ClientSkeleton from '../ClientSkeleton';
import { imageUrl } from '../seerr/model';
import { RequestTracking } from '../seerr/SeerrViews';
import { requestStageLabel, requestStep, steps, type RequestProgress } from './model';
import { usePlayRequest, useRequestProgress } from './queries';
import { RequestProgressNote } from './RequestInline';
import './requestProgressPage.scss';
import { ActionButton } from '../ui';
import { LABELS } from '../labels';

type Play = (item: BaseItemDto) => void;

function bytes(value: number) {
    if (value >= 1e9) return `${(value / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;
    if (value >= 1e6) return `${(value / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
    return `${Math.round(value / 1e3)} Ko`;
}

function Timeline({ request }: Readonly<{ request: RequestProgress }>) {
    const current = requestStep(request);
    if (current < 0) return null;
    return <ol className='client-request-steps' aria-label='Étapes de la demande'>
        {steps.map(([key, label], index) => <li key={key} className={index < current ? 'is-complete' : undefined}
            aria-current={index === current ? 'step' : undefined}>
            <span aria-hidden='true'>{index < current ? <ClientIcon name='check' /> : index + 1}</span><small>{label}</small>
        </li>)}
    </ol>;
}

function SeasonProgress({ seasons }: Readonly<{ seasons: RequestProgress['seasons'] }>) {
    if (!seasons.length) return null;
    return <ul className='client-request-seasons-status' aria-label='Épisodes disponibles'>
        {seasons.map(season => <li key={season.number}>
            <strong>Saison {season.number}</strong>
            <span>{season.available}{season.total != null && `/${season.total}`} épisode{(season.total ?? season.available) !== 1 ? 's' : ''}</span>
        </li>)}
    </ul>;
}

function RequestCard({ request, play }: Readonly<{ request: RequestProgress; play: Play }>) {
    const location = useLocation();
    const action = usePlayRequest(play);
    const poster = imageUrl(request.poster || undefined);
    const itemId = request.itemId || `seerr-${request.type}-${request.tmdb}`;
    const href = `/client?id=${itemId}`;
    const transferring = request.stage === 'downloading' && request.percent != null;
    const speed = request.bytesPerSecond ? `${bytes(request.bytesPerSecond)}/s` : undefined;
    const left = request.bytesRemaining != null ? `${bytes(request.bytesRemaining)} à télécharger` : undefined;
    return <article className={`client-request-card is-${request.stage}`}>
        <Link className='client-request-card-poster' to={href} aria-label={request.title}
            state={{ returnTo: location.pathname + location.search, returnState: location.state }}>
            {poster && <Artwork source={poster} />}
            <strong>{request.title}</strong>
        </Link>
        <div className='client-request-card-content'>
            <header><span className='client-request-stage'>{requestStageLabel(request.stage)}</span>
                {request.ultra && <span className='client-request-quality-badge'>4K</span>}</header>
            <Timeline request={request} />
            {transferring && <div className='client-request-meter'>
                <progress aria-label='Progression du téléchargement' max={100} value={request.percent!} />
                <p><strong>{request.percent} %</strong>{[speed, left].filter(Boolean).join(' · ')}</p>
            </div>}
            <RequestProgressNote request={request} />
            <SeasonProgress seasons={request.seasons} />
            {request.stage === 'available' && request.itemId && <ActionButton onClick={() => action.mutate(request)}
                disabled={action.isPending} icon='play'>Lecture</ActionButton>}
            {action.isError && <p role='alert'>La lecture n’a pas pu démarrer. Réessayez.</p>}
        </div>
    </article>;
}

const filters = [['all', 'Toutes'], ['active', 'En cours'], ['available', 'Disponibles'], ['blocked', 'Bloquées']] as const;
type Filter = typeof filters[number][0];

function matchesFilter(request: RequestProgress, filter: Filter) {
    if (filter === 'all') return true;
    if (filter === 'active') return request.active;
    if (filter === 'available') return request.stage === 'available' || request.stage === 'partial';
    return request.stage === filter;
}

export default function RequestPage({ play }: Readonly<{ play: Play }>) {
    const query = useRequestProgress(true, true);
    const [filter, setFilter] = useState<Filter>('all');
    const location = useLocation();
    const focus = new URLSearchParams(location.search).get('request');
    if (query.data === null) {
        return <div className='client-live-requests'>
            <Link to='/client?view=mine' className='client-shelf-back'><ClientIcon name='back' />Mon espace</Link>
            <RequestTracking />
        </div>;
    }
    const list = (query.data || []).filter(request => matchesFilter(request, filter));
    if (focus) list.sort((left, right) => Number(String(right.id) === focus) - Number(String(left.id) === focus));
    return <section className='client-live-requests' aria-labelledby='client-requests-heading'>
        <Link to='/client?view=mine' className='client-shelf-back'><ClientIcon name='back' />Mon espace</Link>
        <h1 id='client-requests-heading'>Mes demandes</h1>
        <div className='client-request-filters' role='group' aria-label='Filtrer mes demandes'>
            {filters.map(([value, label]) => <button key={value} type='button' aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        {query.isPending && <ClientSkeleton layout='list' count={3} contained label='Chargement des demandes…' />}
        {query.isError && <p role='alert'>Impossible de vérifier l’avancement. <ActionButton onClick={() => { void query.refetch(); }}>{LABELS.retry}</ActionButton></p>}
        {query.isSuccess && list.length === 0 && <p>Aucune demande dans cette sélection.</p>}
        <div className='client-request-cards'>{list.map(item => <RequestCard key={item.id} request={item} play={play} />)}</div>
    </section>;
}
/* eslint-enable react/jsx-no-bind */
