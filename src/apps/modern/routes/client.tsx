/* eslint-disable react/jsx-no-bind -- View-local closures do not cross memoized component boundaries. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { getUserDataApi } from '@jellyfin/sdk/lib/utils/api/user-data-api';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useQueryClient } from '@tanstack/react-query';
import React, { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';

import Page from 'components/Page';
import { playbackManager } from 'components/playback/playbackmanager';
import { useApi } from 'hooks/useApi';
import type { ItemDto } from 'types/base/models/item-dto';
import Dashboard from 'utils/dashboard';

import HeroArtwork from '../features/client/HeroArtwork';
import ClientIcon from '../features/client/ClientIcon';
import useArtworkColor from '../features/client/useArtworkColor';
import PlannedRating from '../features/client/PlannedRating';
import HeroMetadata from '../features/client/HeroMetadata';
import DetailExtras from '../features/client/DetailExtras';
import InterfacePreview from '../features/client/InterfacePreview';
import { RecentPage, TonightPage } from '../features/client/LocalDiscoveryPages';
import MediaRow from '../features/client/MediaRow';
import { episodeLabel, progressPercent, uniqueItems } from '../features/client/model';
import { clientRequest } from '../features/client/session';
import { useClientCollections, useClientDetails, useClientFilters, useClientMedia } from '../features/client/useClientMedia';
import '../features/client/client.scss';
import '../features/client/prototype.scss';

type Preferences = { glass: boolean, floating: boolean, chromatic: boolean, detail: 'continuous' | 'fade' | 'immersive' };
type ClientNavigationState = { returnTo?: string, returnState?: ClientNavigationState | null, restoreFocus?: boolean };
const defaults: Preferences = { glass: true, floating: false, chromatic: false, detail: 'continuous' };
const links = [['home', 'Accueil'], ['series', 'Séries'], ['films', 'Films'], ['recent', 'Nouveautés'], ['tonight', 'Ce soir'], ['search', 'Rechercher'], ['mine', 'Mon espace']];

function useClientController() {
    const { api, user } = useApi();
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const restoreFocus = useNavigationType() === 'POP' || (location.state as ClientNavigationState | null)?.restoreFocus === true;
    const view = params.get('view') || 'home';
    const discovery = (view === 'films' || view === 'series') && params.get('mode') !== 'library';
    const id = params.get('id') || '';
    const search = params.get('q') || '';
    const parsedOffset = Number(params.get('offset'));
    const offset = Number.isFinite(parsedOffset) ? Math.max(0, Math.floor(parsedOffset)) : 0;
    const season = params.get('season') || '';
    const genre = params.get('genre') || '';
    const person = params.get('person') || '';
    const audio = params.get('audio') || '';
    const collection = params.get('collection') || '';
    const sort = params.get('sort') === 'recent' ? 'recent' : 'name';
    const filters = useClientFilters(view);
    const genres = { ...filters, data: filters.data?.Genres };
    const cache = useQueryClient();
    const [preferences, setPreferences] = useState(defaults);
    const [actionError, setActionError] = useState('');
    const [busy, setBusy] = useState(false);
    const [searchInput, setSearchInput] = useState(search);
    const [heroIndex, setHeroIndex] = useState(0);
    const [heroPaused, setHeroPaused] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const profileButton = useRef<HTMLButtonElement>(null);
    const profileMenu = useRef<HTMLDivElement>(null);
    const media = useClientMedia(id || view === 'settings' ? 'disabled' : view, search, offset, { genre, sort, person, audio, collection });
    const details = useClientDetails(id, season);
    const item = details.item.data;
    const prefKey = `client-interface-${api?.basePath}-${user?.Id}`;

    useEffect(() => {
        if (!profileOpen) return;
        const close = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setProfileOpen(false);
                profileButton.current?.focus();
            }
        };
        const outside = (event: Event) => {
            if (event.target instanceof Node && !profileMenu.current?.contains(event.target) && !profileButton.current?.contains(event.target)) setProfileOpen(false);
        };
        profileMenu.current?.querySelector<HTMLElement>('a, button')?.focus();
        document.addEventListener('keydown', close);
        document.addEventListener('pointerdown', outside);
        document.addEventListener('focusin', outside);
        return () => {
            document.removeEventListener('keydown', close);
            document.removeEventListener('pointerdown', outside);
            document.removeEventListener('focusin', outside);
        };
    }, [profileOpen]);

    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(prefKey) || '{}');
            setPreferences({ glass: typeof saved.glass === 'boolean' ? saved.glass : true,
                floating: saved.floating === true, chromatic: saved.chromatic === true,
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

    useEffect(() => {
        document.body.dataset.clientPlayerTheme = preferences.glass ? 'glass' : 'classic';
    }, [preferences.glass]);

    function savePreference(next: Preferences) {
        setPreferences(next);
        try {
            localStorage.setItem(prefKey, JSON.stringify(next));
        } catch { /* In-memory setting remains usable. */ }
    }
    function image(i: BaseItemDto, backdrop = false) {
        let imageId = i.Type === 'Episode' ? i.SeriesId || i.Id : i.Id;
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
    const heroItems = discovery ? (media.data?.items || []).slice(0, 5) : [...(media.data?.movies || []).slice(0, 3), ...(media.data?.series || []).slice(0, 2)];
    const lead = heroItems[heroIndex % Math.max(1, heroItems.length)];
    useEffect(() => {
        if (!(view === 'home' || discovery) || id || heroPaused || heroItems.length < 2 || reducedMotion) return;
        const timer = window.setInterval(() => {
            const rect = document.querySelector('.client-home-hero')?.getBoundingClientRect();
            if (!document.hidden && rect && rect.bottom > 0 && rect.top < window.innerHeight) setHeroIndex(index => index + 1);
        }, 8000);
        return () => window.clearInterval(timer);
    }, [view, discovery, id, heroPaused, heroItems.length, reducedMotion]);
    const playItem = item?.Type === 'Series' ? details.next.data || details.episodes.data?.[0] : item;
    const homeHero = view === 'home' || discovery ? lead : undefined;
    const hero = id ? item : homeHero;
    const accent = useArtworkColor(preferences.chromatic && hero ? image(hero, true) : undefined);
    const error = id ? details.item.isError : media.isError;
    return { api, user, params, location, setParams, view, id, search, offset, media, details, item, preferences, actionError, busy,
        searchInput, setSearchInput, genres, genre, sort, savePreference, image, play, updateState, cards, row, playItem, hero, error,
        heroItems, heroIndex, setHeroIndex, setHeroPaused, profileOpen, setProfileOpen, profileButton, profileMenu, discovery, filters, audio, accent };
}

type ClientModel = ReturnType<typeof useClientController>;
type ViewProps = { readonly model: ClientModel };

export default function Client() {
    const model = useClientController();
    return <ClientView model={model} />;
}

function ClientView({ model }: ViewProps) {
    const { preferences, id, view, user, actionError, error, media, details, profileOpen, setProfileOpen, profileButton, profileMenu, accent } = model;
    return <Page id='clientPage' title='Client' className='client-page' isBackButtonEnabled={false}>
        <div className={`client-interface ${preferences.glass ? 'client-glass' : 'client-classic'} ${preferences.floating ? 'client-floating' : ''} ${preferences.chromatic ? 'client-chromatic' : ''} client-layout-${preferences.detail} ${id ? 'client-detail-page' : ''}`} style={{ '--client-accent': accent } as CSSProperties}>
            <nav className='client-nav' aria-label='Navigation principale'>
                <button ref={profileButton} className='client-profile' aria-label='Menu du profil' aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}>{user?.Name?.slice(0, 1) || '•'}</button>
                <div><Link to='/client?view=search' aria-label='Rechercher' className='client-search-shortcut'><ClientIcon name='search' /></Link>{links.filter(([key]) => key !== 'search').map(([key, label]) => <Link key={key} to={`/client?view=${key}`} aria-current={!id && view === key ? 'page' : undefined}>{label}</Link>)}</div>
                <Link to='/client' className='client-brand' aria-label='Accueil'>C</Link>
                {profileOpen && <div ref={profileMenu} className='client-profile-menu' role='dialog' aria-label='Menu du profil'>
                    <strong>{user?.Name}</strong><Link to='/client?view=mine' onClick={() => setProfileOpen(false)}>Mon espace</Link><Link to='/client?view=settings' aria-label='Paramètres' onClick={() => setProfileOpen(false)}>Paramètres</Link><button onClick={Dashboard.logout}>Se déconnecter</button>
                </div>}
            </nav>
            {actionError && <p role='alert' className='client-message'>{actionError}</p>}
            {error && <div className='client-message' role='alert'><p>Impossible de charger les médias.</p><button onClick={() => (id ? details.item.refetch() : media.refetch())}>Réessayer</button></div>}
            {(id ? details.item.isPending : view !== 'settings' && media.isPending) && <p className='client-message' role='status'>Chargement…</p>}
            <BrowseControls model={model} />
            <HeroView model={model} />
            <ContentView model={model} />
        </div>
    </Page>;
}

function HeroView({ model }: ViewProps) {
    const { hero, id, location, image, heroItems, heroIndex, setHeroIndex, setHeroPaused } = model;
    if (!hero) return null;
    return <section className={`client-hero${id ? ' client-detail' : ' client-home-hero'}${hero.Type === 'Series' && id ? ' client-series-detail' : ''}`} onPointerEnter={() => setHeroPaused(true)} onPointerLeave={() => setHeroPaused(false)} onFocus={() => setHeroPaused(true)} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeroPaused(false);
    }}>
        <HeroArtwork source={image(hero, true)} />
        {id && <div className='client-detail-atmosphere' style={{ backgroundImage: `url("${image(hero, true)}")` }} aria-hidden='true' />}
        {id && <Link className='client-back' to={(location.state as ClientNavigationState | null)?.returnTo || '/client'} state={{ ...(location.state as ClientNavigationState | null)?.returnState, restoreFocus: true }}><ClientIcon name='back' />Retour</Link>}
        <HeroCopyView model={model} />
        {!id && heroItems.length > 1 && <><div className='client-hero-dots' aria-label='Médias à la une'>{heroItems.map((entry, index) => <button key={entry.Id} aria-label={`Afficher ${entry.Name}`} aria-pressed={heroIndex % heroItems.length === index} onClick={() => setHeroIndex(index)} />)}</div><div className='client-hero-arrows'><button aria-label='Média précédent' onClick={() => setHeroIndex(index => (index + heroItems.length - 1) % heroItems.length)}><ClientIcon name='back' /></button><button aria-label='Média suivant' onClick={() => setHeroIndex(index => index + 1)}><ClientIcon name='next' /></button></div></>}
        <EpisodesView model={model} />
    </section>;
}

function HeroCopyView({ model }: ViewProps) {
    const { hero, id, api } = model;
    const [synopsisExpanded, setSynopsisExpanded] = useState(false);
    useEffect(() => setSynopsisExpanded(false), [hero?.Id]);
    if (!hero) return null;
    return <div className='client-hero-copy'><span className='client-eyebrow'>{id ? '✓ Disponible' : 'À LA UNE'}</span>
        {hero.ImageTags?.Logo ? <img className='client-title-logo' src={`${api?.basePath}/Items/${hero.Id}/Images/Logo?maxWidth=740&quality=90`} alt={hero.Name || ''} onError={e => {
            e.currentTarget.hidden = true;
            e.currentTarget.nextElementSibling?.removeAttribute('hidden');
        }} /> : null}
        <h1 hidden={!!hero.ImageTags?.Logo}>{hero.Name}</h1>
        <HeroMetadata item={hero} detailed={!!id} />
        {id && <><p className={`client-overview${synopsisExpanded ? ' expanded' : ''}`}>{hero.Overview}</p>{hero.Type === 'Series' && (hero.Overview?.length || 0) > 220 && <button className='client-synopsis-toggle' aria-expanded={synopsisExpanded} onClick={() => setSynopsisExpanded(!synopsisExpanded)}>{synopsisExpanded ? 'Réduire' : 'Lire la suite'}</button>}</>}
        <HeroActions model={model} />
        {id && <PlannedRating />}
        {id && <Link className='client-original-link' to={`/details?id=${hero.Id}`}>Options et fiche Jellyfin ›</Link>}
    </div>;
}

function HeroActions({ model }: ViewProps) {
    const { hero, id, item, location, playItem, busy, play, updateState } = model;
    if (!hero) return null;
    const homePlayable = hero.Type === 'Movie' ? hero : undefined;
    const playable = id ? playItem : homePlayable;
    let playLabel = 'Lecture';
    if (playable?.UserData?.PlaybackPositionTicks) playLabel = 'Reprendre';
    if (playable?.Type === 'Episode') playLabel = episodeLabel(playable);
    return <div className='client-actions'>
        {playable && <button className='client-play' onClick={() => play(playable)}><ClientIcon name='play' />{playLabel}</button>}
        {!id && <Link className='client-button' data-client-focus={`info-${hero.Id}`} to={`/client?id=${hero.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state as ClientNavigationState | null }}><ClientIcon name='info' />Plus d’infos</Link>}
        {id && <><button className='client-button client-action-circle' aria-label={item?.UserData?.IsFavorite ? 'Retirer de ma liste' : 'Ajouter à ma liste'} title={item?.UserData?.IsFavorite ? 'Retirer de ma liste' : 'Ajouter à ma liste'} disabled={busy} aria-pressed={!!item?.UserData?.IsFavorite} onClick={() => updateState('favorite')}><ClientIcon name={item?.UserData?.IsFavorite ? 'check' : 'plus'} /></button>
            <button className='client-button client-action-circle' aria-label={item?.UserData?.Played ? 'Marquer non vu' : 'Marquer vu'} title={item?.UserData?.Played ? 'Marquer non vu' : 'Marquer vu'} disabled={busy} aria-pressed={!!item?.UserData?.Played} onClick={() => updateState('played')}><ClientIcon name={item?.UserData?.Played ? 'check' : 'eye'} /></button>
            <button className='client-button client-action-circle' disabled aria-label='Ajouter à une collection : à venir' title='Ajout aux collections à venir'><ClientIcon name='collection' /></button>
            <button className='client-button client-action-circle' disabled aria-label='Téléchargement : à venir' title='Téléchargement hors ligne à venir'><ClientIcon name='download' /></button></>}
    </div>;
}

function EpisodesView({ model }: ViewProps) {
    const { id, item, details, setParams, location, api, play } = model;
    if (!id || item?.Type !== 'Series') return null;
    return <section className='client-episodes'><header><h2>Épisodes</h2><div role='group' aria-label='Saison'>{details.seasons.data?.map(s => <button key={s.Id} aria-pressed={details.selected === s.Id} onClick={() => setParams({ id, season: s.Id! }, { state: location.state })}><strong>{s.IndexNumber === 0 ? 'Spéciaux' : `Saison ${s.IndexNumber}`}</strong><small>{s.ChildCount ? `${s.ChildCount} épisodes` : 'Voir les épisodes'}</small></button>)}</div></header>
        {details.episodes.isPending && !!details.selected && <p role='status'>Chargement des épisodes…</p>}
        {details.episodes.isError && <button onClick={() => details.episodes.refetch()}>Réessayer le chargement des épisodes</button>}
        <div className='client-strip'>{details.episodes.data?.map(e => <button className='client-episode' key={e.Id} onClick={() => play(e)} aria-label={`Lire ${episodeLabel(e)} ${e.Name}`}>
            <img src={api ? `${api.basePath}/Items/${e.Id}/Images/Primary?maxWidth=1280&quality=90` : ''} alt='' loading='lazy' onError={event => { event.currentTarget.hidden = true; }} /><span className='client-episode-play' aria-hidden='true'><ClientIcon name='play' /></span><span><strong>{e.Name}</strong><small>{episodeLabel(e)} · {Math.round((e.RunTimeTicks || 0) / 6e8)} min</small></span>
            <i className='client-progress'><i style={{ width: `${progressPercent(e)}%` }} /></i></button>)}</div>
        {(details.episodes.data?.length === 0 || details.seasons.data?.length === 0) && <p>Aucun épisode disponible dans cette saison.</p>}
    </section>;
}

function ContentView({ model }: ViewProps) {
    const { id, view, details, media, row, api, image } = model;
    if (id) return details.item.data && api ? <DetailExtras item={details.item.data} basePath={api.basePath} similar={details.similar.data || []} image={image} /> : null;
    if (view === 'home') {
        return <>
            {row('Continuer à regarder', uniqueItems([...(media.data?.resume || []), ...(media.data?.next || [])]).filter((entry, index, all) => !entry.SeriesId || all.findIndex(other => other.SeriesId === entry.SeriesId) === index), true)}
            {row('Films récemment ajoutés', media.data?.movies)}
            {row('Séries récemment ajoutées', media.data?.series)}
            {media.data && !media.data.movies.length && !media.data.series.length && !media.data.resume.length && <p className='client-message'>Votre bibliothèque est vide pour le moment.</p>}
        </>;
    }
    if (view === 'settings') return <SettingsView model={model} />;
    if (view === 'recent') return <RecentPage items={media.data?.items || []} row={row} />;
    if (view === 'tonight') return <TonightPage items={media.data?.items || []} genres={model.genres.data || []} row={row} />;
    if (model.discovery) return <DiscoveryView model={model} />;
    if (view === 'mine') return <PersonalView model={model} />;
    return <LibraryView model={model} />;
}
function SettingsView({ model }: ViewProps) {
    const { preferences, savePreference, user } = model;
    return <section className='client-settings'><h1>Personnaliser l’interface</h1>
        <h2>Thème</h2><div className='client-setting-options'>{[[true, 'Liquid Glass'], [false, 'Classique']].map(([key, label]) => <button key={String(key)} aria-pressed={preferences.glass === key} onClick={() => savePreference({ ...preferences, glass: key as boolean })}><InterfacePreview kind={key ? 'glass' : 'classic'} /><strong>{label}</strong></button>)}</div>
        <label className='client-chromatic-option'><input type='checkbox' checked={preferences.chromatic} onChange={event => savePreference({ ...preferences, chromatic: event.target.checked })} /> Couleurs inspirées du média</label>
        <h2>Navigation</h2><div className='client-setting-options'>{[[false, 'Bandeau du thème'], [true, 'Boutons flottants']].map(([key, label]) => <button key={String(key)} aria-pressed={preferences.floating === key} onClick={() => savePreference({ ...preferences, floating: key as boolean })}><InterfacePreview kind={key ? 'floating' : 'grouped'} /><strong>{label}</strong></button>)}</div>
        <h2>Fond des fiches</h2><div className='client-setting-options'>{[['continuous', 'Fond continu'], ['fade', 'Fondu progressif'], ['immersive', 'Fiche immersive']].map(([key, label]) => <button key={key} aria-pressed={preferences.detail === key} onClick={() => savePreference({ ...preferences, detail: key as Preferences['detail'] })}><InterfacePreview kind={key as 'continuous' | 'fade' | 'immersive'} /><strong>{label}</strong></button>)}</div>
        <section className='client-preview-setting'><h2>Aperçus vidéo</h2><label><input type='checkbox' disabled /> Activer les extraits vidéo <small>À venir</small></label><p>Les images restent fixes tant que les aperçus ne sont pas disponibles.</p></section>
        <Link className='client-button client-settings-link' to={`/mypreferencesmenu?userId=${user?.Id || ''}`}>Compte et réglages de lecture Jellyfin ›</Link>
        <button className='client-logout' onClick={Dashboard.logout}>Se déconnecter</button>
    </section>;
}
function BrowseControls({ model }: ViewProps) {
    const { id, view, discovery, params, setParams, genres, genre, filters, audio } = model;
    if (id || !['home', 'films', 'series'].includes(view)) return null;
    return <div className='client-browse-controls'>
        {view !== 'home' && <div className='client-catalogue-switch' aria-label='Présentation du catalogue'><button aria-pressed={discovery} onClick={() => setParams({ view })}>Découvrir</button><button aria-pressed={!discovery} onClick={() => setParams({ view, mode: 'library' })}>Toute la bibliothèque</button></div>}
        <label className='client-genre-control'>{genre || 'Genres'}<ClientIcon name='down' /><select aria-label='Genres' value={genre} onChange={event => {
            const next = new URLSearchParams(params);
            next.set('genre', event.target.value);
            next.delete('offset');
            setParams(next);
        }}><option value=''>Tous les genres</option>{genres.data?.map(entry => <option key={entry.Id || entry.Name} value={entry.Name || ''}>{entry.Name}</option>)}</select></label>
        <label className='client-genre-control'>{audio || 'Langues'}<ClientIcon name='down' /><select aria-label='Langues audio' value={audio} onChange={event => {
            const next = new URLSearchParams(params);
            next.set('audio', event.target.value);
            next.delete('offset');
            setParams(next);
        }}><option value=''>Toutes les langues</option>{filters.data?.AudioLanguages?.map(entry => <option key={entry.Value} value={entry.Value || ''}>{entry.Name || entry.Value}</option>)}</select></label>
    </div>;
}

function DiscoveryView({ model }: ViewProps) {
    const { media, row, view, setParams } = model;
    const items = media.data?.items || [];
    const used = new Set(items.slice(0, 12).map(entry => entry.Id || ''));
    const groups = [...new Set(items.flatMap(entry => entry.Genres || []))].map(genre => {
        const selected = items.filter(entry => entry.Genres?.includes(genre) && !used.has(entry.Id || '')).slice(0, 12);
        if (selected.length < 3) return null;
        selected.forEach(entry => {
            used.add(entry.Id || '');
        });
        return row(genre, selected);
    }).filter(Boolean).slice(0, 4);
    return <div className='client-discovery'>{row(view === 'films' ? 'À découvrir dans vos films' : 'À découvrir dans vos séries', items.slice(0, 12))}{groups}
        {items.length === 0 && <p className='client-message'>Aucun titre pour cette sélection.</p>}
        <button className='client-explore-library' onClick={() => setParams({ view, mode: 'library' })}>Explorer toute la bibliothèque ›</button>
    </div>;
}

function PersonalView({ model }: ViewProps) {
    const { user, media, row, image, play, params, setParams } = model;
    const home = useClientMedia('home', '', 0);
    const collections = useClientCollections(true);
    const resume = home.data?.resume || [];
    const lead = resume[0];
    return <div className='client-personal'><header className='client-personal-identity'><span>{user?.Name?.slice(0, 1)}</span><div><h1>Mon espace</h1><p>{user?.Name}, retrouvez vos envies et vos prochaines séances.</p></div></header>
        <div className='client-personal-shortcuts'><button onClick={() => document.getElementById('client-favorites')?.scrollIntoView({ block: 'start' })}><strong>{media.data?.total || 0}</strong> Ma liste</button><button onClick={() => document.getElementById('client-resume')?.scrollIntoView({ block: 'start' })}><strong>{resume.length}</strong> Lectures à reprendre</button></div>
        {lead && <section className='client-personal-spotlight'><img src={image(lead, true)} alt='' /><div><small>ON CONTINUE ?</small><h2>{lead.SeriesName || lead.Name}</h2><p>{lead.Type === 'Episode' ? episodeLabel(lead) : 'Votre film vous attend'}</p><button className='client-play' onClick={() => play(lead)}><ClientIcon name='play' />Reprendre</button><Link className='client-button' to={`/client?id=${lead.SeriesId || lead.Id}`}>Voir la fiche</Link></div></section>}
        <div id='client-resume'>{row('Continuer à regarder', resume, true)}</div>
        {!!collections.data?.length && <section className='client-personal-collections'><h2>Mes collections</h2><div>{collections.data.map(collection => <Link key={collection.Id} to={`/client?view=search&collection=${collection.Id}&collectionName=${encodeURIComponent(collection.Name || '')}`}><span className='client-collection-art'><img src={image(collection)} alt='' loading='lazy' onError={event => { event.currentTarget.hidden = true; }} /></span><strong>{collection.Name}</strong></Link>)}</div></section>}
        <div className='client-personal-favorites' id='client-favorites'><header><h2>Ma liste</h2><button onClick={() => {
            const items = media.data?.items || [];
            // eslint-disable-next-line sonarjs/pseudo-random -- This only picks a visible favorite, not a security value.
            const choice = items[Math.floor(Math.random() * items.length)];
            if (choice?.Id) setParams({ id: choice.Id }, { state: { returnTo: `/client?${params.toString()}` } });
        }} disabled={!media.data?.items.length}>Surprenez-moi ↗</button></header><LibraryView model={model} embedded /></div>
    </div>;
}

function LibraryView({ model, embedded = false }: ViewProps & { readonly embedded?: boolean }) {
    const { view, offset, searchInput, setSearchInput, setParams, cards, media, genres, genre, sort, params } = model;
    function browse(changes: Record<string, string>, keepOffset = false) {
        const next = new URLSearchParams(params);
        if (!keepOffset) next.delete('offset');
        Object.entries(changes).forEach(([key, value]) => {
            next.set(key, value);
        });
        setParams(next);
    }
    return <section className={`client-library${view === 'search' ? ' client-search-page' : ''}${embedded ? ' embedded' : ''}`}>
        {!embedded && <header className='client-library-heading'><h1>{params.get('collectionName') || params.get('personName') || links.find(([key]) => key === view)?.[1] || 'Bibliothèque'}</h1>{view === 'search' && <p>Un titre, une envie de cinéma : trouvez votre prochaine séance.</p>}</header>}
        <form onSubmit={event => {
            event.preventDefault();
            browse({ q: searchInput });
        }}><ClientIcon name='search' /><input type='search' aria-label='Rechercher un film ou une série' placeholder='Titre d’un film ou d’une série' value={searchInput} onChange={event => setSearchInput(event.target.value)} />{searchInput && <button type='button' aria-label='Effacer la recherche' onClick={() => {
                setSearchInput('');
                browse({ q: '' });
            }}>×</button>}<button>Rechercher</button></form>
        <div className='client-filter-options'><label>Genre <select value={genre} onChange={event => browse({ genre: event.target.value })}><option value=''>Tous les genres</option>{genres.data?.filter(entry => entry.Name).map(entry => <option key={entry.Id || entry.Name} value={entry.Name!}>{entry.Name}</option>)}</select></label><label>Trier <select value={sort} onChange={event => browse({ sort: event.target.value })}><option value='name'>Titre</option><option value='recent'>Ajouts récents</option></select></label><span className='client-result-count'>{media.data?.total || 0} titres</span></div>
        <div className='client-grid'>{cards(media.data?.items || [])}</div>
        {media.data?.items.length === 0 && <p>{view === 'mine' ? 'Ajoutez des films et des séries à votre liste depuis leurs fiches.' : 'Aucun résultat.'}</p>}
        <div className='client-pagination'><button disabled={offset === 0} onClick={() => browse({ offset: String(Math.max(0, offset - 48)) }, true)}>Précédent</button><span>{media.data?.items.length ? offset + 1 : 0}–{offset + (media.data?.items.length || 0)} / {media.data?.total || 0}</span><button disabled={offset + 48 >= (media.data?.total || 0)} onClick={() => browse({ offset: String(offset + 48) }, true)}>Suivant</button></div>
    </section>;
}

/* eslint-enable react/jsx-no-bind */
