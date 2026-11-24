/* eslint-disable react/jsx-no-bind -- The controls act on the selected season or episode. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';

import Artwork from './Artwork';
import { artworkUrl } from './artwork';
import ClientDialog from './ClientDialog';
import ClientIcon from './ClientIcon';
import ClientSkeleton from './ClientSkeleton';
import { isQueuedVideo, type PlayQueue } from './mediaQueue';
import { episodeLabel, progressPercent, runtimeLabel } from './model';
import PreviewClip from './PreviewClip';
import { QueueAction } from './QueueActions';
import type { ExternalMedia } from './seerr/model';
import { EpisodeSummary, useEpisodeSpoilers } from './spoilers';
import { episodeCount, partialSeason, seasonChoices, seasonLabel, seasonProgress, seasonSummary, type RemoteSeason } from './seriesEpisodesModel';
import './seriesEpisodes.scss';
import './seriesSide.scss';

const LocalSeriesSources = lazy(() => import(/* webpackChunkName: "client-seerr" */ './seerr/SeerrViews')
    .then(module => ({ default: module.LocalSeriesSources })));

type SeasonSelection = {
    seasons: BaseItemDto[];
    selected: string;
    select: (id: string) => void;
    missing: RemoteSeason[];
    requestSeason: (season: RemoteSeason) => void;
};

type SeasonRailProps = SeasonSelection & { series: BaseItemDto; basePath: string; episodes?: BaseItemDto[]; detail?: ExternalMedia };

export function SeasonRail({ series, basePath, seasons, selected, select, episodes, missing, requestSeason, detail }: Readonly<SeasonRailProps>) {
    const choices = seasonChoices(seasons, missing);
    if (choices.length < 2) return null;
    return <section className='client-season-rail' aria-labelledby='client-season-heading'>
        <header><h2 id='client-season-heading'>Saisons</h2>
            {!!missing.length && <p className='client-season-count'>{seasonSummary(seasons, missing)}</p>}
            {/* Where the missing seasons can be found, said once, next to the count. */}
            {!!missing.length && <Suspense fallback={null}><LocalSeriesSources key={series.Id} item={series} inline /></Suspense>}
        </header>
        <div className='client-season-rail-list'>{choices.map(({ key, season, remote }) => season ?
            <SeasonPoster key={key} season={season} series={series} basePath={basePath} active={selected === key} select={select}
                partial={partialSeason(season, detail)} episodes={selected === key ? episodes : undefined} /> :
            remote && <RemoteSeasonPoster key={key} season={remote} series={series} basePath={basePath} requestSeason={requestSeason} />)}</div>
    </section>;
}

function RemoteSeasonPoster({ season, series, basePath, requestSeason }: Readonly<{
    season: RemoteSeason; series: BaseItemDto; basePath: string; requestSeason: (season: RemoteSeason) => void;
}>) {
    const [failed, setFailed] = useState(false);
    const poster = !failed && season.poster;
    const label = seasonLabel({ IndexNumber: season.number });
    const art = <span className={`client-season-poster-art${poster ? '' : ' is-fallback'}`}>
        <Artwork source={poster || artworkUrl(basePath, series)} onFailure={poster ? () => setFailed(true) : undefined} />
        {!poster && <span className='client-season-mark' aria-hidden='true'>S{season.number}</span>}
        <span className='client-season-poster-label'>{label}</span>
        <span className='client-season-status'>{season.quality && <ClientIcon name='plus' />}{season.status}</span>
    </span>;
    return season.quality ?
        <button type='button' className='client-season-poster is-remote is-requestable' aria-haspopup='dialog'
            onClick={() => requestSeason(season)}>{art}</button> :
        <div className='client-season-poster is-remote'>{art}</div>;
}

function SeasonPoster({ season, series, basePath, active, episodes, select, partial }: Readonly<{
    season: BaseItemDto; series: BaseItemDto; basePath: string; active: boolean; episodes?: BaseItemDto[]; select: (id: string) => void; partial: boolean;
}>) {
    const [failed, setFailed] = useState(false);
    const primary = !!season.ImageTags?.Primary && !failed;
    const label = seasonLabel(season);
    const { total, seen } = seasonProgress(season, episodes);
    const identifier = season.IndexNumber === 0 ? 'S0' : `S${season.IndexNumber ?? '?'}`;
    return <button type='button' className={`client-season-poster${active ? ' is-active' : ''}`} aria-pressed={active} aria-controls='client-episodes-panel'
        aria-label={[label, total ? `${seen} sur ${episodeCount(total)} vus` : '', partial ? 'Partielle' : ''].filter(Boolean).join(', ')} onClick={() => select(season.Id || '')}>
        <span className={`client-season-poster-art${primary ? '' : ' is-fallback'}`}>
            <Artwork source={artworkUrl(basePath, primary ? season : series)} onFailure={primary ? () => setFailed(true) : undefined} />
            {!primary && <span className='client-season-mark' aria-hidden='true'>{identifier}</span>}
            <span className='client-season-poster-label' aria-hidden='true'>{label}</span>
            {partial && <span className='client-season-status' aria-hidden='true'>Partielle</span>}
            {total > 0 && <span className='client-season-progress' aria-hidden='true'><i style={{ width: `${seen / total * 100}%` }} /></span>}
        </span>
    </button>;
}

type EpisodeState = {
    basePath: string;
    nextId?: string | null;
    play: (episode: BaseItemDto) => void;
};

type PanelProps = SeasonSelection & EpisodeState & {
    items?: BaseItemDto[]; loading: boolean; failed: boolean; retry: () => void;
    playQueue: PlayQueue; queueBusy: boolean; drawer: boolean; openDrawer: () => void; closeDrawer: () => void;
};

export default function SeriesEpisodesPanel(props: Readonly<PanelProps>) {
    const { seasons, missing, selected, items, loading, failed, retry, playQueue, queueBusy, drawer, openDrawer, closeDrawer } = props;
    const trigger = useRef<HTMLButtonElement>(null);
    const lastDrawer = useRef(false);
    useEffect(() => {
        const wasOpen = lastDrawer.current;
        lastDrawer.current = drawer;
        if (drawer || !wasOpen) return;
        const frame = requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
        return () => cancelAnimationFrame(frame);
    }, [drawer]);
    const [page, setPage] = useState({ season: selected, count: 24 });
    const visible = page.season === selected ? page.count : 24;
    const available = items?.filter(isQueuedVideo);
    const season = seasons.find(item => item.Id === selected);
    const { total, seen } = seasonProgress(season, available);
    const playing = !!available?.length;
    return <section id='client-episodes-panel' className='client-series-episodes-panel' aria-labelledby='client-episodes-heading'>
        <header className='client-series-episodes-heading'>
            <div><h2 id='client-episodes-heading'>{season ? seasonLabel(season) : 'Épisodes'}</h2>
                {available && <p>{episodeCount(total)} · {seen} {seen === 1 ? 'vu' : 'vus'}</p>}
            </div>
            <div className='client-series-controls'>
                {playing && <QueueAction source={available} playQueue={playQueue} pending={queueBusy} label='Lire la saison' />}
                {(playing || seasons.length + missing.length > 1) && <button ref={trigger} type='button' className='client-button client-series-all-episodes' aria-haspopup='dialog' onClick={openDrawer}><ClientIcon name='chapter' />Tous les épisodes</button>}
            </div>
        </header>
        {loading && <ClientSkeleton layout='episodes' count={4} contained label='Chargement des épisodes…' />}
        {failed && <p role='alert'>Impossible de charger les épisodes. <button type='button' className='client-button' onClick={retry}>Réessayer</button></p>}
        {!loading && !failed && !playing && <p>Aucun épisode disponible dans cette saison.</p>}
        <div className='client-series-episode-grid'>
            {available?.slice(0, visible).map(episode => <EpisodeCard key={episode.Id} episode={episode} {...props} />)}
        </div>
        {!!available && visible < available.length && <button type='button' className='client-button client-series-more-episodes' onClick={() => setPage({ season: selected, count: visible + 24 })}>Afficher plus d’épisodes</button>}
        <ClientDialog label='Tous les épisodes' title='Tous les épisodes' subtitle={season ? seasonLabel(season) : undefined}
            className='client-episodes-drawer' controlled={{ open: drawer, onClose: closeDrawer }}>
            {drawer && <EpisodeList {...props} items={available} />}
        </ClientDialog>
    </section>;
}

function EpisodeCard({ episode, basePath, nextId, play }: Readonly<EpisodeState & { episode: BaseItemDto }>) {
    const [active, setActive] = useState(false);
    const protect = useEpisodeSpoilers()(episode);
    const next = episode.Id === nextId;
    const watched = !!episode.UserData?.Played;
    const progress = progressPercent(episode);
    const card = <button type='button' className={`client-series-episode-card${next ? ' is-next' : ''}${watched ? ' is-watched' : ''}`}
        aria-label={`Lire ${episodeLabel(episode)} · ${episode.Name}${next ? ' · À suivre' : ''}${watched ? ' · Vu' : ''}`} onClick={() => play(episode)}
        onPointerEnter={() => setActive(true)} onPointerLeave={() => setActive(false)} onFocus={() => setActive(true)} onBlur={() => setActive(false)}>
        <Artwork source={artworkUrl(basePath, episode, 'episode')} className={protect ? 'client-spoiler-art' : undefined} />
        <PreviewClip item={episode} surface='episode' enabled={active} soundControl={false} />
        <span className='client-series-episode-number' aria-hidden='true'>{episode.IndexNumber}</span>
        {watched && <span className='client-series-episode-seen' aria-hidden='true'><ClientIcon name='check' /></span>}
        {next && <span className='client-series-episode-next' aria-hidden='true'>À suivre</span>}
        <span className='client-series-episode-title'>{episode.Name}</span>
        {!protect && episode.Overview && <span className='client-series-episode-overview'>{episode.Overview}</span>}
        {progress > 0 && <span className='client-series-episode-progress' aria-hidden='true'><i style={{ width: `${progress}%` }} /></span>}
    </button>;
    return protect && episode.Overview ? <div className='client-series-episode-wrap'>{card}<EpisodeSummary item={episode} protectedContent /></div> : card;
}

function EpisodeList({ seasons, missing, requestSeason, selected, select, items, loading, failed, retry, ...media }: Readonly<PanelProps>) {
    const [number, setNumber] = useState<number>();
    const remoteSeason = missing.find(season => season.number === number);
    const choices = seasonChoices(seasons, missing);
    return <div className='client-episode-editorial'>
        {choices.length > 1 && <div className='client-series-controls client-episode-editorial-seasons' role='group' aria-label='Saison'>
            {choices.map(({ key, season, remote }) => season ?
                <button key={key} type='button' className='client-button' aria-pressed={!remoteSeason && selected === key} onClick={() => {
                    setNumber(undefined);
                    select(key);
                }}>{seasonLabel(season)}</button> :
                remote && <button key={key} type='button' className='client-button is-remote' aria-pressed={remoteSeason?.number === remote.number}
                    onClick={() => setNumber(remote.number)}>{seasonLabel({ IndexNumber: remote.number })}</button>)}
        </div>}
        {remoteSeason ? <div className='client-episode-remote'>
            <p>{remoteSeason.status}</p>
            {remoteSeason.quality && <button type='button' className='client-button' aria-haspopup='dialog'
                onClick={() => requestSeason(remoteSeason)}><ClientIcon name='plus' />Demander</button>}
        </div> : <EditorialEpisodes items={items} loading={loading} failed={failed} retry={retry} {...media} />}
    </div>;
}

function EditorialEpisodes({ items, loading, failed, retry, ...media }: Readonly<EpisodeState & Pick<PanelProps, 'items' | 'loading' | 'failed' | 'retry'>>) {
    return <>
        {loading && <p role='status'>Chargement des épisodes…</p>}
        {failed && <p role='alert'>Impossible de charger les épisodes. <button type='button' className='client-button' onClick={retry}>Réessayer</button></p>}
        {!loading && !failed && !items?.length && <p>Aucun épisode disponible.</p>}
        <ol>{items?.map(episode => <EpisodeListItem key={episode.Id} episode={episode} {...media} />)}</ol>
    </>;
}

function EpisodeListItem({ episode, basePath, nextId, play }: Readonly<EpisodeState & { episode: BaseItemDto }>) {
    const protect = useEpisodeSpoilers()(episode);
    const played = episode.UserData?.Played;
    const progress = progressPercent(episode);
    const next = episode.Id === nextId;
    const started = (episode.UserData?.PlaybackPositionTicks || 0) > 0;
    const upcoming = next ? 'À suivre' : undefined;
    const watching = started ? 'En cours' : upcoming;
    const status = played ? 'Vu' : watching;
    const label = [`Lire ${episodeLabel(episode)}`, episode.Name, status].filter(Boolean).join(' · ');
    return <li><button type='button' className='client-episode-editorial-entry'
        aria-label={label} onClick={() => play(episode)}>
        <span className='client-episode-editorial-number' aria-hidden='true'>{episode.IndexNumber}</span>
        <span className='client-episode-editorial-thumbnail'><Artwork source={artworkUrl(basePath, episode, 'episode')} className={protect ? 'client-spoiler-art' : undefined} />
            {progress > 0 && <span className='client-series-episode-progress' aria-hidden='true'><i style={{ width: `${progress}%` }} /></span>}
        </span>
        <span className='client-episode-editorial-copy'>
            <strong>{episode.Name}</strong>
            <small>{[runtimeLabel(episode.RunTimeTicks), status].filter(Boolean).join(' · ')}</small>
            {!protect && episode.Overview && <span className='client-episode-editorial-summary'>{episode.Overview}</span>}
        </span>
    </button>{protect && <EpisodeSummary item={episode} protectedContent />}</li>;
}

/* eslint-enable react/jsx-no-bind */
