/* eslint-disable react/jsx-no-bind -- View-local closures do not cross memoized component boundaries. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { getUserDataApi } from '@jellyfin/sdk/lib/utils/api/user-data-api';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';

import Page from 'components/Page';
import { playbackManager } from 'components/playback/playbackmanager';
import { useApi } from 'hooks/useApi';
import type { ItemDto } from 'types/base/models/item-dto';
import Dashboard from 'utils/dashboard';

import MediaRow from '../features/client/MediaRow';
import { episodeLabel, progressPercent, uniqueItems } from '../features/client/model';
import { clientRequest } from '../features/client/session';
import { useClientDetails, useClientGenres, useClientMedia } from '../features/client/useClientMedia';
import '../features/client/client.scss';
import '../features/client/prototype.scss';

type Preferences = { glass: boolean, floating: boolean, detail: 'continuous' | 'fade' | 'immersive' };
type ClientNavigationState = { returnTo?: string, returnState?: ClientNavigationState | null, restoreFocus?: boolean };
const defaults: Preferences = { glass: true, floating: false, detail: 'continuous' };
const links = [['home', 'Accueil'], ['series', 'Séries'], ['films', 'Films'], ['search', 'Rechercher'], ['mine', 'Ma liste']];

function useClientController() {
    const { api, user } = useApi();
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const restoreFocus = useNavigationType() === 'POP' || (location.state as ClientNavigationState | null)?.restoreFocus === true;
    const view = params.get('view') || 'home';
    const id = params.get('id') || '';
    const search = params.get('q') || '';
    const parsedOffset = Number(params.get('offset'));
    const offset = Number.isFinite(parsedOffset) ? Math.max(0, Math.floor(parsedOffset)) : 0;
    const season = params.get('season') || '';
    const genre = params.get('genre') || '';
    const sort = params.get('sort') === 'recent' ? 'recent' : 'name';
    const genres = useClientGenres(view);
    const cache = useQueryClient();
    const [preferences, setPreferences] = useState(defaults);
    const [actionError, setActionError] = useState('');
    const [busy, setBusy] = useState(false);
    const [searchInput, setSearchInput] = useState(search);
    const [heroIndex, setHeroIndex] = useState(0);
    const [heroPaused, setHeroPaused] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const media = useClientMedia(id || view === 'settings' ? 'disabled' : view, search, offset, genre, sort);
    const details = useClientDetails(id, season);
    const item = details.item.data;
    const prefKey = `client-interface-${api?.basePath}-${user?.Id}`;

    useEffect(() => {
        if (!profileOpen) return;
        const close = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setProfileOpen(false);
        };
        document.addEventListener('keydown', close);
        return () => document.removeEventListener('keydown', close);
    }, [profileOpen]);

    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(prefKey) || '{}');
            setPreferences({ glass: typeof saved.glass === 'boolean' ? saved.glass : true,
                floating: saved.floating === true,
                detail: ['continuous', 'fade', 'immersive'].includes(saved.detail) ? saved.detail : 'continuous' });
        } catch { setPreferences(defaults); }
    }, [prefKey]);

    useEffect(() => {
        setSearchInput(search);
    }, [search]);
    useEffect(() => {
        setActionError('');
    }, [params]);
    const pageReady = id ? !!item : view === 'settings' || !!media.data;
    useLayoutEffect(() => {
        if (!pageReady) return;
        const key = `${prefKey}-scroll-${params.toString()}`;
        try {
            window.scrollTo(0, Number(sessionStorage.getItem(key)) || 0);
        } catch {
            window.scrollTo(0, 0);
        }
        try {
            const savedFocus = sessionStorage.getItem(`${key}-focus`);
            const target = restoreFocus ? Array.from(document.querySelectorAll<HTMLElement>('#clientPage [data-client-focus]'))
                .find(element => savedFocus && element.getAttribute('data-client-focus') === savedFocus) : undefined;
            (target || (id ? document.querySelector<HTMLElement>('#clientPage .client-back') : null))?.focus({ preventScroll: true });
        } catch { /* Navigation remains usable when storage is unavailable. */ }
        const saveFocus = (event: FocusEvent) => {
            const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-client-focus]') : null;
            if (target?.dataset.clientFocus) {
                try {
                    sessionStorage.setItem(`${key}-focus`, target.dataset.clientFocus);
                } catch { /* Storage can be disabled. */ }
            }
        };
        const saveScroll = () => {
            try {
                sessionStorage.setItem(key, String(window.scrollY));
            } catch { /* Storage can be disabled. */ }
        };
        window.addEventListener('scroll', saveScroll, { passive: true });
        const page = document.getElementById('clientPage');
        page?.addEventListener('focusin', saveFocus);
        return () => {
            window.removeEventListener('scroll', saveScroll);
            page?.removeEventListener('focusin', saveFocus);
        };
    }, [params, pageReady, prefKey, id, restoreFocus]);

    function savePreference(next: Preferences) {
        setPreferences(next);
        try {
            localStorage.setItem(prefKey, JSON.stringify(next));
        } catch { /* In-memory setting remains usable. */ }
    }
    function image(i: BaseItemDto, backdrop = false) {
        let imageId = i.ImageTags?.Primary ? i.Id : i.SeriesId || i.Id;
        if (backdrop) imageId = i.BackdropImageTags?.length ? i.Id : i.ParentBackdropItemId || i.SeriesId || i.Id;
        if (!api || !imageId) return '';
        return `${api.basePath}/Items/${imageId}/Images/${backdrop ? 'Backdrop/0' : 'Primary'}?maxWidth=${backdrop ? 2560 : 900}&quality=90`;
    }
    function logo(i: BaseItemDto) {
        const imageId = i.ImageTags?.Logo ? i.Id : i.SeriesId;
        return imageId && api ? `${api.basePath}/Items/${imageId}/Images/Logo?maxWidth=900&quality=90` : undefined;
    }
    async function play(i: BaseItemDto) {
        setActionError('');
        try {
            await playbackManager.play({ items: [i as ItemDto], startPositionTicks: i.UserData?.PlaybackPositionTicks || 0 });
        } catch { setActionError('La lecture n’a pas pu démarrer. Réessayez ou ouvrez la fiche Jellyfin.'); }
    }
    async function updateState(kind: 'favorite' | 'played', target = item) {
        if (!api || !user?.Id || !target?.Id || busy) return;
        setBusy(true);
        try {
            const data = getUserDataApi(api);
            const p = { userId: user.Id, itemId: target.Id };
            if (kind === 'favorite') await clientRequest(() => target.UserData?.IsFavorite ? data.unmarkFavoriteItem(p) : data.markFavoriteItem(p));
            else await clientRequest(() => target.UserData?.Played ? data.markUnplayedItem(p) : data.markPlayedItem(p));
            await cache.invalidateQueries({ queryKey: ['Client', api.basePath, user.Id] });
        } catch {
            setActionError('Le changement n’a pas été enregistré. Réessayez.');
        } finally {
            setBusy(false);
        }
    }
    function cards(items: BaseItemDto[], horizontal = false) {
        return items.map(i => <Link className={`client-card${horizontal ? ' client-card-wide' : ''}`} key={i.Id} data-client-focus={i.Id}
            to={`/client?id=${i.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state as ClientNavigationState | null }} aria-label={[i.SeriesName, i.Name].filter(Boolean).join(' · ')}>
            <img src={image(i, horizontal)} alt='' loading='lazy' onError={e => { e.currentTarget.hidden = true; }} />
            {horizontal && <span className='client-card-caption'><strong>{i.SeriesName || i.Name}</strong>
                <small>{i.Type === 'Episode' ? `${episodeLabel(i)} · ${i.Name}` : i.ProductionYear}</small></span>}
            {progressPercent(i) > 0 && <span className='client-progress'><i style={{ width: `${progressPercent(i)}%` }} /></span>}
            <span className='client-card-fallback'>{i.Name}</span>
        </Link>);
    }
    function row(title: string, items: BaseItemDto[] | undefined, horizontal = false) {
        if (!items?.length) return null;
        return <MediaRow title={title} items={items} continuation={horizontal} image={image} logo={logo} onPlay={play} onFavorite={target => updateState('favorite', target)} />;
    }
    const heroItems = [...(media.data?.movies || []).slice(0, 3), ...(media.data?.series || []).slice(0, 2)];
    const lead = heroItems[heroIndex % Math.max(1, heroItems.length)];
    useEffect(() => {
        if (view !== 'home' || id || heroPaused || heroItems.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const timer = window.setInterval(() => {
            if (!document.hidden) setHeroIndex(index => index + 1);
        }, 8000);
        return () => window.clearInterval(timer);
    }, [view, id, heroPaused, heroItems.length]);
    const playItem = item?.Type === 'Series' ? details.next.data || details.episodes.data?.[0] : item;
    const homeHero = view === 'home' ? lead : undefined;
    const hero = id ? item : homeHero;
    const error = id ? details.item.isError : media.isError;
    return { api, user, params, location, setParams, view, id, search, offset, media, details, item, preferences, actionError, busy,
        searchInput, setSearchInput, genres, genre, sort, savePreference, image, play, updateState, cards, row, playItem, hero, error,
        heroItems, heroIndex, setHeroIndex, setHeroPaused, profileOpen, setProfileOpen };
}

type ClientModel = ReturnType<typeof useClientController>;
type ViewProps = { readonly model: ClientModel };

export default function Client() {
    const model = useClientController();
    return <ClientView model={model} />;
}

function ClientView({ model }: ViewProps) {
    const { preferences, id, view, user, actionError, error, media, details, profileOpen, setProfileOpen } = model;
    return <Page id='clientPage' title='Client' className='client-page' isBackButtonEnabled={false}>
        <div className={`client-interface ${preferences.glass ? 'client-glass' : 'client-classic'} ${preferences.floating ? 'client-floating' : ''} client-layout-${preferences.detail} ${id ? 'client-detail-page' : ''}`}>
            <nav className='client-nav' aria-label='Navigation principale'>
                <button className='client-profile' aria-label='Menu du profil' aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}>{user?.Name?.slice(0, 1) || '•'}</button>
                <div><Link to='/client?view=search' aria-label='Rechercher' className='client-search-shortcut'>⌕</Link>{links.filter(([key]) => key !== 'search').map(([key, label]) => <Link key={key} to={`/client?view=${key}`} aria-current={!id && view === key ? 'page' : undefined}>{label}</Link>)}</div>
                <Link to='/client' className='client-brand' aria-label='Accueil'>C</Link>
                {profileOpen && <div className='client-profile-menu' role='dialog' aria-label='Menu du profil'>
                    <strong>{user?.Name}</strong><Link to='/client?view=mine' onClick={() => setProfileOpen(false)}>Mon espace</Link><Link to='/client?view=settings' aria-label='Paramètres' onClick={() => setProfileOpen(false)}>Paramètres</Link><button onClick={Dashboard.logout}>Se déconnecter</button>
                </div>}
            </nav>
            {actionError && <p role='alert' className='client-message'>{actionError}</p>}
            {error && <div className='client-message' role='alert'><p>Impossible de charger les médias.</p><button onClick={() => (id ? details.item.refetch() : media.refetch())}>Réessayer</button></div>}
            {(id ? details.item.isPending : view !== 'settings' && media.isPending) && <p className='client-message' role='status'>Chargement…</p>}
            <HeroView model={model} />
            <ContentView model={model} />
        </div>
    </Page>;
}

function HeroView({ model }: ViewProps) {
    const { hero, id, item, api, location, playItem, busy, details, image, play, updateState, setParams, heroItems, heroIndex, setHeroIndex, setHeroPaused } = model;
    if (!hero) return null;
    const homePlayable = hero.Type === 'Movie' ? hero : undefined;
    const playable = id ? playItem : homePlayable;
    let playLabel = 'Lecture';
    if (playable?.UserData?.PlaybackPositionTicks) playLabel = 'Reprendre';
    if (playable?.Type === 'Episode') playLabel = episodeLabel(playable);
    let kind = 'FILM';
    if (hero.Type === 'Series') kind = 'SÉRIE';
    if (hero.Type === 'Episode') kind = hero.SeriesName || 'ÉPISODE';
    return <section className={`client-hero${id ? ' client-detail' : ' client-home-hero'}`} onPointerEnter={() => setHeroPaused(true)} onPointerLeave={() => setHeroPaused(false)} onFocus={() => setHeroPaused(true)} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeroPaused(false);
    }}>
        <img key={hero.Id} className='client-background' src={image(hero, true)} alt='' onError={e => { e.currentTarget.hidden = true; }} />
        {id && <Link className='client-back' to={(location.state as ClientNavigationState | null)?.returnTo || '/client'} state={{ ...(location.state as ClientNavigationState | null)?.returnState, restoreFocus: true }}>‹ Retour</Link>}
        <div className='client-hero-copy'><span className='client-eyebrow'>{id ? kind : 'À LA UNE'}</span>
            {hero.ImageTags?.Logo ? <img className='client-title-logo' src={`${api?.basePath}/Items/${hero.Id}/Images/Logo?maxWidth=740&quality=90`} alt={hero.Name || ''} onError={e => {
                e.currentTarget.hidden = true;
                e.currentTarget.nextElementSibling?.removeAttribute('hidden');
            }} /> : null}
            <h1 hidden={!!hero.ImageTags?.Logo}>{hero.Name}</h1>
            <p className='client-meta'>{[hero.ProductionYear, ...(hero.Genres || []).slice(0, 2), hero.RunTimeTicks ? `${Math.round(hero.RunTimeTicks / 6e8)} min` : '', hero.CommunityRating ? `★ ${(hero.CommunityRating / 2).toFixed(1)}/5` : ''].filter(Boolean).join(' · ')}</p>
            {id && <p className='client-overview'>{hero.Overview}</p>}
            <div className='client-actions'>
                {playable && <button className='client-play' onClick={() => play(playable)}>▶ {playLabel}</button>}
                {!id && <Link className='client-button' data-client-focus={`info-${hero.Id}`} to={`/client?id=${hero.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state as ClientNavigationState | null }}>ⓘ Plus d’infos</Link>}
                {id && <><button className='client-button' disabled={busy} aria-pressed={!!item?.UserData?.IsFavorite} onClick={() => updateState('favorite')}>{item?.UserData?.IsFavorite ? '✓ Ma liste' : '+ Ma liste'}</button>
                    <button className='client-button' disabled={busy} aria-pressed={!!item?.UserData?.Played} onClick={() => updateState('played')}>{item?.UserData?.Played ? '✓ Vu' : 'Marquer vu'}</button></>}
            </div>
            {id && <Link className='client-original-link' to={`/details?id=${hero.Id}`}>Options et fiche Jellyfin ›</Link>}
        </div>
        {!id && heroItems.length > 1 && <><div className='client-hero-dots' aria-label='Médias à la une'>{heroItems.map((entry, index) => <button key={entry.Id} aria-label={`Afficher ${entry.Name}`} aria-pressed={heroIndex % heroItems.length === index} onClick={() => setHeroIndex(index)} />)}</div><div className='client-hero-arrows'><button aria-label='Média précédent' onClick={() => setHeroIndex(index => (index + heroItems.length - 1) % heroItems.length)}>‹</button><button aria-label='Média suivant' onClick={() => setHeroIndex(index => index + 1)}>›</button></div></>}
        {id && item?.Type === 'Series' && <section className='client-episodes'><header><h2>Épisodes</h2><div role='group' aria-label='Saison'>{details.seasons.data?.map(s => <button key={s.Id} aria-pressed={details.selected === s.Id} onClick={() => setParams({ id, season: s.Id! }, { state: location.state })}>{s.IndexNumber === 0 ? 'Spéciaux' : `Saison ${s.IndexNumber}`}</button>)}</div></header>
            {details.episodes.isPending && !!details.selected && <p role='status'>Chargement des épisodes…</p>}
            {details.episodes.isError && <button onClick={() => details.episodes.refetch()}>Réessayer le chargement des épisodes</button>}
            <div className='client-strip'>{details.episodes.data?.map(e => <button className='client-episode' key={e.Id} onClick={() => play(e)} aria-label={`Lire ${episodeLabel(e)} ${e.Name}`}>
                <img src={image(e)} alt='' loading='lazy' onError={event => { event.currentTarget.hidden = true; }} /><span><strong>{e.Name}</strong><small>{episodeLabel(e)} · {Math.round((e.RunTimeTicks || 0) / 6e8)} min</small></span>
                <i className='client-progress'><i style={{ width: `${progressPercent(e)}%` }} /></i></button>)}</div>
            {(details.episodes.data?.length === 0 || details.seasons.data?.length === 0) && <p>Aucun épisode disponible dans cette saison.</p>}
        </section>}
    </section>;
}

function ContentView({ model }: ViewProps) {
    const { id, view, details, media, row } = model;
    if (id) return row('Dans le même esprit', details.similar.data);
    if (view === 'home') {
        return <>
            {row('Continuer à regarder', uniqueItems([...(media.data?.resume || []), ...(media.data?.next || [])]).filter((entry, index, all) => !entry.SeriesId || all.findIndex(other => other.SeriesId === entry.SeriesId) === index), true)}
            {row('Films récemment ajoutés', media.data?.movies)}
            {row('Séries récemment ajoutées', media.data?.series)}
            {media.data && !media.data.movies.length && !media.data.series.length && !media.data.resume.length && <p className='client-message'>Votre bibliothèque est vide pour le moment.</p>}
        </>;
    }
    if (view === 'settings') return <SettingsView model={model} />;
    return <LibraryView model={model} />;
}
function SettingsView({ model }: ViewProps) {
    const { preferences, savePreference, user } = model;
    return <section className='client-settings'><h1>Personnaliser l’interface</h1>
        <h2>Thème</h2><div className='client-setting-options'>{[[true, 'Liquid Glass'], [false, 'Classique']].map(([key, label]) => <button key={String(key)} aria-pressed={preferences.glass === key} onClick={() => savePreference({ ...preferences, glass: key as boolean })}>{label}</button>)}</div>
        <h2>Navigation</h2><div className='client-setting-options'>{[[false, 'Bandeau du thème'], [true, 'Boutons flottants']].map(([key, label]) => <button key={String(key)} aria-pressed={preferences.floating === key} onClick={() => savePreference({ ...preferences, floating: key as boolean })}>{label}</button>)}</div>
        <h2>Fond des fiches</h2><div className='client-setting-options'>{[['continuous', 'Fond continu'], ['fade', 'Fondu progressif'], ['immersive', 'Fiche immersive']].map(([key, label]) => <button key={key} aria-pressed={preferences.detail === key} onClick={() => savePreference({ ...preferences, detail: key as Preferences['detail'] })}>{label}</button>)}</div>
        <Link className='client-button client-settings-link' to={`/mypreferencesmenu?userId=${user?.Id || ''}`}>Compte et réglages de lecture Jellyfin ›</Link>
        <button className='client-logout' onClick={Dashboard.logout}>Se déconnecter</button>
    </section>;
}
function LibraryView({ model }: ViewProps) {
    const { view, offset, search, searchInput, setSearchInput, setParams, cards, media, genres, genre, sort } = model;
    return <section className='client-library'><h1>{links.find(([key]) => key === view)?.[1] || 'Bibliothèque'}</h1>
        <form onSubmit={e => {
            e.preventDefault();
            setParams({ view, q: searchInput, genre, sort });
        }}><input aria-label='Rechercher un film ou une série' placeholder='Titre d’un film ou d’une série' value={searchInput} onChange={e => setSearchInput(e.target.value)} /><button>Rechercher</button></form>
        <div className='client-filter-options'><label>Genre <select value={genre} onChange={e => setParams({ view, q: search, genre: e.target.value, sort })}><option value=''>Tous les genres</option>{genres.data?.filter(g => g.Name).map(g => <option key={g.Id || g.Name} value={g.Name!}>{g.Name}</option>)}</select></label><label>Trier <select value={sort} onChange={e => setParams({ view, q: search, genre, sort: e.target.value })}><option value='name'>Titre</option><option value='recent'>Ajouts récents</option></select></label></div>
        <div className='client-grid'>{cards(media.data?.items || [])}</div>
        {media.data?.items.length === 0 && <p>{view === 'mine' ? 'Ajoutez des films et des séries à votre liste depuis leurs fiches.' : 'Aucun résultat.'}</p>}
        <div className='client-pagination'><button disabled={offset === 0} onClick={() => setParams({ view, q: search, genre, sort, offset: String(Math.max(0, offset - 48)) })}>Précédent</button><span>{media.data?.items.length ? offset + 1 : 0}–{offset + (media.data?.items.length || 0)} / {media.data?.total || 0}</span><button disabled={offset + 48 >= (media.data?.total || 0)} onClick={() => setParams({ view, q: search, genre, sort, offset: String(offset + 48) })}>Suivant</button></div>
    </section>;
}

/* eslint-enable react/jsx-no-bind */
