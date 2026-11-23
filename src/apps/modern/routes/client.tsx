import { usePreviewCapabilities } from '../features/client/previews/provider';
/* eslint-disable react/jsx-no-bind -- View-local closures do not cross memoized component boundaries. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getUserDataApi } from '@jellyfin/sdk/lib/utils/api/user-data-api';
import useClientMediaQuery from '../features/client/useClientMediaQuery';
import { useQueryClient } from '@tanstack/react-query';
import { APP_NAME } from 'constants/branding';
import React, { type CSSProperties, lazy, memo, Suspense, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigationType, useSearchParams, useNavigate, useParams } from 'react-router-dom';

import Page from 'components/Page';
import { playbackManager } from 'components/playback/playbackmanager';
import { useApi } from 'hooks/useApi';
import { useWebConfig } from 'hooks/useWebConfig';
import type { ItemDto } from 'types/base/models/item-dto';
import Events from 'utils/events';

import ActionLabel from '../features/client/ActionLabel';
import SpoilerProvider from '../features/client/SpoilerProvider';
import { useEpisodeSpoilers } from '../features/client/spoilers';
import DetailSynopsis from '../features/client/DetailSynopsis';
import SeriesEpisodesPanel, { SeasonRail } from '../features/client/SeriesEpisodes';
import { remoteSeasonChoices, type RemoteSeason } from '../features/client/seriesEpisodesModel';
import HeroArtwork from '../features/client/HeroArtwork';
import ClientSkeleton from '../features/client/ClientSkeleton';
import PreviewProvider, { usePreviews } from '../features/client/PreviewProvider';
import PreviewClip from '../features/client/PreviewClip';
import { interfacePreferenceKey, type Preferences, useInterfacePreferences } from '../features/client/interfacePreferences';
import HeroPagination, { type MarkerPosition } from '../features/client/HeroPagination';
import useLoadedHero from '../features/client/useLoadedHero';
import useTabPreparation from '../features/client/useTabPreparation';
import Artwork from '../features/client/Artwork';
import useClientMotion from '../features/client/useClientMotion';
import useHeroBackground from '../features/client/useHeroBackground';
import { artworkUrl, heroArtworkSizes, preloadArtwork } from '../features/client/artwork';
import ClientIcon from '../features/client/ClientIcon';
import useArtworkColor from '../features/client/useArtworkColor';
import PersonalRating from '../features/client/PersonalRating';
import RatingsOverview from '../features/client/RatingsOverview';
import TitleLogo from '../features/client/TitleLogo';
import { GenreTaste, PersonalStatsBand } from '../features/client/PersonalOverview';
import usePersonalUpcoming from '../features/client/usePersonalUpcoming';
import { usePersonalStats, useViewingHistory } from '../features/client/usePersonalStats';
import HeroMetadata from '../features/client/HeroMetadata';
import DetailExtras from '../features/client/DetailExtras';
import DetailMenu from '../features/client/DetailMenu';
import { openConnectivity } from '../features/client/remote/ConnectivityLayer';
import RemoteIcon from '../features/client/remote/RemoteIcon';
import ProfileEntrance from '../features/client/profiles/ProfileEntrance';
import { signOut } from '../features/client/profiles/profileSession';
import { useProfileGate } from '../features/client/profiles/useProfileGate';
import { mediaVersions } from '../features/client/mediaVersions';
import TrailerAction from '../features/client/trailers/TrailerAction';
import { useTitleTrackChoice } from '../features/client/useTitleTrackChoice';
import { chosenTracks } from '../features/client/languageTags';
import { RecentPage } from '../features/client/LocalDiscoveryPages';
import MediaRow, { type MediaRowKind } from '../features/client/MediaRow';
import { ChoiceSelect, type Option } from '../features/client/settings/controls';
import AdvancedLibraryFilters from '../features/client/AdvancedLibraryFilters';
import { countLibraryFilters, isFullLibrary, readLibraryFilters } from '../features/client/libraryFilters';
import { QueueActions } from '../features/client/QueueActions';
import { buildMediaQueue, type PlayQueue } from '../features/client/mediaQueue';
import GridLoadMore from '../features/client/GridLoadMore';
import { FolderPickerProvider, ListAction, useFolderPicker } from '../features/client/folders/FolderPicker';
import { canFile } from '../features/client/folders/model';
import WatchedMarker, { watchedLabel } from '../features/client/WatchedMarker';
import { episodeLabel, isWatchedCard, progressPercent, uniqueItems } from '../features/client/model';
import { clientRequest } from '../features/client/session';
import { pickHeroes, type HeroMix } from '../features/client/heroSelection';
import { useClientDetails, useClientFilters, useClientMedia, useHeroPool, useMoreBrowse } from '../features/client/useClientMedia';
import '../features/client/client.scss';
import '../features/client/prototype.scss';
import '../features/client/motion.scss';
import '../features/client/sagas.scss';
import '../features/client/previews.scss';
import '../features/client/ratings.scss';
import '../features/client/heroBackground.scss';
import '../features/client/headerAlignment.scss';
import '../features/client/readableBackdrops.scss';
import '../features/client/themeConsistency.scss';
import '../features/client/search.scss';
import '../features/client/mediaVersions.scss';
import '../features/client/detailInfoPosition.scss';

type ClientNavigationState = { returnTo?: string, returnState?: ClientNavigationState | null, restoreFocus?: boolean, episodeDrawer?: boolean };
import AmbientBackdrop from '../features/client/AmbientBackdrop';
import { SeerrProvider, useSeerr } from '../features/client/seerr/SeerrContext';
import { useLocalIdentities, useSeerrCatalogue, useSeerrDetail, useSeerrUpcoming } from '../features/client/seerr/queries';
import UpcomingRow from '../features/client/UpcomingRow';
import SearchBar from '../features/client/SearchBar';
import Spotlight, { type SpotlightHandle } from '../features/client/spotlight/Spotlight';
import PlaybackStarting from '../features/client/player/PlaybackStarting';
import '../features/client/player/player.scss';
import { exactSearchFirst, groupSearchResults, matchesSearchTitle, searchMode } from '../features/client/searchResults';
import SharedCatalogArtwork from '../features/client/SharedCatalogArtwork';
import { latestFollowed } from '../features/client/spotlight/sharedRecent';
import { sharedCatalogItems, useSharedCatalog } from '../features/client/sharedCatalog';
import NotificationCenter from '../features/client/requests/NotificationCenter';
import { CompactRequest } from '../features/client/requests/RequestInline';
import { useRequestProgress } from '../features/client/requests/queries';
import { canRequest, externalIdentity, imageUrl, isExternal, mediaLabel, mixCatalogue, type CatalogueItem } from '../features/client/seerr/model';

const SettingsPage = lazy(() => import(/* webpackChunkName: "client-settings" */ '../features/client/settings/SettingsPage'));
const ProfilePage = lazy(() => import(/* webpackChunkName: "client-profiles" */ '../features/client/profiles/ProfilePage'));
const FolderPage = lazy(() => import(/* webpackChunkName: "client-folder" */ '../features/client/folders/FolderPage'));
const FolderPanel = lazy(() => import(/* webpackChunkName: "client-folder-panel" */ '../features/client/folders/FolderPanel'));
const PublicCollections = lazy(() => import(/* webpackChunkName: "client-collections" */ '../features/client/collections/PublicCollections'));
const TonightPage = lazy(() => import(/* webpackChunkName: "client-tonight" */ '../features/client/TonightPage'));
const QuickConnectMenuItem = lazy(() => import(/* webpackChunkName: "client-account" */ '../features/client/account/AccountSettings')
    .then(module => ({ default: module.QuickConnectMenuItem })));
const seerrViews = () => import(/* webpackChunkName: "client-seerr" */ '../features/client/seerr/SeerrViews');
const ExternalDetail = lazy(() => seerrViews().then(module => ({ default: module.ExternalDetail })));
const RequestDialog = lazy(() => seerrViews().then(module => ({ default: module.RequestDialog })));
const RequestTracking = lazy(() => seerrViews().then(module => ({ default: module.RequestTracking })));
const RequestPage = lazy(() => import(/* webpackChunkName: "client-requests" */ '../features/client/requests/RequestPage'));
const PersonPage = lazy(() => import(/* webpackChunkName: "client-person" */ '../features/client/person/PersonPage'));

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
function allowExternalCatalogue(view: string, selectors: string[], mode: string | null, blankSearch: boolean) {
    return !blankSearch && !selectors.some(Boolean) && ['home', 'films', 'series', 'search'].includes(view)
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

function clientScrollKey(prefKey: string | undefined, location: ReturnType<typeof useLocation>, view: string, params: URLSearchParams) {
    const stable = new URLSearchParams(params);
    stable.delete('season');
    stable.delete('episodes');
    const scope = ['folder', 'collections'].includes(view) ? params.get('collection') || '' : stable.toString();
    return `${prefKey}-scroll-${location.pathname}?${scope}`;
}

function clientPageReady(id: string, view: string, item: BaseItemDto | undefined, mediaReady: boolean, externalReady: boolean) {
    return externalReady || (id ? !!item : ['settings', 'collections', 'folder', 'person', 'requests', 'tonight'].includes(view) || mediaReady);
}

/** What the blurred page background shows when no card is hovered. */
function pageBackdrop(id: string, view: string, hero: BaseItemDto | undefined, own: string, shown: BaseItemDto[], backdropOf: (item: BaseItemDto) => string) {
    // Detail pages have their own full backdrop.
    if (id) return '';
    if (hero) return backdropOf(hero);
    // Ce soir and Mon espace name their own image; Paramètres keeps the previous one.
    if (own || ['tonight', 'mine', 'settings'].includes(view)) return own;
    // Nouveautés lists the films first: its background is the first title on screen.
    const first = view === 'recent' ? shown.find(entry => entry.Type === 'Movie') || shown[0] : shown[0];
    return first ? backdropOf(first) : '';
}

function clientBrowseInput(view: string, search: string, filters: Parameters<typeof useClientMedia>[3]) {
    return ['mine', 'tonight'].includes(view) ? { search: '', filters: {} } : { search, filters };
}

function routedView(params: URLSearchParams, folderId?: string, personId?: string) {
    if (folderId) return 'folder';
    if (personId) return 'person';
    return params.get('view') || 'home';
}

function clientBrowseView(view: string, id: string, emptySearch: boolean) {
    return id || ['settings', 'collections', 'folder', 'person', 'requests', 'tonight'].includes(view) || emptySearch ? 'disabled' : view;
}

function useSharedBrowse(view: string, id: string, search: string) {
    const shared = useSharedCatalog();
    const entries = shared.data || [];
    const matching = view === 'search' ? entries.filter(entry => matchesSearchTitle(entry.title, search)) : entries;
    const sharedLocal = useLocalIdentities(matching.length > 0 && ['home', 'films', 'series', 'search'].includes(view) && !id);
    const selected = view === 'home' ? latestFollowed(entries).slice(0, 12) : matching;
    const sharedItems = sharedCatalogItems(sharedLocal.isSuccess || (view === 'home' && sharedLocal.isError) ? selected : [], sharedLocal.data || []);
    return { shared, sharedItems, sharedLocal };
}

function useClientController() {
    const { api, user } = useApi();
    const seerr = useSeerr();
    const { clientPreviews } = useWebConfig();
    const hasStaticPreviews = Object.keys(clientPreviews?.[user?.ServerId || ''] || {}).length > 0;
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const reducedMotion = useClientMediaQuery('(prefers-reduced-motion: reduce)');
    const restoreFocus = useNavigationType() === 'POP' || (location.state as ClientNavigationState | null)?.restoreFocus === true;
    const restoration = useRef(restoreFocus);
    restoration.current = restoreFocus;
    const { folderId, personId } = useParams();
    const view = routedView(params, folderId, personId);
    const discovery = (view === 'films' || view === 'series') && params.get('mode') !== 'library';
    const id = params.get('id') || '';
    const search = params.get('q') || '';
    const season = params.get('season') || '';
    const genre = params.get('genre') || '';
    const person = params.get('person') || '';
    const audio = params.get('audio') || '';
    const collection = params.get('collection') || '';
    const sort = params.get('sort') === 'recent' ? 'recent' : 'name';
    const filters = useClientFilters(['mine', 'tonight', 'collections', 'folder', 'person'].includes(view) ? 'disabled' : view);
    const genres = { ...filters, data: filters.data?.Genres };
    const cache = useQueryClient();
    const prefKey = interfacePreferenceKey(api?.basePath, user?.Id);
    const [preferences, storePreference] = useInterfacePreferences(prefKey);
    const previewProvider = usePreviewCapabilities(preferences.previews && !reducedMotion);
    const previewProviderAvailable = previewProvider.data === true;
    const hasPreviews = hasStaticPreviews || previewProviderAvailable;
    const [actionError, setActionError] = useState('');
    const [busy, setBusy] = useState(false);
    const [queueBusy, setQueueBusy] = useState(false);
    const queuePending = useRef(false);
    // What is starting to play, shown by name until the player opens.
    const [starting, setStarting] = useState<BaseItemDto | null>(null);
    const [searchInput, setSearchInput] = useState(search);
    const [heroIndex, setHeroIndex] = useState(0);
    const [ambient, setAmbient] = useState('');
    // The page's own blurred background when nothing is hovered: set by Ce soir and Mon espace, derived elsewhere.
    const [ownAmbient, setOwnAmbient] = useState({ page: '', source: '' });
    const pageKey = [id, view, folderId, genre, audio].join('|');
    // Tied to the page that set it: a page set by a child before the parent's effects run is never wiped.
    const pageAmbient = ownAmbient.page === pageKey ? ownAmbient.source : '';
    const setPageAmbient = useCallback((source: string) => setOwnAmbient({ page: pageKey, source }), [pageKey]);
    const prepareTimer = useRef<number>();
    useEffect(() => () => window.clearTimeout(prepareTimer.current), []);
    const [heroPaused, setHeroPaused] = useState(false);
    const [previewPlaying, setPreviewPlaying] = useState(false);
    const [previewSuspended, setPreviewSuspended] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const profileButton = useRef<HTMLButtonElement>(null);
    const surface = useRef<HTMLDivElement>(null);
    const profileMenu = useRef<HTMLDivElement>(null);
    const browseInput = clientBrowseInput(view, search, { genre, sort, person, audio, collection, advanced: readLibraryFilters(view, params) });
    const { standaloneSearch, blankSearch } = searchMode(view, [collection, person, audio], search);
    const media = useClientMedia(clientBrowseView(view, id, blankSearch), browseInput.search, 0, browseInput.filters);
    const remote = isExternal({ Id: id });
    const remoteIdentity = externalIdentity({ Id: id });
    const remoteDetails = useSeerrDetail(remoteIdentity?.type, remoteIdentity?.id, false);
    const allowCatalogue = allowExternalCatalogue(view, [id, collection, person, audio], params.get('mode'), blankSearch);
    const catalogue = useSeerrCatalogue(view, search, allowCatalogue, genre);
    const { shared, sharedItems, sharedLocal } = useSharedBrowse(view, id, search);
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
    useEffect(() => {
        if (!starting) return;
        const started = () => setStarting(null);
        Events.on(playbackManager, 'playbackstart', started);
        // Never left on screen if the start is abandoned without any event.
        const timer = window.setTimeout(started, 45000);
        return () => {
            Events.off(playbackManager, 'playbackstart', started);
            window.clearTimeout(timer);
        };
    }, [starting]);
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
    const scrollKey = clientScrollKey(prefKey, location, view, params);
    const prepareTab = useTabPreparation(pageReady);
    useLayoutEffect(() => {
        const key = scrollKey;
        if (!pageReady) {
            // The page shrinks while loading: that forced position must not be saved as this page's own.
            if (!restoration.current) window.scrollTo(0, 0);
            return;
        }
        restoreClientNavigation(key, restoration.current, id);
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
    }, [scrollKey, pageReady, id]);

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
        void preloadArtwork(image(i, true, true), heroArtworkSizes).catch(() => undefined);
        const targetId = i.Type === 'Episode' ? i.SeriesId || i.Id : i.Id;
        if (!targetId || !api || !user?.Id || isExternal(i)) return;
        void cache.prefetchQuery({
            queryKey: ['Client', api?.basePath, user?.Id, 'Detail', targetId],
            staleTime: 30000,
            queryFn: ({ signal }) => clientRequest(async () => (await getLibraryApi(api!).getItem({ itemId: targetId, userId: user!.Id! }, { signal })).data)
        });
    }
    async function startPlayback(items: BaseItemDto[], startPositionTicks: number, version?: string, explicitQueue = false) {
        const first = items[0];
        setActionError('');
        setPreviewSuspended(true);
        setStarting(first);
        try {
            await playbackManager.play({
                items: items as ItemDto[], startPositionTicks, explicitQueue,
                ...await chosenTracks(api, user?.Id, first, version)
            });
        } catch {
            setStarting(null);
            setPreviewSuspended(false);
            setActionError('La lecture n’a pas pu démarrer. Réessayez dans un instant.');
        }
    }
    async function play(i: BaseItemDto, startTicks?: number, version?: string) {
        if (queuePending.current) return;
        if (isExternal(i)) {
            setParams({ id: i.Id! }, { state: { returnTo: location.pathname + location.search, returnState: location.state } });
            return;
        }
        await startPlayback([i], startTicks ?? (i.UserData?.PlaybackPositionTicks || 0), version);
    }
    const playQueue: PlayQueue = async (source, shuffled) => {
        if (!api || !user?.Id || queuePending.current) return;
        queuePending.current = true;
        setQueueBusy(true);
        setActionError('');
        try {
            const userId = user.Id;
            const queue = await clientRequest(async () => {
                const titles = source === 'favorites' ? (await getLibraryApi(api).getItems({ userId, recursive: true,
                    isFavorite: true, includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series], sortBy: [ItemSortBy.SortName],
                    enableImages: true, imageTypeLimit: 1 })).data.Items || [] : source;
                const episodes = async (seriesId: string) => (await getShowApi(api).getEpisodes({
                    seriesId, userId, isMissing: false
                })).data.Items || [];
                return buildMediaQueue(titles, episodes, shuffled);
            });
            if (!queue.length) {
                setActionError('Aucun titre disponible pour cette lecture.');
                return;
            }
            // The player annotates its queue; keep query data immutable.
            await startPlayback(queue.map(entry => ({ ...entry, ServerId: entry.ServerId || user.ServerId, MediaType: 'Video' })), 0, undefined, true);
        } catch {
            setActionError('Impossible de préparer la lecture. Réessayez.');
        } finally {
            queuePending.current = false;
            setQueueBusy(false);
        }
    };
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
    function cards(items: BaseItemDto[], horizontal = false, withFolders = false) {
        return items.map(i => {
            const tracked = isExternal(i) && sharedItems.some(entry => entry.Id === i.Id);
            const source = image(i, horizontal);
            const watched = isWatchedCard(i, preferences.watchedMarkers);
            const card = <Link className={`client-card${horizontal ? ' client-card-wide' : ''}`} key={i.Id} data-client-focus={i.Id}
                to={`/client?id=${i.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state as ClientNavigationState | null }} aria-label={[i.SeriesName, i.Name, watched && watchedLabel].filter(Boolean).join(' · ')} onPointerEnter={() => prepareDetail(i)} onFocus={() => prepareDetail(i)}>
                {tracked ? <SharedCatalogArtwork item={i} backdrop={horizontal} /> : <Artwork source={source} />}
                {horizontal && <span className='client-card-caption'><strong>{i.SeriesName || i.Name}</strong>
                    <small>{i.Type === 'Episode' ? `${episodeLabel(i)} · ${i.Name}` : i.ProductionYear}</small></span>}
                {progressPercent(i) > 0 && <span className='client-progress'><i style={{ width: `${progressPercent(i)}%` }} /></span>}
                <span className='client-card-fallback'>{i.Name}</span>
                {watched && <WatchedMarker />}
                {isExternal(i) && <span className='client-external-badge'>{tracked ? 'À télécharger' : mediaLabel((i as CatalogueItem).Seerr?.mediaInfo)}</span>}
            </Link>;
            return withFolders && (tracked || canFile(i)) ? <div className='client-folder-search-card' key={i.Id}>{card}<ListAction item={i} /></div> : card;
        });
    }
    function row(title: string, items: BaseItemDto[] | undefined, horizontal = false, kind?: MediaRowKind) {
        if (!items?.length) return null;
        return <MediaRow key={`${title}:${items.map(entry => entry.Id).join('|')}`} title={title} items={items} kind={kind} continuation={horizontal} showDescription={preferences.hoverDescriptions} showWatched={preferences.watchedMarkers} image={image} logo={logo} onPrepare={prepareDetail} onRelease={releaseDetail} />;
    }
    const heroPool = useHeroPool(view === 'home' || discovery ? view : 'disabled', genre);
    const heroItems = useMemo(() => {
        // Titles already in « Continuer à regarder » are not repeated in the home banner.
        const continuing = new Set([...(media.data?.resume || []), ...(media.data?.next || [])].flatMap(entry => [entry.Id || '', entry.SeriesId || '']));
        const picked = view === 'home' || discovery ? pickHeroes(heroPool.data, view as HeroMix, Date.now(), 5, continuing) : [];
        return picked.length ? picked : heroCandidates(discovery, media.data);
    }, [heroPool.data, media.data, view, discovery]);
    const lead = heroItems[heroIndex % Math.max(1, heroItems.length)];
    const nextHero = heroItems[(heroIndex + 1) % Math.max(1, heroItems.length)];
    const nextArtwork = nextHero && !id ? image(nextHero, true, true) : '';
    useEffect(() => {
        if (!nextArtwork) return;
        const timer = window.setTimeout(() => {
            void preloadArtwork(nextArtwork, heroArtworkSizes).catch(() => undefined);
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
    const backdrop = ambient || pageBackdrop(id, view, hero, pageAmbient, media.data?.items || [], entry => image(entry, true));
    return { api, user, params, location, setParams, view, id, folderId, personId, search, browseInput, media, details, item, preferences, actionError, busy,
        searchInput, setSearchInput, starting, genres, genre, sort, savePreference, image, play, playQueue, queueBusy, updateState, cards, row, playItem, hero, error,
        standaloneSearch, prepareDetail, releaseDetail, prepareTab, seerr, catalogue, shared, sharedItems, sharedLocal, upcoming, remote, heroItems, heroIndex, setHeroIndex, setHeroPaused, ambient, hasPreviews, previewProviderAvailable, setPreviewPlaying, previewSuspended, profileOpen, setProfileOpen, profileButton, profileMenu, surface, discovery, filters, audio, accent, backdrop, setPageAmbient };
}

type ClientModel = ReturnType<typeof useClientController>;
type ViewProps = { readonly model: ClientModel };

export default function Client() {
    const { showing, revision } = useProfileGate();
    if (showing) {
        return <Suspense fallback={<ClientSkeleton layout='settings' contained count={3} label='Chargement des profils…' />}>
            <ProfilePage revision={revision} />
        </Suspense>;
    }
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
    const spotlight = useRef<SpotlightHandle>(null);
    return <SpoilerProvider enabled={preferences.hideSpoilers} nextId={details.next.data?.Id} home={view === 'home'} continuing={media.data}><PreviewProvider serverAvailable={model.previewProviderAvailable} surface={model.surface} enabled={preferences.previews} muted={preferences.previewMuted} suspended={model.previewSuspended} toggleMuted={() => model.savePreference({ ...preferences, previewMuted: !preferences.previewMuted })} onPlayingChange={model.setPreviewPlaying}><Page id='clientPage' title={APP_NAME} className='client-page' isBackButtonEnabled={false}>
        <div ref={model.surface} className={`client-interface ${preferences.glass ? 'client-glass' : 'client-classic'} ${preferences.floating ? 'client-floating' : ''} ${preferences.chromatic ? 'client-chromatic' : ''} ${preferences.hero === 'background' ? 'client-hero-background' : ''} client-treatment-${preferences.detailTreatment} client-layout-${preferences.detail} client-detail-info-${preferences.detailInfo} ${id ? 'client-detail-page' : ''}`} style={{ '--client-accent': accent, '--detail-blur': `${preferences.detailBlur}px`, '--detail-shade': preferences.detailShade / 100, '--detail-width': `${preferences.detailWidth}%` } as CSSProperties}>
            <FolderPickerProvider>
                {preferences.ambient && !id && <AmbientBackdrop source={model.backdrop} />}
                <nav className='client-nav' data-alignment={preferences.headerAlignment} aria-label='Navigation principale'>
                    <button ref={profileButton} className='client-profile' aria-label='Menu du profil' aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}>{user?.PrimaryImageTag ? <img src={`${model.api?.basePath}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}&width=96&quality=90`} alt='' /> : user?.Name?.slice(0, 1) || '•'}</button>
                    <NavLinks view={model.folderId ? 'mine' : view} detail={!!id} prepare={model.prepareTab} />
                    {/* À gauche de la loupe : envoyer la lecture vers un autre appareil, regarder à plusieurs. */}
                    <button type='button' className='client-nav-tool' aria-label='Lire sur un autre appareil' title='Lire sur un autre appareil' onClick={() => openConnectivity('targets')}><RemoteIcon name='cast' /></button>
                    <button type='button' className='client-nav-tool' aria-label='Regarder ensemble' title='Regarder ensemble' onClick={() => openConnectivity('together')}><RemoteIcon name='people' /></button>
                    <NotificationCenter play={model.play} />
                    <button type='button' className='client-brand client-search-shortcut' aria-label='Rechercher' title='Rechercher (⌘K ou Ctrl+K)' aria-haspopup='dialog' aria-current={!id && view === 'search' ? 'page' : undefined} onClick={event => spotlight.current?.open(event.currentTarget)}><ClientIcon name='search' /></button>
                    {profileOpen && <div ref={profileMenu} className='client-profile-menu' role='dialog' aria-label='Menu du profil'>
                        <strong>{user?.Name}</strong><Link to='/client?view=profiles' onClick={() => setProfileOpen(false)}><ActionLabel icon='people'>Changer de profil</ActionLabel></Link><Link to='/client?view=mine' onClick={() => setProfileOpen(false)}><ActionLabel icon='profile'>Mon espace</ActionLabel></Link><Link to='/client?view=settings' aria-label='Paramètres' onClick={() => setProfileOpen(false)}><ActionLabel icon='settings'>Paramètres</ActionLabel></Link><Link to='/offline' onClick={() => setProfileOpen(false)}><ActionLabel icon='download'>Hors ligne</ActionLabel></Link><Suspense fallback={null}><QuickConnectMenuItem /></Suspense><button onClick={() => {
                            void signOut(model.api?.basePath, user?.Id);
                        }}><ActionLabel icon='signOut'>Se déconnecter</ActionLabel></button>
                    </div>}
                </nav>
                <ProfileEntrance profile={profileButton} />
                {actionError && <p role='alert' className='client-message'>{actionError}</p>}
                {error && <div className='client-message' role='alert'><p>Impossible de charger les médias.</p><button type='button' className='client-button' onClick={() => (id ? details.item.refetch() : media.refetch())}>Réessayer</button></div>}
                {id && !model.remote && details.item.isPending && <ClientSkeleton layout='detail' label='Chargement de la fiche…' />}
                <BrowseControls model={model} />
                {!id && media.isPending && (view === 'home' || model.discovery) && <ClientSkeleton layout='hero' label='Chargement de la sélection…' />}
                <HeroView model={model} />
                <Suspense fallback={<ClientSkeleton layout='grid' contained count={6} label='Chargement de la page…' />}>
                    <ContentView model={model} />
                </Suspense>
                <Spotlight ref={spotlight} glass={preferences.glass} showWatched={preferences.watchedMarkers} image={model.image} play={model.play} />
                <PlaybackStarting item={model.starting} basePath={model.api?.basePath || ''} />
            </FolderPickerProvider>
        </div>
    </Page></PreviewProvider></SpoilerProvider>;
}

function HeroView({ model }: ViewProps) {
    const { hero, id, location, image, heroItems, setHeroIndex, setHeroPaused, preferences } = model;
    const region = useRef<HTMLElement>(null);
    const marker = useRef<MarkerPosition | null>(null);
    const previews = usePreviews();
    const series = !!id && hero?.Type === 'Series';
    const identity = series ? externalIdentity(hero) : undefined;
    const seasonsQuery = model.details.seasons;
    const { connected, permissions } = model.seerr;
    const remote = useSeerrDetail(identity?.type, identity?.id);
    const [requested, setRequested] = useState<{ id: string; number: number; quality: 'standard' | '4k' }>();
    const seasons = seasonsQuery.data || [];
    const detail = connected && seasonsQuery.isSuccess ? remote.data : undefined;
    const missing = remoteSeasonChoices(seasons, detail, canRequest(permissions, 'tv'), canRequest(permissions, 'tv', true));
    const requestSeason = (season: RemoteSeason) => {
        if (season.quality) setRequested({ id, number: season.number, quality: season.quality });
    };
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
    const layout = seasons.length + missing.length > 1 ? ' client-series-seasons' : ' client-series-single';
    return <><section ref={region} className={`client-hero${id ? ' client-detail' : ' client-home-hero'}${series ? ' client-series-detail' + layout : ''}`} onPointerEnter={() => setHeroPaused(true)} onPointerLeave={() => setHeroPaused(false)} onFocus={() => setHeroPaused(true)} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeroPaused(false);
    }}>
        <HeroArtwork source={image(hero, true, true)} fullBackground={!id && preferences.hero === 'background'} />
        <PreviewClip item={hero} surface={id ? 'detail' : 'hero'} />
        {id && <div className='client-detail-readability' aria-hidden='true' />}
        {id && <Link className='client-back' to={(location.state as ClientNavigationState | null)?.returnTo || '/client'} state={{ ...(location.state as ClientNavigationState | null)?.returnState, restoreFocus: true }}><ClientIcon name='back' />Retour</Link>}
        <HeroCopyView key={hero.Id} model={model} dots={!id && heroItems.length > 1 ? <HeroPagination items={heroItems} index={Math.max(0, heroItems.findIndex(entry => entry.Id === hero.Id))} select={selectHero} position={marker} /> : null} />
        {!id && heroItems.length > 1 && <div className='client-hero-arrows'><button aria-label='Média précédent' onClick={() => advanceHero(-1)}><ClientIcon name='back' /></button><button aria-label='Média suivant' onClick={() => advanceHero(1)}><ClientIcon name='next' /></button></div>}
        {series && <SeasonRail series={hero} seasons={seasons} selected={model.details.selected} episodes={model.details.episodes.data}
            basePath={model.api?.basePath || ''} missing={missing} detail={detail} requestSeason={requestSeason}
            select={season => model.setParams({ id, season }, { state: location.state })} />}
    </section>{series && <EpisodesView model={model} missing={missing} requestSeason={requestSeason} />}
    {!!requested && requested.id === id && <Suspense fallback={null}><RequestDialog key={`${id}-${requested.number}`} item={hero} open initialSeason={requested}
        onClose={() => setRequested(undefined)} /></Suspense>}</>;
}

function HeroCopyView({ model, dots }: ViewProps & { dots: ReactNode }) {
    const { hero, id, api } = model;
    if (!hero) return null;
    return <div className='client-hero-copy'>{!id && <span className='client-eyebrow'>À LA UNE</span>}
        {hero.ImageTags?.Logo && <TitleLogo source={artworkUrl(api?.basePath || '', hero, 'logo')} />}
        <h1 className={hero.ImageTags?.Logo ? 'client-title-fallback' : undefined}>{hero.Name}</h1>
        <HeroMetadata item={hero} detailed={!!id} />
        {id && <DetailSynopsis key={hero.Id} overview={hero.Overview} />}
        <HeroActions model={model} dots={dots} />
        {id && <PersonalRating item={hero} />}
        {id && <CompactRequest identity={externalIdentity(hero)} />}
    </div>;
}

function HeroActions({ model, dots }: ViewProps & { dots: ReactNode }) {
    const { hero, id, item, api, user, location, playItem, busy, play, image, updateState } = model;
    const { choice, chooseTracks } = useTitleTrackChoice(api?.basePath, user?.Id, id ? hero?.Id : undefined);
    if (!hero) return null;
    const homePlayable = hero.Type === 'Movie' ? hero : undefined;
    const playable = id ? playItem : homePlayable;
    const versions = id && playable?.Id === hero.Id ? mediaVersions(playable?.MediaSources) : [];
    const showVersions = versions.length > 1;
    const version = versions.find(entry => entry.id === choice.version)?.id || '';
    const options: Option<string>[] = [['', 'Version auto'], ...versions.map((entry): Option<string> => [entry.id, entry.label, entry.detail])];
    let playLabel = 'Lecture';
    if (playable?.UserData?.PlaybackPositionTicks) playLabel = 'Reprendre';
    if (playable?.Type === 'Episode') playLabel = episodeLabel(playable);
    return <div className={`client-actions${showVersions ? ' has-versions' : ''}`}>
        {playable && <button className='client-play' onClick={() => play(playable, undefined, showVersions ? version : undefined)}><ClientIcon name='play' />{playLabel}</button>}
        {showVersions && <div className='client-version-select'>
            <ChoiceSelect label='Version à lire' value={version} options={options} onChange={entry => chooseTracks({ ...choice, version: entry || undefined })} />
        </div>}
        {!id && <Link className='client-button' data-client-focus={`info-${hero.Id}`} to={`/client?id=${hero.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state as ClientNavigationState | null }}><ClientIcon name='info' />Plus d’infos</Link>}
        {id && <><TrailerAction key={hero.Id} item={hero} backdrop={image(hero, true, true)} play={play} /><ListAction item={hero} disabled={busy} fallback={() => updateState('favorite')} />
            <button className='client-button client-action-circle' aria-label={item?.UserData?.Played ? 'Marquer non vu' : 'Marquer vu'} title={item?.UserData?.Played ? 'Marquer non vu' : 'Marquer vu'} disabled={busy} aria-pressed={!!item?.UserData?.Played} onClick={() => updateState('played')}><ClientIcon name={item?.UserData?.Played ? 'check' : 'eye'} /></button>
            <DetailMenu key={hero.Id} item={hero} basePath={api?.basePath || ''} play={play} choice={choice} chooseTracks={chooseTracks} /></>}
        {dots}
    </div>;
}

function EpisodesView({ model, missing, requestSeason }: ViewProps & { missing: RemoteSeason[]; requestSeason: (season: RemoteSeason) => void }) {
    const { id, details, params, setParams, location, api, play, playQueue, queueBusy } = model;
    const navigate = useNavigate();
    const state = location.state as ClientNavigationState | null;
    const drawer = params.get('episodes') === 'all';
    const seasons = details.seasons.data || [];
    const show = () => setParams({ id, season: details.selected, episodes: 'all' }, { state: { ...state, episodeDrawer: true } });
    const hide = () => {
        if (!drawer) return;
        if (state?.episodeDrawer) navigate(-1);
        else setParams({ id, season: details.selected }, { replace: true, state });
    };
    const choose = (season: string) => setParams({ id, season, episodes: 'all' }, { replace: true, state });
    return <SeriesEpisodesPanel seasons={seasons} missing={missing} requestSeason={requestSeason} selected={details.selected} select={choose} items={details.episodes.data}
        loading={details.seasons.isPending || (!!details.selected && details.episodes.isPending)}
        failed={details.seasons.isError || details.episodes.isError} retry={() => {
            if (details.seasons.isError) void details.seasons.refetch();
            else void details.episodes.refetch();
        }} basePath={api?.basePath || ''} nextId={details.next.data?.Id} play={play} playQueue={playQueue} queueBusy={queueBusy}
        drawer={drawer} openDrawer={show} closeDrawer={hide} />;
}

function TonightInvite({ prepare }: Readonly<{ prepare: (view: string) => void }>) {
    const ready = useCallback(() => prepare('tonight'), [prepare]);
    return <Link className='client-tonight-invite' to='/client?view=tonight' onPointerEnter={ready} onFocus={ready}>
        <span className='client-tonight-invite-copy'><strong>Une idée pour ce soir ?</strong><span>Selon vos envies et votre temps.</span></span>
        <span className='client-tonight-invite-action'>Choisir un film<ClientIcon name='next' /></span>
    </Link>;
}

function HomeContent({ model }: ViewProps) {
    const { media, row } = model;
    // Keep the shared catalogue in its own order and avoid repeating its titles in the discovery rows.
    const continuing = uniqueItems([...(media.data?.resume || []), ...(media.data?.next || [])]).filter((entry, index, all) => !entry.SeriesId || all.findIndex(other => other.SeriesId === entry.SeriesId) === index);
    const used = new Set([...model.heroItems, ...continuing, ...model.sharedItems].map(entry => entry.SeriesId || entry.Id || ''));
    const take = (items: BaseItemDto[], limit: number) => items.filter(entry => !used.has(entry.Id || '')).slice(0, limit).map(entry => {
        used.add(entry.Id || '');
        return entry;
    });
    const picks = take(media.data?.picks || [], 12);
    const recent = take([...(media.data?.movies || []), ...(media.data?.series || [])].sort((a, b) => String(b.DateCreated || '').localeCompare(String(a.DateCreated || ''))), 16);
    const trends = take(model.catalogue.items, 20);
    return <>
        <TonightInvite prepare={model.prepareTab} />
        {row('Continuer à regarder', continuing, true)}
        {row('À découvrir', picks)}
        {row('Ajouts récents', recent)}
        {row('Récemment suivis', model.sharedItems, false, 'shared-catalog')}
        {row('Tendances', trends)}
        {model.catalogue.loading && !trends.length && <ClientSkeleton layout='row' label='Chargement des tendances…' />}
        {model.catalogue.isError && <p className='client-message'>Les tendances sont temporairement indisponibles. Votre bibliothèque reste accessible.</p>}
        <UpcomingRow items={model.upcoming.items.filter(({ item }) => !used.has(item.Id || ''))} />
        {media.data && !media.data.movies.length && !media.data.series.length && !media.data.resume.length && <p className='client-message'>Votre bibliothèque est vide pour le moment.</p>}
    </>;
}

const accountViews = new Map<string, (props: ViewProps) => ReactNode>([
    ['requests', RequestsView], ['settings', SettingsView]
]);

function ContentView({ model }: ViewProps) {
    const { id, view, details, media, row, api, image } = model;
    if (model.remote) return <ExternalDetail key={id} id={id} row={row} image={image} />;
    if (id) return details.item.data && api ? <DetailExtras item={details.item.data} similar={details.similar.data || []} image={image} /> : null;
    if (view === 'home') return <HomeContent model={model} />;
    if (model.personId) {
        return <Suspense fallback={<ClientSkeleton layout='grid' count={6} contained label='Chargement de la personne…' />}>
            <PersonPage key={model.personId} id={model.personId} basePath={api?.basePath || ''} image={image} play={model.play} />
        </Suspense>;
    }
    if (model.folderId) {
        return <FolderPage key={model.folderId} id={model.folderId} image={image} full={model.preferences.hero === 'background'} showWatched={model.preferences.watchedMarkers}
            playQueue={model.playQueue} queueBusy={model.queueBusy} prepare={model.prepareDetail} release={model.releaseDetail} />;
    }
    const AccountView = accountViews.get(view);
    if (AccountView) return <AccountView model={model} />;
    if (view === 'collections') {
        return <PublicCollections image={image} full={model.preferences.hero === 'background'} showWatched={model.preferences.watchedMarkers}
            playQueue={model.playQueue} queueBusy={model.queueBusy} prepare={model.prepareDetail} release={model.releaseDetail} />;
    }
    if (view === 'recent') return <RecentPage items={media.data?.items || []} row={row} />;
    if (view === 'tonight') return <TonightPage play={(item, start) => item.Type === 'Series' ? model.playQueue([item], false) : model.play(item, start)} image={(item, backdrop) => backdrop ? image(item, true) : artworkUrl(model.api?.basePath || '', item, 'draw')} onPrepare={model.prepareDetail} onRelease={model.releaseDetail} onFeature={entry => model.setPageAmbient(entry ? image(entry, true) : '')} />;
    if (model.discovery) return <DiscoveryView model={model} />;
    if (view === 'mine') return <PersonalView model={model} />;
    if (model.standaloneSearch) return <SearchView model={model} />;
    return <LibraryView model={model} />;
}
function RequestsView({ model }: ViewProps) {
    return <Suspense fallback={<ClientSkeleton layout='list' count={3} contained label='Chargement des demandes…' />}>
        <RequestPage play={model.play} />
    </Suspense>;
}

function SettingsView({ model }: ViewProps) {
    const { preferences, savePreference, user, params } = model;
    if (!model.api || !user?.Id) return <section className='client-settings'><h1>Paramètres</h1><ClientSkeleton layout='settings' contained count={3} label='Chargement des préférences…' /></section>;
    return <SettingsPage section={params.get('section')} preferences={preferences} savePreference={savePreference} hasPreviews={model.hasPreviews} />;
}
function changeBrowseParams(params: URLSearchParams, changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => {
        if (value) next.set(key, value);
        else next.delete(key);
    });
    return next;
}

function genreChoices(entries: readonly { Name?: string | null }[] | null | undefined, value: string) {
    const names = [...new Set([...(entries || []).map(entry => entry.Name || ''), value])].filter(Boolean);
    return [['', 'Tous les genres'], ...names.map((name): Option<string> => [name, name])] as const;
}

const titleOrder = [['name', 'Par titre'], ['recent', 'Ajouts récents']] as const;
const availabilityChoices = [['all', 'Tout'], ['available', 'Disponible'], ['missing', 'À télécharger']] as const;

function BrowseControls({ model }: ViewProps) {
    const { id, view, discovery, params, setParams, genres, genre, filters, audio } = model;
    if (id || !['home', 'films', 'series'].includes(view)) return null;
    const languages = filters.data?.AudioLanguages?.flatMap((entry): Option<string>[] => entry.Value ? [[entry.Value, entry.Name || entry.Value]] : []) || [];
    if (audio && !languages.some(([key]) => key === audio)) languages.push([audio, audio]);
    return <div className='client-browse-controls'>
        {view !== 'home' && <div className='client-catalogue-switch' aria-label='Présentation du catalogue'><button aria-pressed={discovery} onClick={() => setParams({ view })}>Découvrir</button><button aria-pressed={!discovery} onClick={() => setParams({ view, mode: 'library' })}>Toute la bibliothèque</button></div>}
        {view !== 'home' && <Link className='client-button client-collections-entry' to='/client?view=collections'><ClientIcon name='collection' />Collections publiques</Link>}
        {(view === 'home' || discovery) && <ChoiceSelect label='Genres' value={genre} options={genreChoices(genres.data, genre)} onChange={value => setParams(changeBrowseParams(params, { genre: value }))} />}
        <ChoiceSelect label='Langues audio' value={audio} options={[['', 'Toutes les langues'], ...languages]} onChange={value => setParams(changeBrowseParams(params, { audio: value }))} />
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
    return <div className='client-discovery'>{row(view === 'films' ? 'À découvrir dans vos films' : 'À découvrir dans vos séries', items.slice(0, 12))}{row('À découvrir aussi', model.catalogue.items.filter(entry => !used.has(entry.Id || '')))}{row('Catalogue partagé', model.sharedItems.filter(entry => entry.Type === (view === 'films' ? 'Movie' : 'Series') && !used.has(entry.Id || '')))}{groups}
        {model.catalogue.loading && !model.catalogue.items.length && <ClientSkeleton layout='row' label='Chargement des découvertes…' />}
        {media.isSuccess && items.length === 0 && model.catalogue.items.length === 0 && !model.catalogue.loading && <p className='client-message'>Aucun titre pour cette sélection.</p>}
        <button className='client-explore-library' onClick={() => setParams({ view, mode: 'library' })}>Explorer toute la bibliothèque ›</button>
    </div>;
}

type PersonalTab = 'list' | 'folders' | 'upcoming' | 'history' | 'taste' | 'requests';

/** Mon espace fits one screen: who I am, what I am watching, then everything else in tabs. */
function PersonalView({ model }: ViewProps) {
    const protect = useEpisodeSpoilers();
    const { user, media, row, image, play, playQueue, queueBusy, seerr, params, setParams } = model;
    const home = useClientMedia('home', '', 0);
    const stats = usePersonalStats();
    const history = useViewingHistory();
    const watched = stats.isPending ? undefined : stats.data?.watchedSeriesIds || [];
    const catalog = model.shared.isPending ? undefined : model.shared.data || [];
    const upcoming = usePersonalUpcoming(watched, catalog);
    const resume = home.data?.resume || [];
    const lead = resume[0];
    const leadBackdrop = lead ? image(lead, true) : '';
    const { setPageAmbient } = model;
    useEffect(() => setPageAmbient(leadBackdrop), [leadBackdrop, setPageAmbient]);
    const tabs: [PersonalTab, string, number?][] = [['list', 'Ma liste', media.data?.total], ['folders', 'Dossiers'], ['upcoming', 'À venir', upcoming.data?.length],
        ['history', 'Vus récemment'], ['taste', 'Mes goûts'], ...(seerr.connected ? [['requests', 'Demandes'] as [PersonalTab, string]] : [])];
    const tab = tabs.find(([key]) => key === params.get('tab'))?.[0] || 'list';
    const open = (next: PersonalTab) => setParams(previous => {
        const changed = new URLSearchParams(previous);
        changed.set('tab', next);
        return changed;
    }, { replace: true });
    const onTabKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const index = tabs.findIndex(([key]) => key === tab) + (event.key === 'ArrowRight' ? 1 : -1);
        const next = tabs[(index + tabs.length) % tabs.length][0];
        open(next);
        event.currentTarget.querySelector<HTMLButtonElement>(`#client-personal-tab-${next}`)?.focus();
    };
    const empty = (text: string) => <p className='client-message'>{text}</p>;
    return <div className='client-personal client-personal-compact'>
        <header className='client-personal-top'>
            <div className='client-personal-identity'><span aria-hidden='true'>{user?.PrimaryImageTag ? <img src={`${model.api?.basePath}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}&width=160&quality=90`} alt='' /> : user?.Name?.slice(0, 1)}</span><div><h1>Mon espace</h1>
                <p>{user?.Name}</p></div></div>
            <PersonalStatsBand stats={stats.data} pending={stats.isPending} favorites={media.data?.total || 0} favoritesPending={media.isPending} open={open} />
        </header>
        {home.isPending && <ClientSkeleton layout='episodes' contained count={3} label='Chargement des reprises…' />}
        {lead && <div className={`client-personal-now${resume.length > 1 ? '' : ' is-single'}`}>
            <section className='client-personal-spotlight'><Artwork source={image(lead, true, true)} className={protect(lead) ? 'client-spoiler-art' : undefined} eager /><PreviewClip item={lead} surface='spotlight' /><div><small>ON CONTINUE ?</small><h2>{lead.SeriesName || lead.Name}</h2><p>{lead.Type === 'Episode' ? `${episodeLabel(lead)} · ${lead.Name}` : 'Votre film vous attend'}</p>
                {progressPercent(lead) > 0 && <span className='client-spotlight-progress' aria-label={`Vu à ${Math.round(progressPercent(lead))} %`}><i style={{ width: `${progressPercent(lead)}%` }} /></span>}
                <button className='client-play' onClick={() => play(lead)}><ClientIcon name='play' />Reprendre</button><Link className='client-button' to={`/client?id=${lead.SeriesId || lead.Id}`}>Voir la fiche</Link></div></section>
            {resume.length > 1 && <section className='client-personal-resume' aria-labelledby='client-personal-resume-title'>
                <h2 id='client-personal-resume-title'>Continuer à regarder</h2>
                <ol>{resume.slice(1, 5).map(entry => <li key={entry.Id}>
                    <button type='button' onClick={() => play(entry)} aria-label={`Reprendre ${[entry.SeriesName, entry.Name].filter(Boolean).join(' · ')}`}>
                        <span className='client-personal-resume-art'><Artwork source={image(entry, true)} className={protect(entry) ? 'client-spoiler-art' : undefined} />
                            {progressPercent(entry) > 0 && <span className='client-progress'><i style={{ width: `${progressPercent(entry)}%` }} /></span>}</span>
                        <span className='client-personal-resume-copy'><strong>{entry.SeriesName || entry.Name}</strong>
                            <small>{entry.Type === 'Episode' ? `${episodeLabel(entry)} · ${entry.Name}` : entry.ProductionYear}</small></span>
                    </button>
                </li>)}</ol>
            </section>}
        </div>}
        {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- Each tab is a button; the list only moves focus. */}
        <div className='client-personal-tabs' role='tablist' aria-label='Sections de Mon espace' onKeyDown={onTabKey}>
            {tabs.map(([key, label, count]) => <button key={key} type='button' role='tab' id={`client-personal-tab-${key}`} aria-selected={tab === key}
                aria-controls='client-personal-panel' tabIndex={tab === key ? 0 : -1} onClick={() => open(key)}>
                {label}{!!count && <span>{count}</span>}
            </button>)}
        </div>
        <div id='client-personal-panel' className='client-personal-panel-area' role='tabpanel' aria-labelledby={`client-personal-tab-${tab}`}>
            {tab === 'list' && <div className='client-personal-favorites' id='client-favorites'>
                {!!media.data?.total && <div className='client-queue-actions'><QueueActions source='favorites' playQueue={playQueue} pending={queueBusy} /></div>}
                <LibraryView model={model} embedded />
            </div>}
            {tab === 'folders' && <Suspense fallback={<ClientSkeleton layout='row' label='Chargement des dossiers…' />}><FolderPanel image={image} /></Suspense>}
            {tab === 'upcoming' && (row('Épisodes à venir', upcoming.data, false, 'upcoming-episodes') || (upcoming.isPending ? <ClientSkeleton layout='row' label='Chargement des épisodes à venir…' /> : empty('Aucun épisode annoncé pour vos séries.')))}
            {tab === 'history' && (row('Vus récemment', history.data) || (history.isPending ? <ClientSkeleton layout='row' label='Chargement de l’historique…' /> : empty('Rien de vu récemment.')))}
            {tab === 'taste' && <div className='client-personal-columns'>{!!stats.data?.genres.length && <GenreTaste stats={stats.data} />}<RatingsOverview /></div>}
            {tab === 'requests' && <PersonalRequests connected={seerr.connected} />}
        </div>
    </div>;
}

function PersonalRequests({ connected }: Readonly<{ connected: boolean }>) {
    const query = useRequestProgress();
    if (!query.data && !connected) return null;
    const active = query.data?.filter(entry => entry.active).length || 0;
    return <div id='client-requests' className='client-personal-requests'>
        {query.data ? <section className='client-request-overview'>
            <div><h2>Mes demandes</h2><p>{active ? `${active} en cours` : 'Aucune demande en cours'}</p></div>
            <Link className='client-button' to='/client?view=requests'><ClientIcon name='bell' />Voir le suivi</Link>
        </section> : <RequestTracking />}
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

function LibraryResultCount({ model, embedded, loaded, extra, onlyMissing }: ViewProps & Readonly<{
    embedded: boolean; loaded: number; extra: number; onlyMissing: boolean;
}>) {
    if (onlyMissing && model.sharedLocal.isFetching) return <span className='client-result-count' aria-busy='true'>Vérification…</span>;
    if (onlyMissing || (['films', 'series'].includes(model.view) && extra > 0)) {
        const count = (onlyMissing ? 0 : (model.media.data?.total || 0)) + extra;
        return <span className='client-result-count' aria-live='polite'>{count} titre{count === 1 ? '' : 's'}</span>;
    }
    return <SearchResultCount model={model} embedded={embedded} count={loaded + extra} />;
}

function SearchView({ model }: ViewProps) {
    const { search, searchInput, setSearchInput, setParams, params, cards, media, catalogue, genre, sort, genres } = model;
    const query = search.trim();
    const hasFolders = !!useFolderPicker()?.folders;
    const more = useMoreBrowse('search', search, model.browseInput.filters || {}, media.data);
    const tracked = genre ? model.sharedItems.filter(item => item.Genres?.includes(genre)) : model.sharedItems;
    const results = groupSearchResults(more.pages.flat(), tracked, catalogue.items);
    const shown = sort === 'name' ? exactSearchFirst(results.own, query) : results.own;
    const count = results.own.length + results.saved.length + results.suggestion.length;
    const waiting = !!query && (media.isPending || model.shared.isPending || model.sharedLocal.isFetching || catalogue.loading
        || (model.seerr.enabled && (model.seerr.status.isPending || model.seerr.me.isFetching)));

    const noun = count === 1 ? 'résultat affiché' : 'résultats affichés';
    const setFilter = (key: string, value: string) => setParams(changeBrowseParams(params, { [key]: value }));

    return <section className='client-library client-search-page'>
        <header className='client-search-heading'><h1>Rechercher</h1></header>
        <SearchBar value={searchInput} onChange={setSearchInput} onSubmit={value => setFilter('q', value)} />
        {query ? <>
            <div className='client-filter-options client-search-controls'>
                <ChoiceSelect label='Genre' value={genre} options={genreChoices(genres.data, genre)} onChange={value => setFilter('genre', value)} />
                <ChoiceSelect label='Trier les titres de la bibliothèque' value={sort} options={titleOrder} onChange={value => setFilter('sort', value)} />
                <span className='client-result-count' role='status'>
                    {waiting ? 'Recherche en cours…' : `${count} ${noun}`}
                </span>
            </div>
            <SearchGroup title='Dans ta bibliothèque' count={results.own.length}>
                <div className='client-grid'>{cards(shown, false, hasFolders)}</div>
                {more.hasMore && <GridLoadMore loading={more.isFetching} failed={more.isError} pages={more.pages.length} load={() => { void more.fetchMore(); }} />}
            </SearchGroup>
            <SearchGroup title='Catalogue partagé' count={results.saved.length}><div className='client-grid'>{cards(results.saved, false, hasFolders)}</div></SearchGroup>
            <SearchGroup title='À demander' count={results.suggestion.length || Number(catalogue.hasNextPage)}>
                <div className='client-grid'>{cards(results.suggestion)}</div>
                {catalogue.hasNextPage && <button type='button' className='client-button' disabled={catalogue.isFetchingNextPage} onClick={() => { void catalogue.fetchNextPage(); }}>Plus de titres à demander</button>}
            </SearchGroup>
            {waiting && !count && <ClientSkeleton layout='grid' contained count={8} label='Recherche en cours…' />}
            {media.isError && <p className='client-search-feedback' role='status'>Impossible de rechercher dans la bibliothèque. <button type='button' onClick={() => { void media.refetch(); }}>Réessayer</button></p>}
            {catalogue.isError && <p className='client-search-feedback' role='status'>Les titres à demander sont temporairement indisponibles. <button type='button' onClick={() => { void catalogue.refetch(); }}>Réessayer</button></p>}
            {!waiting && !count && !media.isError && !catalogue.isError && <p className='client-search-feedback'>Aucun résultat pour « {query} ». Essaie un autre titre ou retire un filtre.</p>}
        </> : <p className='client-search-feedback'>Cherche un film ou une série dans ta bibliothèque et parmi les titres à demander.</p>}
    </section>;
}

function SearchGroup({ title, count, children }: Readonly<{ title: string; count: number; children: ReactNode }>) {
    return count > 0 ? <section className='client-search-group' aria-label={title}><h2>{title}</h2>{children}</section> : null;
}

function LibraryView({ model, embedded = false }: ViewProps & { readonly embedded?: boolean }) {
    const { view, setParams, cards, media, genres, genre, sort, params } = model;
    const more = useMoreBrowse(view, model.browseInput.search, model.browseInput.filters || {}, media.data);
    const { fetchMore } = more;
    const loadMore = useCallback(() => {
        void fetchMore();
    }, [fetchMore]);
    const local = more.pages.flat();
    const sharedView = ['films', 'series'].includes(view) && model.shared.data != null;
    const availability = sharedView ? params.get('availability') : null;
    const withoutFiles = availability === 'missing';
    const advanced = model.browseInput.filters?.advanced || {};
    const hasAdvanced = countLibraryFilters(advanced) > 0;
    const saved = sharedView && !hasAdvanced && availability !== 'available' && (!genre || withoutFiles) && !params.get('audio') && !params.get('person') && !params.get('collection') ?
        model.sharedItems.filter(entry => isExternal(entry) && entry.Type === (view === 'films' ? 'Movie' : 'Series')) : [];
    const external = mixCatalogue(local, saved).slice(local.length);
    const browse = (changes: Record<string, string>) => setParams(changeBrowseParams(params, changes));
    return <section className={`client-library${embedded ? ' embedded' : ''}`}>
        {!embedded && <header className='client-library-heading'><h1>{params.get('collectionName') || params.get('personName') || links.find(([key]) => key === view)?.[1] || 'Bibliothèque'}</h1></header>}
        {!embedded
        && <div className='client-filter-options'>
            {!withoutFiles && <>
                <ChoiceSelect label='Genre' value={genre} options={genreChoices(genres.data, genre)} onChange={value => browse({ genre: value })} />
                <ChoiceSelect label='Trier' value={sort} options={titleOrder} onChange={value => browse({ sort: value })} />
            </>}
            {sharedView && <ChoiceSelect label='Disponibilité' value={availability || 'all'} options={availabilityChoices} onChange={value => browse(value === 'missing' ?
                { availability: value, genre: '', audio: '', person: '', collection: '' } : { availability: value })} />}
            {!withoutFiles && isFullLibrary(view, params.get('mode')) && <AdvancedLibraryFilters key={view} view={view} filters={advanced} onChange={browse} />}
            <LibraryResultCount model={model} embedded={embedded} loaded={local.length} extra={external.length} onlyMissing={withoutFiles} />
        </div>}
        {model.sharedLocal.isError && sharedView && <p role='status'>Impossible de vérifier quels titres du catalogue sont disponibles.</p>}
        {withoutFiles && !external.length && !model.sharedLocal.isFetching && !model.sharedLocal.isError && <p>Aucun titre suivi à télécharger.</p>}
        {!withoutFiles && media.isPending && <ClientSkeleton layout='grid' count={12} contained label='Chargement des titres…' />}
        <div className='client-grid'>
            {!withoutFiles && more.pages.filter(page => page.length).map(page => <GridChunk key={`${page[0].Id}:${model.preferences.watchedMarkers}`} items={page} render={cards} />)}
            {cards(external)}
        </div>
        {!withoutFiles && more.hasMore && <GridLoadMore loading={more.isFetching} failed={more.isError} pages={more.pages.length} load={loadMore} />}
        {!withoutFiles && !external.length && media.data?.items.length === 0 && <p>{view === 'mine' ? 'Ajoutez des films et des séries à votre liste depuis leurs fiches.' : 'Aucun résultat.'}</p>}
    </section>;
}

/* eslint-enable react/jsx-no-bind */
