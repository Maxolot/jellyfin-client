import { usePreviewCapabilities } from '../features/client/previews/provider';
import PlayerSettings from '../features/client/player/PlayerSettings';
import { DeviceSettings, LanguageSettings, LibrarySettings, ProfileSettings, QuickConnectMenuItem, SubtitleSettings } from '../features/client/account/AccountSettings';
/* eslint-disable react/jsx-no-bind -- View-local closures do not cross memoized component boundaries. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getUserDataApi } from '@jellyfin/sdk/lib/utils/api/user-data-api';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useQueryClient } from '@tanstack/react-query';
import { APP_NAME } from 'constants/branding';
import React, { type CSSProperties, memo, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigationType, useSearchParams, useNavigate } from 'react-router-dom';

import Page from 'components/Page';
import { playbackManager } from 'components/playback/playbackmanager';
import { useApi } from 'hooks/useApi';
import { useWebConfig } from 'hooks/useWebConfig';
import type { ItemDto } from 'types/base/models/item-dto';
import Events from 'utils/events';

import HeroArtwork from '../features/client/HeroArtwork';
import ClientSkeleton from '../features/client/ClientSkeleton';
import PreviewProvider, { usePreviews } from '../features/client/PreviewProvider';
import PreviewClip from '../features/client/PreviewClip';
import { type Preferences, useInterfacePreferences } from '../features/client/interfacePreferences';
import HeroPagination, { type MarkerPosition } from '../features/client/HeroPagination';
import useLoadedHero from '../features/client/useLoadedHero';
import useTabPreparation from '../features/client/useTabPreparation';
import Artwork from '../features/client/Artwork';
import useClientMotion from '../features/client/useClientMotion';
import useHeroBackground from '../features/client/useHeroBackground';
import { artworkUrl, preloadArtwork } from '../features/client/artwork';
import ClientIcon from '../features/client/ClientIcon';
import useArtworkColor from '../features/client/useArtworkColor';
import PersonalRating from '../features/client/PersonalRating';
import RatingsOverview from '../features/client/RatingsOverview';
import { GenreTaste, PersonalStatsBand } from '../features/client/PersonalOverview';
import { usePersonalStats, useViewingHistory } from '../features/client/usePersonalStats';
import HeroMetadata from '../features/client/HeroMetadata';
import DetailExtras from '../features/client/DetailExtras';
import DetailMenu from '../features/client/DetailMenu';
import ProfilePage from '../features/client/profiles/ProfilePage';
import { signOut } from '../features/client/profiles/profileSession';
import { useProfileGate } from '../features/client/profiles/useProfileGate';
import { chosenTracks } from '../features/client/languageTags';
import InterfacePreview from '../features/client/InterfacePreview';
import { RecentPage } from '../features/client/LocalDiscoveryPages';
import MediaRow from '../features/client/MediaRow';
import { episodeLabel, progressPercent, uniqueItems } from '../features/client/model';
import { clientRequest } from '../features/client/session';
import { useClientCollections, useClientDetails, useClientFilters, useClientMedia, useMoreBrowse } from '../features/client/useClientMedia';
import '../features/client/client.scss';
import '../features/client/prototype.scss';
import '../features/client/motion.scss';
import '../features/client/sagas.scss';
import '../features/client/previews.scss';
import '../features/client/ratings.scss';
import '../features/client/heroBackground.scss';
import '../features/client/headerAlignment.scss';
import '../features/client/readableBackdrops.scss';

type ClientNavigationState = { returnTo?: string, returnState?: ClientNavigationState | null, restoreFocus?: boolean };
import TonightPage from '../features/client/TonightPage';
import CollectionCard from '../features/client/CollectionCard';
import AmbientBackdrop from '../features/client/AmbientBackdrop';
import { SeerrProvider, useSeerr } from '../features/client/seerr/SeerrContext';
import { useSeerrCatalogue, useSeerrDetail, useSeerrUpcoming } from '../features/client/seerr/queries';
import UpcomingRow from '../features/client/UpcomingRow';
import { ExternalDetail, RequestTracking, SeerrSettings } from '../features/client/seerr/SeerrViews';
import { externalIdentity, imageUrl, isExternal, mediaLabel, mixCatalogue, type CatalogueItem } from '../features/client/seerr/model';

const links = [['home', 'Accueil'], ['series', 'Séries'], ['films', 'Films'], ['recent', 'Nouveautés'], ['tonight', 'Ce soir'], ['search', 'Rechercher'], ['mine', 'Mon espace']];

function plainHome(view: string, filters: (string | undefined)[]) {
    return view === 'home' && !filters.some(Boolean);
}

function heroCandidates(discovery: boolean, data?: { items: BaseItemDto[]; movies: BaseItemDto[]; series: BaseItemDto[] }) {
    if (discovery) return (data?.items || []).slice(0, 5);
    return [...(data?.movies || []).slice(0, 3), ...(data?.series || []).slice(0, 2)];
}

function clientArtwork(basePath: string, i: BaseItemDto, backdrop = false, hero = false) {
    if (isExternal(i)) {
        const external = (i as CatalogueItem).Seerr;
        return imageUrl(backdrop ? external?.backdropPath || external?.posterPath : external?.posterPath, backdrop);
    }
    let kind: 'poster' | 'backdrop' | 'hero' = 'poster';
    if (backdrop) kind = 'backdrop';
    if (hero) kind = 'hero';
    return artworkUrl(basePath, i, kind);
}

function clientLogo(basePath: string, i: BaseItemDto) {
    if (isExternal(i)) return undefined;
    return i.ImageTags?.Logo || i.SeriesId ? artworkUrl(basePath, i, 'logo') : undefined;
}

function localDetailId(id: string) {
    return isExternal({ Id: id }) ? '' : id;
}
function allowExternalCatalogue(view: string, selectors: string[], mode: string | null) {
    return !selectors.some(Boolean) && ['home', 'films', 'series', 'search'].includes(view)
        && !(mode === 'library' && ['films', 'series'].includes(view));
}

function restoreClientNavigation(key: string, restoreFocus: boolean, id: string) {
    // Only going back returns to a previous position; opening a page always starts at its top.
    let top = 0;
    if (restoreFocus) {
        try {
            top = Number(sessionStorage.getItem(key)) || 0;
        } catch { /* Storage can be disabled. */ }
    }
    window.scrollTo(0, top);
    try {
        const savedFocus = sessionStorage.getItem(`${key}-focus`);
        const target = restoreFocus ? Array.from(document.querySelectorAll<HTMLElement>('#clientPage [data-client-focus]'))
            .find(element => savedFocus && element.getAttribute('data-client-focus') === savedFocus) : undefined;
        (target || (id ? document.querySelector<HTMLElement>('#clientPage .client-back') : null))?.focus({ preventScroll: true });
    } catch { /* Navigation remains usable when storage is unavailable. */ }
}

function clientPageReady(id: string, view: string, item: BaseItemDto | undefined, mediaReady: boolean, externalReady: boolean) {
    return externalReady || (id ? !!item : view === 'settings' || mediaReady);
}

function clientBrowseInput(view: string, search: string, filters: Parameters<typeof useClientMedia>[3]) {
    return ['mine', 'tonight'].includes(view) ? { search: '', filters: {} } : { search, filters };
}

function useClientController() {
    const { api, user } = useApi();
    const seerr = useSeerr();
    const { clientPreviews } = useWebConfig();
    const hasStaticPreviews = Object.keys(clientPreviews?.[user?.ServerId || ''] || {}).length > 0;
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const restoreFocus = useNavigationType() === 'POP' || (location.state as ClientNavigationState | null)?.restoreFocus === true;
    const view = params.get('view') || 'home';
    const discovery = (view === 'films' || view === 'series') && params.get('mode') !== 'library';
    const id = params.get('id') || '';
    const search = params.get('q') || '';
    const season = params.get('season') || '';
    const genre = params.get('genre') || '';
    const person = params.get('person') || '';
    const audio = params.get('audio') || '';
    const collection = params.get('collection') || '';
    const sort = params.get('sort') === 'recent' ? 'recent' : 'name';
    const filters = useClientFilters(['mine', 'tonight'].includes(view) ? 'disabled' : view);
    const genres = { ...filters, data: filters.data?.Genres };
    const cache = useQueryClient();
    const prefKey = `client-interface-${api?.basePath}-${user?.Id}`;
    const [preferences, storePreference] = useInterfacePreferences(prefKey);
    const previewProvider = usePreviewCapabilities(preferences.previews && !reducedMotion);
    const previewProviderAvailable = previewProvider.data === true;
    const hasPreviews = hasStaticPreviews || previewProviderAvailable;
    const [actionError, setActionError] = useState('');
    const [busy, setBusy] = useState(false);
    const [searchInput, setSearchInput] = useState(search);
    const [heroIndex, setHeroIndex] = useState(0);
    const [ambient, setAmbient] = useState('');
    const prepareTimer = useRef<number>();
    useEffect(() => () => window.clearTimeout(prepareTimer.current), []);
    const [heroPaused, setHeroPaused] = useState(false);
    const [previewPlaying, setPreviewPlaying] = useState(false);
    const [previewSuspended, setPreviewSuspended] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const profileButton = useRef<HTMLButtonElement>(null);
    const surface = useRef<HTMLDivElement>(null);
    const profileMenu = useRef<HTMLDivElement>(null);
    const browseInput = clientBrowseInput(view, search, { genre, sort, person, audio, collection });
    const media = useClientMedia(id || view === 'settings' ? 'disabled' : view, browseInput.search, 0, browseInput.filters);
    const remote = isExternal({ Id: id });
    const remoteIdentity = externalIdentity({ Id: id });
    const remoteDetails = useSeerrDetail(remoteIdentity?.type, remoteIdentity?.id, false);
    const allowCatalogue = allowExternalCatalogue(view, [id, collection, person, audio], params.get('mode'));
    const catalogue = useSeerrCatalogue(view, search, allowCatalogue, genre);
    const upcoming = useSeerrUpcoming(plainHome(view, [id, genre, audio]));
    const details = useClientDetails(localDetailId(id), season);
    const item = details.item.data;
    useEffect(() => {
        const refresh = () => {
            setPreviewSuspended(false);
            void cache.invalidateQueries({ queryKey: ['Client', api?.basePath, user?.Id] });
        };
        Events.on(playbackManager, 'playbackstop', refresh);
        return () => Events.off(playbackManager, 'playbackstop', refresh);
    }, [cache, api?.basePath, user?.Id]);
    useEffect(() => setAmbient(''), [id, view, genre, audio]);

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
        setSearchInput(search);
    }, [search]);
    useEffect(() => {
        setActionError('');
    }, [params]);
    const pageReady = clientPageReady(id, view, item, !!media.data, remoteDetails.isFetched);
    const prepareTab = useTabPreparation(pageReady);
    useLayoutEffect(() => {
        const key = `${prefKey}-scroll-${params.toString()}`;
        if (!pageReady) {
            // The page shrinks while loading: that forced position must not be saved as this page's own.
            if (!restoreFocus) window.scrollTo(0, 0);
            return;
        }
        restoreClientNavigation(key, restoreFocus, id);
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
        if (!api || !user?.Id) return;
        storePreference(next);
    }
    const image = (i: BaseItemDto, backdrop = false, hero = false) => clientArtwork(api?.basePath || '', i, backdrop, hero);
    const logo = (i: BaseItemDto) => clientLogo(api?.basePath || '', i);
    function releaseDetail() {
        window.clearTimeout(prepareTimer.current);
        setAmbient('');
    }
    function prepareDetail(i: BaseItemDto) {
        window.clearTimeout(prepareTimer.current);
        prepareTimer.current = window.setTimeout(() => {
            if (preferences.ambient) setAmbient(image(i, true));
            warmDetail(i);
        }, 160);
    }
    function warmDetail(i: BaseItemDto) {
        void preloadArtwork(image(i, true, true)).catch(() => undefined);
        const targetId = i.Type === 'Episode' ? i.SeriesId || i.Id : i.Id;
        if (!targetId || !api || !user?.Id || isExternal(i)) return;
        void cache.prefetchQuery({
            queryKey: ['Client', api?.basePath, user?.Id, 'Detail', targetId],
            staleTime: 30000,
            queryFn: ({ signal }) => clientRequest(async () => (await getLibraryApi(api!).getItem({ itemId: targetId, userId: user!.Id! }, { signal })).data)
        });
    }
    async function play(i: BaseItemDto, startTicks?: number) {
        if (isExternal(i)) {
            setParams({ id: i.Id! }, { state: { returnTo: location.pathname + location.search, returnState: location.state } });
            return;
        }
        setActionError('');
        setPreviewSuspended(true);
        try {
            await playbackManager.play({ items: [i as ItemDto], startPositionTicks: startTicks ?? (i.UserData?.PlaybackPositionTicks || 0), ...await chosenTracks(api, user?.Id, i) });
        } catch {
            setPreviewSuspended(false);
            setActionError('La lecture n’a pas pu démarrer. Réessayez dans un instant.');
        }
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
            to={`/client?id=${i.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state as ClientNavigationState | null }} aria-label={[i.SeriesName, i.Name].filter(Boolean).join(' · ')} onPointerEnter={() => prepareDetail(i)} onFocus={() => prepareDetail(i)}>
            <Artwork source={image(i, horizontal)} />
            {horizontal && <span className='client-card-caption'><strong>{i.SeriesName || i.Name}</strong>
                <small>{i.Type === 'Episode' ? `${episodeLabel(i)} · ${i.Name}` : i.ProductionYear}</small></span>}
            {progressPercent(i) > 0 && <span className='client-progress'><i style={{ width: `${progressPercent(i)}%` }} /></span>}
            <span className='client-card-fallback'>{i.Name}</span>
            {isExternal(i) && <span className='client-external-badge'>{mediaLabel((i as CatalogueItem).Seerr?.mediaInfo)}</span>}
        </Link>);
    }
    function row(title: string, items: BaseItemDto[] | undefined, horizontal = false) {
        if (!items?.length) return null;
        return <MediaRow key={`${title}:${items.map(entry => entry.Id).join('|')}`} title={title} items={items} continuation={horizontal} showDescription={preferences.hoverDescriptions} image={image} logo={logo} onPrepare={prepareDetail} onRelease={releaseDetail} />;
    }
    const heroItems = heroCandidates(discovery, media.data);
    const lead = heroItems[heroIndex % Math.max(1, heroItems.length)];
    const nextHero = heroItems[(heroIndex + 1) % Math.max(1, heroItems.length)];
    const nextArtwork = nextHero && !id ? image(nextHero, true, true) : '';
    useEffect(() => {
        if (!nextArtwork) return;
        const timer = window.setTimeout(() => {
            void preloadArtwork(nextArtwork).catch(() => undefined);
        }, 1200);
        return () => window.clearTimeout(timer);
    }, [nextArtwork]);
    useEffect(() => {
        if (!(view === 'home' || discovery) || id || heroPaused || previewPlaying || heroItems.length < 2 || reducedMotion) return;
        const timer = window.setInterval(() => {
            const rect = document.querySelector('.client-home-hero')?.getBoundingClientRect();
            if (!document.hidden && rect && rect.bottom > 0 && rect.top < window.innerHeight) setHeroIndex(index => index + 1);
        }, 8000);
        return () => window.clearInterval(timer);
    }, [view, discovery, id, heroPaused, previewPlaying, heroItems.length, reducedMotion]);
    const playItem = item?.Type === 'Series' ? details.next.data || details.episodes.data?.[0] : item;
    const decodedLead = useLoadedHero(lead, lead ? image(lead, true, true) : '', `${view}-${genre}-${audio}`);
    const homeHero = view === 'home' || discovery ? decodedLead : undefined;
    const hero = id ? item : homeHero;
    const accent = useArtworkColor(preferences.chromatic && hero ? image(hero, true) : undefined);
    const error = id ? details.item.isError : media.isError;
    return { api, user, params, location, setParams, view, id, search, browseInput, media, details, item, preferences, actionError, busy,
        searchInput, setSearchInput, genres, genre, sort, savePreference, image, play, updateState, cards, row, playItem, hero, error,
        prepareDetail, releaseDetail, prepareTab, seerr, catalogue, upcoming, remote, heroItems, heroIndex, setHeroIndex, setHeroPaused, ambient, hasPreviews, previewProviderAvailable, setPreviewPlaying, previewSuspended, profileOpen, setProfileOpen, profileButton, profileMenu, surface, discovery, filters, audio, accent };
}

type ClientModel = ReturnType<typeof useClientController>;
type ViewProps = { readonly model: ClientModel };

export default function Client() {
    const { showing, revision } = useProfileGate();
    if (showing) return <ProfilePage revision={revision} />;
    return <SeerrProvider><ClientSurface /></SeerrProvider>;
}

function ClientSurface() {
    const model = useClientController();
    useClientMotion(model.surface);
    useLayoutEffect(() => {
        const root = model.surface.current;
        if (!root) return;
        root.dataset.tabSwitch = 'true';
        const timer = window.setTimeout(() => delete root.dataset.tabSwitch, 700);
        return () => window.clearTimeout(timer);
    }, [model.surface, model.view, model.id]);
    return <ClientView model={model} />;
}

type NavProps = { view: string; detail: boolean; prepare: (view: string) => void };

/** On its own so that a click lights up the tab first: the page changes right after that frame has been painted. */
const NavLinks = memo(function ClientNavLinks({ view, detail, prepare }: NavProps) {
    const navigate = useNavigate();
    const [opening, setOpening] = useState<string>();
    useEffect(() => setOpening(undefined), [view, detail]);
    const current = opening ?? (detail ? undefined : view);
    return <div className='client-nav-links'>{links.filter(([key]) => key !== 'search').map(([key, label]) => <Link key={key} to={`/client?view=${key}`} aria-current={current === key ? 'page' : undefined}
        onPointerEnter={() => prepare(key)} onFocus={() => prepare(key)} onClick={event => {
            // Opening in a new tab or window stays the browser's business.
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            setOpening(key);
            requestAnimationFrame(() => window.setTimeout(() => navigate(`/client?view=${key}`)));
        }}>{label}</Link>)}</div>;
});

function ClientView({ model }: ViewProps) {
    const { preferences, id, view, user, actionError, error, media, details, profileOpen, setProfileOpen, profileButton, profileMenu, accent } = model;
    return <PreviewProvider serverAvailable={model.previewProviderAvailable} surface={model.surface} enabled={preferences.previews} muted={preferences.previewMuted} suspended={model.previewSuspended} toggleMuted={() => model.savePreference({ ...preferences, previewMuted: !preferences.previewMuted })} onPlayingChange={model.setPreviewPlaying}><Page id='clientPage' title={APP_NAME} className='client-page' isBackButtonEnabled={false}>
        <div ref={model.surface} className={`client-interface ${preferences.glass ? 'client-glass' : 'client-classic'} ${preferences.floating ? 'client-floating' : ''} ${preferences.chromatic ? 'client-chromatic' : ''} ${preferences.hero === 'background' ? 'client-hero-background' : ''} client-treatment-${preferences.detailTreatment} client-layout-${preferences.detail} ${id ? 'client-detail-page' : ''}`} style={{ '--client-accent': accent, '--detail-blur': `${preferences.detailBlur}px`, '--detail-shade': preferences.detailShade / 100, '--detail-width': `${preferences.detailWidth}%`, '--hero-fade': `${preferences.heroFade}%` } as CSSProperties}>
            {preferences.ambient && !id && <AmbientBackdrop source={model.ambient} />}
            <nav className='client-nav' data-alignment={preferences.headerAlignment} aria-label='Navigation principale'>
                <button ref={profileButton} className='client-profile' aria-label='Menu du profil' aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}>{user?.PrimaryImageTag ? <img src={`${model.api?.basePath}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}&width=96&quality=90`} alt='' /> : user?.Name?.slice(0, 1) || '•'}</button>
                <NavLinks view={view} detail={!!id} prepare={model.prepareTab} />
                <Link to='/client?view=search' className='client-brand client-search-shortcut' aria-label='Rechercher' aria-current={!id && view === 'search' ? 'page' : undefined}><ClientIcon name='search' /></Link>
                {profileOpen && <div ref={profileMenu} className='client-profile-menu' role='dialog' aria-label='Menu du profil'>
                    <strong>{user?.Name}</strong><Link to='/client?view=profiles' onClick={() => setProfileOpen(false)}>Changer de profil</Link><Link to='/client?view=mine' onClick={() => setProfileOpen(false)}>Mon espace</Link><Link to='/client?view=settings' aria-label='Paramètres' onClick={() => setProfileOpen(false)}>Paramètres</Link><QuickConnectMenuItem /><button onClick={() => {
                        void signOut(model.api?.basePath, user?.Id);
                    }}>Se déconnecter</button>
                </div>}
            </nav>
            {actionError && <p role='alert' className='client-message'>{actionError}</p>}
            {error && <div className='client-message' role='alert'><p>Impossible de charger les médias.</p><button onClick={() => (id ? details.item.refetch() : media.refetch())}>Réessayer</button></div>}
            {id && !model.remote && details.item.isPending && <ClientSkeleton layout='detail' label='Chargement de la fiche…' />}
            <BrowseControls model={model} />
            {!id && media.isPending && (view === 'home' || model.discovery) && <ClientSkeleton layout='hero' label='Chargement de la sélection…' />}
            <HeroView model={model} />
            <ContentView model={model} />
        </div>
    </Page></PreviewProvider>;
}

function HeroView({ model }: ViewProps) {
    const { hero, id, location, image, heroItems, setHeroIndex, setHeroPaused, preferences } = model;
    const region = useRef<HTMLElement>(null);
    const marker = useRef<MarkerPosition | null>(null);
    const previews = usePreviews();
    useHeroBackground(region, !id && preferences.hero === 'background', !!hero);
    if (!hero) return null;
    function selectHero(index: number) {
        previews?.playback.stop();
        setHeroIndex(index);
    }
    function advanceHero(delta: number) {
        previews?.playback.stop();
        setHeroIndex(index => (index + heroItems.length + delta) % heroItems.length);
    }
    return <section ref={region} className={`client-hero${id ? ' client-detail' : ' client-home-hero'}${hero.Type === 'Series' && id ? ' client-series-detail' : ''}`} onPointerEnter={() => setHeroPaused(true)} onPointerLeave={() => setHeroPaused(false)} onFocus={() => setHeroPaused(true)} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeroPaused(false);
    }}>
        <HeroArtwork source={image(hero, true, true)} fullBackground={!id && preferences.hero === 'background'} />
        <PreviewClip item={hero} surface={id ? 'detail' : 'hero'} />
        {id && <div className='client-detail-readability' aria-hidden='true' />}
        {id && <Link className='client-back' to={(location.state as ClientNavigationState | null)?.returnTo || '/client'} state={{ ...(location.state as ClientNavigationState | null)?.returnState, restoreFocus: true }}><ClientIcon name='back' />Retour</Link>}
        <HeroCopyView key={hero.Id} model={model} dots={!id && heroItems.length > 1 ? <HeroPagination items={heroItems} index={Math.max(0, heroItems.findIndex(entry => entry.Id === hero.Id))} select={selectHero} position={marker} /> : null} />
        {!id && heroItems.length > 1 && <div className='client-hero-arrows'><button aria-label='Média précédent' onClick={() => advanceHero(-1)}><ClientIcon name='back' /></button><button aria-label='Média suivant' onClick={() => advanceHero(1)}><ClientIcon name='next' /></button></div>}
        <EpisodesView model={model} />
    </section>;
}

function HeroCopyView({ model, dots }: ViewProps & { dots: ReactNode }) {
    const { hero, id, api } = model;
    const [synopsisExpanded, setSynopsisExpanded] = useState(false);
    useEffect(() => setSynopsisExpanded(false), [hero?.Id]);
    if (!hero) return null;
    return <div className='client-hero-copy'>{!id && <span className='client-eyebrow'>À LA UNE</span>}
        {hero.ImageTags?.Logo && <Artwork className='client-title-logo' source={artworkUrl(api?.basePath || '', hero, 'logo')} eager />}
        <h1 className={hero.ImageTags?.Logo ? 'client-title-fallback' : undefined}>{hero.Name}</h1>
        <HeroMetadata item={hero} detailed={!!id} />
        {id && <><p className={`client-overview${synopsisExpanded ? ' expanded' : ''}`}>{hero.Overview}</p>{hero.Type === 'Series' && (hero.Overview?.length || 0) > 220 && <button className='client-synopsis-toggle' aria-expanded={synopsisExpanded} onClick={() => setSynopsisExpanded(!synopsisExpanded)}>{synopsisExpanded ? 'Réduire' : 'Lire la suite'}</button>}</>}
        <HeroActions model={model} dots={dots} />
        {id && <PersonalRating item={hero} />}
    </div>;
}

function HeroActions({ model, dots }: ViewProps & { dots: ReactNode }) {
    const { hero, id, item, api, location, playItem, busy, play, updateState } = model;
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
            <DetailMenu key={hero.Id} item={hero} basePath={api?.basePath || ''} play={play} /></>}
        {dots}
    </div>;
}

function EpisodesView({ model }: ViewProps) {
    const { id, item, details, setParams, location, api, play } = model;
    const [activeEpisode, setActiveEpisode] = useState('');
    if (!id || item?.Type !== 'Series') return null;
    return <section className='client-episodes'><header><h2>Épisodes</h2><div role='group' aria-label='Saison'>{details.seasons.data?.map(s => <button key={s.Id} aria-pressed={details.selected === s.Id} onClick={() => setParams({ id, season: s.Id! }, { state: location.state })}><strong>{s.IndexNumber === 0 ? 'Spéciaux' : `Saison ${s.IndexNumber}`}</strong><small>{s.ChildCount ? `${s.ChildCount} épisodes` : 'Voir les épisodes'}</small></button>)}</div></header>
        {(details.seasons.isPending || (details.episodes.isPending && !!details.selected)) && <ClientSkeleton layout='episodes' count={4} contained label='Chargement des épisodes…' />}
        {details.episodes.isError && <button onClick={() => details.episodes.refetch()}>Réessayer le chargement des épisodes</button>}
        <div className='client-strip'>{details.episodes.data?.map(e => <button className='client-episode' key={e.Id} onPointerEnter={() => setActiveEpisode(e.Id || '')} onPointerLeave={event => {
            if (!event.currentTarget.contains(document.activeElement)) setActiveEpisode('');
        }} onFocus={() => setActiveEpisode(e.Id || '')} onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) setActiveEpisode('');
        }} onClick={() => play(e)} aria-label={`Lire ${episodeLabel(e)} ${e.Name}`}>
            <Artwork source={artworkUrl(api?.basePath || '', e, 'episode')} /><PreviewClip item={e} surface='episode' enabled={activeEpisode === e.Id} soundControl={false} /><span className='client-episode-play' aria-hidden='true'><ClientIcon name='play' /></span><span className='client-episode-caption'><strong>{e.Name}</strong><small>{episodeLabel(e)} · {Math.round((e.RunTimeTicks || 0) / 6e8)} min</small></span>
            <i className='client-progress'><i style={{ width: `${progressPercent(e)}%` }} /></i></button>)}</div>
        {(details.episodes.data?.length === 0 || details.seasons.data?.length === 0) && <p>Aucun épisode disponible dans cette saison.</p>}
    </section>;
}

function ContentView({ model }: ViewProps) {
    const { id, view, details, media, row, api, image } = model;
    if (model.remote) return <ExternalDetail key={id} id={id} row={row} image={image} />;
    if (id) return details.item.data && api ? <DetailExtras item={details.item.data} similar={details.similar.data || []} image={image} /> : null;
    if (view === 'home') {
        // Ordre de la maquette : reprise, sélection, ajouts récents, tendances, puis sorties à venir ; chaque titre n'apparaît qu'une fois.
        const continuing = uniqueItems([...(media.data?.resume || []), ...(media.data?.next || [])]).filter((entry, index, all) => !entry.SeriesId || all.findIndex(other => other.SeriesId === entry.SeriesId) === index);
        const used = new Set([...model.heroItems, ...continuing].map(entry => entry.SeriesId || entry.Id || ''));
        const take = (items: BaseItemDto[], limit: number) => items.filter(entry => !used.has(entry.Id || '')).slice(0, limit).map(entry => {
            used.add(entry.Id || '');
            return entry;
        });
        const picks = take(media.data?.picks || [], 12);
        const recent = take([...(media.data?.movies || []), ...(media.data?.series || [])].sort((a, b) => String(b.DateCreated || '').localeCompare(String(a.DateCreated || ''))), 16);
        const trends = take(model.catalogue.items, 20);
        return <>
            {row('Continuer à regarder', continuing, true)}
            {row('À découvrir', picks)}
            {row('Ajouts récents', recent)}
            {row('Tendances', trends)}
            {model.catalogue.loading && !trends.length && <ClientSkeleton layout='row' label='Chargement des tendances…' />}
            {model.catalogue.isError && <p className='client-message'>Les tendances sont temporairement indisponibles. Votre bibliothèque reste accessible.</p>}
            <UpcomingRow items={model.upcoming.items.filter(({ item }) => !used.has(item.Id || ''))} />
            {media.data && !media.data.movies.length && !media.data.series.length && !media.data.resume.length && <p className='client-message'>Votre bibliothèque est vide pour le moment.</p>}
        </>;
    }
    if (view === 'settings') return <SettingsView model={model} />;
    if (view === 'recent') return <RecentPage items={media.data?.items || []} row={row} />;
    if (view === 'tonight') return <TonightPage items={media.data?.items || []} loading={media.isPending} image={item => artworkUrl(model.api?.basePath || '', item, 'draw')} onPrepare={model.prepareDetail} onRelease={model.releaseDetail} />;
    if (model.discovery) return <DiscoveryView model={model} />;
    if (view === 'mine') return <PersonalView model={model} />;
    return <LibraryView model={model} />;
}
const SETTINGS_TABS = [['interface', 'Interface'], ['lecture', 'Lecture'], ['bibliotheque', 'Bibliothèque'], ['compte', 'Compte'], ['demandes', 'Demandes']] as const;

function SettingsView({ model }: ViewProps) {
    const { preferences, savePreference, user, params } = model;
    if (!model.api || !user?.Id) return <section className='client-settings'><h1>Paramètres</h1><ClientSkeleton layout='settings' contained count={3} label='Chargement des préférences…' /></section>;
    const requested = params.get('section') || 'interface';
    const tab = SETTINGS_TABS.some(([key]) => key === requested) ? requested : 'interface';
    return <section className='client-settings'><h1>Paramètres</h1>
        <nav className='client-settings-tabs' aria-label='Sections des paramètres'>{SETTINGS_TABS.map(([key, label]) => <Link key={key} to={`/client?view=settings&section=${key}`} replace aria-current={tab === key ? 'page' : undefined}>{label}</Link>)}</nav>
        {tab === 'lecture' && <><PlayerSettings /><LanguageSettings /><SubtitleSettings /><DeviceSettings /></>}
        {tab === 'bibliotheque' && <LibrarySettings />}
        {tab === 'compte' && <ProfileSettings />}
        {tab === 'demandes' && <SeerrSettings />}
        {tab === 'interface' && <>
            <h2>Thème</h2><div className='client-setting-options'>{[[true, 'Liquid Glass'], [false, 'Classique']].map(([key, label]) => <button key={String(key)} aria-pressed={preferences.glass === key} onClick={() => savePreference({ ...preferences, glass: key as boolean })}><InterfacePreview kind={key ? 'glass' : 'classic'} /><strong>{label}</strong></button>)}</div>
            <label className='client-chromatic-option'><input type='checkbox' checked={preferences.chromatic} onChange={event => savePreference({ ...preferences, chromatic: event.target.checked })} /> Couleurs inspirées du média</label>
            <label className='client-chromatic-option'><input type='checkbox' checked={preferences.ambient} onChange={event => savePreference({ ...preferences, ambient: event.target.checked })} /> Fond immersif au survol</label>
            <label className='client-chromatic-option'><input type='checkbox' checked={preferences.hoverDescriptions} onChange={event => savePreference({ ...preferences, hoverDescriptions: event.target.checked })} /> Descriptions au survol entre les sections</label>
            <h2>Visuel principal</h2><div className='client-setting-options'>{[['framed', 'Encadré'], ['background', 'Fond plein écran']].map(([key, label]) => <button key={key} aria-pressed={preferences.hero === key} onClick={() => savePreference({ ...preferences, hero: key as Preferences['hero'] })}><InterfacePreview kind={key === 'background' ? 'hero-background' : 'hero-framed'} /><strong>{label}</strong></button>)}</div>
            <h2>Navigation</h2><div className='client-setting-options'>{[[false, 'Bandeau du thème'], [true, 'Boutons flottants']].map(([key, label]) => <button key={String(key)} aria-pressed={preferences.floating === key} onClick={() => savePreference({ ...preferences, floating: key as boolean })}><InterfacePreview kind={key ? 'floating' : 'grouped'} /><strong>{label}</strong></button>)}</div>
            <h3>Alignement des boutons</h3><div className='client-setting-options'>{[['left', 'À gauche'], ['center', 'Au centre'], ['right', 'À droite']].map(([key, label]) => <button key={key} aria-pressed={preferences.headerAlignment === key} onClick={() => savePreference({ ...preferences, headerAlignment: key as Preferences['headerAlignment'] })}><InterfacePreview kind={`nav-${key}` as 'nav-left' | 'nav-center' | 'nav-right'} /><strong>{label}</strong></button>)}</div>
            <h2>Fond des fiches</h2><div className='client-setting-options'>{[['continuous', 'Fond continu'], ['fade', 'Fondu progressif'], ['immersive', 'Fiche immersive']].map(([key, label]) => <button key={key} aria-pressed={preferences.detail === key} onClick={() => savePreference({ ...preferences, detail: key as Preferences['detail'] })}><InterfacePreview kind={key as 'continuous' | 'fade' | 'immersive'} /><strong>{label}</strong></button>)}</div>
            <h3>Lisibilité des fiches</h3><div className='client-setting-options'>{[['progressive', 'Flou progressif'], ['cinema', 'Voile cinéma'], ['clear', 'Image nette']].map(([key, label]) => <button key={key} aria-pressed={preferences.detailTreatment === key} onClick={() => savePreference({ ...preferences, detailTreatment: key as Preferences['detailTreatment'] })}><strong>{label}</strong></button>)}</div>
            <div className='client-backdrop-settings'>{([['detailBlur', 'Intensité du flou', 0, 48, 'px'], ['detailShade', 'Assombrissement derrière le texte', 0, 95, '%'], ['detailWidth', 'Largeur de la zone de lecture', 35, 85, '%'], ['heroFade', 'Hauteur du fondu du hero', 20, 70, '%']] as const).map(([key, label, min, max, unit]) => <label key={key}>{label}<output>{preferences[key]}{unit}</output><input type='range' min={min} max={max} value={preferences[key]} disabled={key === 'detailBlur' && preferences.detailTreatment !== 'progressive'} onChange={event => savePreference({ ...preferences, [key]: Number(event.target.value) })} /></label>)}</div>
            <section className='client-preview-setting'><h2>Aperçus vidéo</h2><label><input type='checkbox' checked={preferences.previews} onChange={event => savePreference({ ...preferences, previews: event.target.checked })} /> Activer les extraits vidéo {!model.hasPreviews && <small>Aucun extrait disponible sur ce serveur</small>}</label><label><input type='checkbox' disabled={!preferences.previews} checked={!preferences.previewMuted} onChange={event => savePreference({ ...preferences, previewMuted: !event.target.checked })} /> Activer le son des aperçus</label><p>Chaque extrait se joue une fois, puis revient doucement à l’affiche. Le son est partagé entre les aperçus.</p></section>
        </>}
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
            setParams(next);
        }}><option value=''>Tous les genres</option>{genres.data?.map(entry => <option key={entry.Id || entry.Name} value={entry.Name || ''}>{entry.Name}</option>)}</select></label>
        <label className='client-genre-control'>{audio || 'Langues'}<ClientIcon name='down' /><select aria-label='Langues audio' value={audio} onChange={event => {
            const next = new URLSearchParams(params);
            next.set('audio', event.target.value);
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
    return <div className='client-discovery'>{row(view === 'films' ? 'À découvrir dans vos films' : 'À découvrir dans vos séries', items.slice(0, 12))}{row('À découvrir aussi', model.catalogue.items.filter(entry => !used.has(entry.Id || '')))}{groups}
        {model.catalogue.loading && !model.catalogue.items.length && <ClientSkeleton layout='row' label='Chargement des découvertes…' />}
        {media.isSuccess && items.length === 0 && model.catalogue.items.length === 0 && !model.catalogue.loading && <p className='client-message'>Aucun titre pour cette sélection.</p>}
        <button className='client-explore-library' onClick={() => setParams({ view, mode: 'library' })}>Explorer toute la bibliothèque ›</button>
    </div>;
}

function PersonalView({ model }: ViewProps) {
    const { user, media, row, image, play, seerr } = model;
    const home = useClientMedia('home', '', 0);
    const collections = useClientCollections(true);
    const stats = usePersonalStats();
    const history = useViewingHistory();
    const resume = home.data?.resume || [];
    const lead = resume[0];
    const watched = (stats.data?.movies || 0) + (stats.data?.episodes || 0);
    return <div className='client-personal'>
        <header className='client-personal-identity'><span aria-hidden='true'>{user?.Name?.slice(0, 1)}</span><div><h1>Mon espace</h1>
            <p>{user?.Name}{watched ? ` · ${watched.toLocaleString('fr-FR')} visionnages dans votre historique` : ', retrouvez vos envies et vos prochaines séances.'}</p></div></header>
        <PersonalStatsBand stats={stats.data} pending={stats.isPending} favorites={media.data?.total || 0} favoritesPending={media.isPending} />
        {home.isPending && <ClientSkeleton layout='episodes' contained count={3} label='Chargement des reprises…' />}
        {lead && <section className='client-personal-spotlight'><Artwork source={image(lead, true, true)} eager /><PreviewClip item={lead} surface='spotlight' /><div><small>ON CONTINUE ?</small><h2>{lead.SeriesName || lead.Name}</h2><p>{lead.Type === 'Episode' ? `${episodeLabel(lead)} · ${lead.Name}` : 'Votre film vous attend'}</p>
            {progressPercent(lead) > 0 && <span className='client-spotlight-progress' aria-label={`Vu à ${Math.round(progressPercent(lead))} %`}><i style={{ width: `${progressPercent(lead)}%` }} /></span>}
            <button className='client-play' onClick={() => play(lead)}><ClientIcon name='play' />Reprendre</button><Link className='client-button' to={`/client?id=${lead.SeriesId || lead.Id}`}>Voir la fiche</Link></div></section>}
        <div id='client-resume'>{row('Continuer à regarder', resume.slice(1), true)}</div>
        <div className='client-personal-favorites' id='client-favorites'><header><h2>Ma liste</h2></header><LibraryView model={model} embedded /></div>
        {row('Vus récemment', history.data)}
        {(!!stats.data?.genres.length || !!collections.data?.length) && <div className='client-personal-columns'>
            <GenreTaste stats={stats.data} />
            {!!collections.data?.length && <section className='client-personal-panel client-personal-collections'><h2>Mes collections</h2><div>{collections.data.map(collection => <CollectionCard key={collection.Id} collection={collection} image={image} />)}</div></section>}
        </div>}
        <RatingsOverview />
        {seerr.connected && <div id='client-requests' className='client-personal-requests'><RequestTracking /></div>}
    </div>;
}

function SearchResultCount({ model, embedded, count }: ViewProps & { readonly embedded: boolean; readonly count: number }) {
    if (model.media.isPending) return <span className='client-result-count' aria-busy='true'><span className='client-skeleton-count' aria-hidden='true' /><span className='client-loading-label'>Chargement du nombre de titres…</span></span>;
    if (model.view === 'search' && model.seerr.connected && !embedded) return <span className='client-result-count'>{count} titres affichés</span>;
    return <span className='client-result-count'>{model.media.data?.total || 0} titres</span>;
}

/** One loaded page of a long list: rendered once, so that hovering a card does not redraw hundreds of them. */
const GridChunk = memo(function ClientGridChunk({ items, render }: Readonly<{ items: BaseItemDto[]; render: (items: BaseItemDto[]) => ReactNode }>) {
    return <>{render(items)}</>;
}, (previous, next) => previous.items === next.items);

/** Asks for the next titles well before the end of the page is reached. */
function LoadMore({ loading, failed, pages, load }: Readonly<{ loading: boolean; failed: boolean; pages: number; load: () => void }>) {
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
        {failed && <p role='alert'>Impossible de charger la suite. <button type='button' onClick={load}>Réessayer</button></p>}
        {!supported && !loading && !failed && <button type='button' className='client-button' onClick={load}>Afficher plus</button>}
    </div>;
}

function LibraryView({ model, embedded = false }: ViewProps & { readonly embedded?: boolean }) {
    const { view, searchInput, setSearchInput, setParams, cards, media, genres, genre, sort, params } = model;
    const more = useMoreBrowse(view, model.browseInput.search, model.browseInput.filters || {}, media.data);
    const { fetchMore } = more;
    const loadMore = useCallback(() => {
        void fetchMore();
    }, [fetchMore]);
    const local = more.pages.flat();
    const external = mixCatalogue(local, !embedded && view === 'search' ? model.catalogue.items : []).slice(local.length);
    const externalPending = !embedded && view === 'search' && model.seerr.enabled && (model.catalogue.loading || model.seerr.status.isPending || model.seerr.me.isFetching);
    function browse(changes: Record<string, string>) {
        const next = new URLSearchParams(params);
        Object.entries(changes).forEach(([key, value]) => {
            next.set(key, value);
        });
        setParams(next);
    }
    return <section className={`client-library${view === 'search' ? ' client-search-page' : ''}${embedded ? ' embedded' : ''}`}>
        {!embedded && <header className='client-library-heading'><h1>{params.get('collectionName') || params.get('personName') || links.find(([key]) => key === view)?.[1] || 'Bibliothèque'}</h1>{view === 'search' && <p>Un titre, une envie de cinéma : trouvez votre prochaine séance.</p>}</header>}
        {!embedded && <>{view === 'search' && <form onSubmit={event => {
            event.preventDefault();
            browse({ q: searchInput });
        }}><ClientIcon name='search' /><input type='search' aria-label='Rechercher un film ou une série' placeholder='Titre d’un film ou d’une série' value={searchInput} onChange={event => setSearchInput(event.target.value)} />{searchInput && <button type='button' aria-label='Effacer la recherche' onClick={() => {
                setSearchInput('');
                browse({ q: '' });
            }}>×</button>}<button>Rechercher</button></form>}
        <div className='client-filter-options'><label>Genre <select value={genre} onChange={event => browse({ genre: event.target.value })}><option value=''>Tous les genres</option>{genres.data?.filter(entry => entry.Name).map(entry => <option key={entry.Id || entry.Name} value={entry.Name!}>{entry.Name}</option>)}</select></label><label>Trier <select value={sort} onChange={event => browse({ sort: event.target.value })}><option value='name'>Titre</option><option value='recent'>Ajouts récents</option></select></label><SearchResultCount model={model} embedded={embedded} count={local.length + external.length} /></div></>}
        {media.isPending && <ClientSkeleton layout='grid' count={12} contained label='Chargement des titres…' />}
        <div className='client-grid'>
            {more.pages.filter(page => page.length).map(page => <GridChunk key={page[0].Id} items={page} render={cards} />)}
            {cards(external)}
        </div>
        {more.hasMore && <LoadMore loading={more.isFetching} failed={more.isError} pages={more.pages.length} load={loadMore} />}
        {externalPending && <ClientSkeleton layout='row' contained label='Recherche dans les découvertes…' />}
        {!embedded && view === 'search' && model.catalogue.hasNextPage && <button className='client-button' disabled={model.catalogue.isFetchingNextPage} onClick={() => { void model.catalogue.fetchNextPage(); }}>Plus de découvertes</button>}
        {!embedded && view === 'search' && model.catalogue.isError && <p>Les résultats externes sont temporairement indisponibles. <button onClick={() => { void model.catalogue.refetch(); }}>Réessayer</button></p>}
        {media.data?.items.length === 0 && !model.catalogue.items.length && !externalPending && <p>{view === 'mine' ? 'Ajoutez des films et des séries à votre liste depuis leurs fiches.' : 'Aucun résultat.'}</p>}
    </section>;
}

/* eslint-enable react/jsx-no-bind */
