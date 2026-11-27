/* eslint-disable react/jsx-no-bind -- Handlers stay next to the markup they belong to. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import Artwork from '../Artwork';
import ClientIcon from '../ClientIcon';
import { GenreTaste } from '../PersonalOverview';
import { formatHours, type PersonalStats } from '../personalStats';
import { imageUrl } from '../seerr/model';
import { useEpisodeSpoilers } from '../spoilers';
import { folderPath, type Folder } from '../folders/model';
import { ActionButton } from '../ui';
import { relativeDay, type JourneyEntry } from './journey';
import './journey.scss';

type Image = (item: BaseItemDto, backdrop?: boolean) => string;
type Shared = { readonly entries: JourneyEntry[]; readonly image: Image; readonly play: (item: BaseItemDto) => void };

function target(entry: JourneyEntry) {
    if (entry.item) return `/client?id=${entry.item.SeriesId || entry.item.Id}`;
    if (entry.request?.itemId) return `/client?id=${entry.request.itemId}`;
    return '/client?view=requests';
}

function poster(entry: JourneyEntry, image: Image) {
    if (entry.item) return image(entry.item);
    return imageUrl(entry.request?.poster || undefined);
}

function useReturnState() {
    const location = useLocation();
    return { returnTo: location.pathname + location.search, returnState: location.state };
}

function Progress({ value, tone }: Readonly<{ value?: number; tone?: string }>) {
    if (value === undefined || value <= 0) return null;
    return <span className={['client-journey-progress', tone && `is-${tone}`].filter(Boolean).join(' ')} role='img' aria-label={`${Math.round(value)} %`}><i style={{ width: `${Math.min(100, value)}%` }} /></span>;
}

/** A poster whose surface carries the title and the reason, as the cards of the rows do. */
function JourneyCard({ entry, image, play, compact = false }: Readonly<{ entry: JourneyEntry; compact?: boolean } & Omit<Shared, 'entries'>>) {
    const state = useReturnState();
    const protect = useEpisodeSpoilers();
    return <li className={`client-journey-card is-${entry.kind}${compact ? ' is-compact' : ''}`}>
        <Link to={target(entry)} state={state} aria-label={[entry.title, entry.subtitle, entry.reason].filter(Boolean).join(' · ')}>
            <Artwork source={poster(entry, image)} className={entry.item && protect(entry.item) ? 'client-spoiler-art' : undefined} />
            <span className='client-journey-card-copy'>
                <em className={entry.tone ? `is-${entry.tone}` : undefined}>{entry.reason}</em>
                <strong>{entry.title}</strong>
                <Progress value={entry.progress} tone={entry.kind === 'request' ? 'request' : undefined} />
            </span>
        </Link>
        {entry.stage === 'ready' && entry.item && !compact && <ActionButton round size='small' icon='play' className='client-journey-card-play' aria-label={`Lire ${entry.title}`} onClick={() => play(entry.item!)} />}
    </li>;
}

/** Ask for a title from here: the search already mixes the library and Seerr. */
export function RequestBox() {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    return <form className='client-journey-request' role='search' onSubmit={event => {
        event.preventDefault();
        if (query.trim()) navigate(`/client?view=search&q=${encodeURIComponent(query.trim())}`);
    }}>
        <ClientIcon name='search' />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder='Demander un film ou une série…' aria-label='Demander un film ou une série' />
    </form>;
}

/** The figures as one sentence, leading to the full recap. */
export function MonthLine({ stats, open }: Readonly<{ stats?: PersonalStats; open: () => void }>) {
    if (!stats) return null;
    return <button type='button' className='client-journey-month' onClick={open}>
        <span><b>{stats.recent.toLocaleString('fr-FR')}</b> titres ces 30 derniers jours</span>
        <span><b>{formatHours(stats.hours)}</b> au total</span>
        <span><b>{stats.finishedSeries.toLocaleString('fr-FR')}</b> {stats.finishedSeries > 1 ? 'séries terminées' : 'série terminée'}</span>
        <span className='client-journey-month-link'>Mon bilan<ClientIcon name='next' /></span>
    </button>;
}

const DAY = 864e5;

function dayStart(date: number) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
}

/** Mon espace as a timeline: what I watched and filed on the left, today in the middle, what is coming on the right. */
export function JourneyTimeline({ entries, image, play, folders }: Shared & { readonly folders?: Folder[] | null }) {
    const now = Date.now();
    const today = dayStart(now);
    const track = useRef<HTMLDivElement>(null);
    const buckets = new Map<number, JourneyEntry[]>();
    // Between now and tomorrow: what is on its way without a known day (a request waiting, a download arriving today).
    const soon = today + DAY / 2;
    const add = (key: number, entry: JourneyEntry) => buckets.set(key, [...(buckets.get(key) || []), entry]);
    for (const entry of entries) {
        if (entry.stage === 'ready') add(today, entry);
        else if (entry.stage === 'coming') add(entry.date && dayStart(entry.date) > today ? dayStart(entry.date) : soon, entry);
        else if (entry.date) add(Math.min(today - DAY, dayStart(entry.date)), entry);
    }
    if (!buckets.has(today)) buckets.set(today, []);
    const days = [...buckets.entries()].sort(([a], [b]) => a - b);
    useLayoutEffect(() => {
        track.current?.querySelector('.is-today')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }, []);
    const label = (day: number) => {
        if (day === today) return 'Maintenant';
        if (day === soon) return 'Bientôt';
        if (day === today + DAY) return 'Demain';
        if (day > today) return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(day));
        return relativeDay(day, now).replace(/^le /, '');
    };
    return <div className='client-journey-timeline'>
        <div className='client-journey-track' ref={track}>
            {days.map(([day, items]) => <section key={day} className={`client-journey-day${day === today ? ' is-today' : ''}${day > today ? ' is-future' : ''}`} aria-label={label(day)}>
                <h2><i aria-hidden='true' />{label(day)}</h2>
                <ul>{items.map(entry => <JourneyCard key={entry.key} entry={entry} image={image} play={play} compact={day !== today} />)}
                    {day === today && !items.length && <li className='client-journey-empty'>Rien en cours.</li>}</ul>
            </section>)}
        </div>
        <footer>
            <RequestBox />
            {!!folders && <nav className='client-journey-folders' aria-label='Mes dossiers'>
                {folders.slice(0, 6).map(folder => <Link key={folder.id} to={folderPath(folder.id)}><ClientIcon name='folder' />{folder.name}</Link>)}
                <Link to='/client?view=mine&section=folders' className='client-journey-side'>{folders.length > 6 ? `Tous mes dossiers (${folders.length})` : 'Gérer mes dossiers'}<ClientIcon name='next' /></Link>
            </nav>}
        </footer>
    </div>;
}

/** Bilan: the figures told as a story rather than counted. */
export function JourneyRecap({ stats, entries, image, name }: Readonly<{ stats?: PersonalStats; entries: JourneyEntry[]; image: Image; name?: string | null }>) {
    if (!stats) return <p className='client-message'>Chargement du bilan…</p>;
    const seen = entries.filter(entry => entry.stage === 'seen' && entry.item);
    const days = Math.round(stats.hours / 24 * 10) / 10;
    return <div className='client-journey-recap'>
        <section className='client-journey-recap-lead'>
            <p>{name ? `${name}, tu` : 'Tu'} as passé</p>
            <strong>{formatHours(stats.hours)}</strong>
            <p>devant l’écran{days >= 1 ? `, soit ${days.toLocaleString('fr-FR')} jours entiers` : ''}.</p>
        </section>
        <section className='client-journey-recap-facts'>
            <div><strong>{stats.movies.toLocaleString('fr-FR')}</strong><span>films vus</span></div>
            <div><strong>{stats.episodes.toLocaleString('fr-FR')}</strong><span>épisodes, dans {stats.series.toLocaleString('fr-FR')} séries</span></div>
            <div><strong>{stats.finishedSeries.toLocaleString('fr-FR')}</strong><span>{stats.finishedSeries > 1 ? 'séries terminées' : 'série terminée'}</span></div>
            <div><strong>{stats.recent.toLocaleString('fr-FR')}</strong><span>titres ces 30 derniers jours</span></div>
        </section>
        <section className='client-journey-recap-taste'><h2>Ce que tu aimes</h2><GenreTaste stats={stats} limit={5} /></section>
        <section className='client-journey-recap-wall' aria-label='Tes derniers titres'>
            {seen.slice(0, 12).map(entry => <Artwork key={entry.key} source={image(entry.item!)} />)}
        </section>
    </div>;
}

/* eslint-enable react/jsx-no-bind */
