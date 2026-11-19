import { usePreviewCapabilities } from '../features/client/previews/provider';
import { QuickConnectMenuItem } from '../features/client/account/AccountSettings';
import SettingsPage from '../features/client/settings/SettingsPage';
/* eslint-disable react/jsx-no-bind -- View-local closures do not cross memoized component boundaries. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getUserDataApi } from '@jellyfin/sdk/lib/utils/api/user-data-api';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useQueryClient } from '@tanstack/react-query';
import { APP_NAME } from 'constants/branding';
import React, { type CSSProperties, memo, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigationType, useSearchParams, useNavigate, useParams } from 'react-router-dom';

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
import { interfacePreferenceKey, type Preferences, useInterfacePreferences } from '../features/client/interfacePreferences';
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
import usePersonalUpcoming from '../features/client/usePersonalUpcoming';
import { usePersonalStats, useViewingHistory } from '../features/client/usePersonalStats';
import HeroMetadata from '../features/client/HeroMetadata';
import DetailExtras from '../features/client/DetailExtras';
import DetailMenu from '../features/client/DetailMenu';
import { openConnectivity } from '../features/client/remote/ConnectivityLayer';
import RemoteIcon from '../features/client/remote/RemoteIcon';
import ProfileEntrance from '../features/client/profiles/ProfileEntrance';
import ProfilePage from '../features/client/profiles/ProfilePage';
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
import { QueueAction, QueueActions } from '../features/client/QueueActions';
import { buildMediaQueue, isQueuedVideo, type PlayQueue } from '../features/client/mediaQueue';
import GridLoadMore from '../features/client/GridLoadMore';
import FolderPage from '../features/client/folders/FolderPage';
import FolderPanel from '../features/client/folders/FolderPanel';
import { FolderPickerProvider, ListAction, useFolderPicker } from '../features/client/folders/FolderPicker';
import { canFile } from '../features/client/folders/model';
import WatchedMarker, { watchedLabel } from '../features/client/WatchedMarker';
import { episodeLabel, isWatchedCard, progressPercent, uniqueItems } from '../features/client/model';
import { clientRequest } from '../features/client/session';
import { useClientDetails, useClientFilters, useClientMedia, useMoreBrowse } from '../features/client/useClientMedia';
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

type ClientNavigationState = { returnTo?: string, returnState?: ClientNavigationState | null, restoreFocus?: boolean };
import TonightPage from '../features/client/TonightPage';
import PublicCollections from '../features/client/collections/PublicCollections';
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
import { ExternalDetail, RequestTracking } from '../features/client/seerr/SeerrViews';
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
    const scope = ['folder', 'collections'].includes(view) ? params.get('collection') || '' : params.toString();
    return `${prefKey}-scroll-${location.pathname}?${scope}`;
}

function clientPageReady(id: string, view: string, item: BaseItemDto | undefined, mediaReady: boolean, externalReady: boolean) {
    return externalReady || (id ? !!item : ['settings', 'collections', 'folder'].includes(view) || mediaReady);
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

function clientBrowseView(view: string, id: string, emptySearch: boolean) {
    return id || ['settings', 'collections', 'folder'].includes(view) || emptySearch ? 'disabled' : view;
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
    const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const restoreFocus = useNavigationType() === 'POP' || (location.state as ClientNavigationState | null)?.restoreFocus === true;
    const { folderId } = useParams();
    const view = folderId ? 'folder' : params.get('view') || 'home';
    const discovery = (view === 'films' || view === 'series') && params.get('mode') !== 'library';
    const id = params.get('id') || '';
    const search = params.get('q') || '';
    const season = params.get('season') || '';
    const genre = params.get('genre') || '';
    const person = params.get('person') || '';
    const audio = params.get('audio') || '';
    const collection = params.get('collection') || '';
    const sort = params.get('sort') === 'recent' ? 'recent' : 'name';
    const filters = useClientFilters(['mine', 'tonight', 'collections', 'folder'].includes(view) ? 'disabled' : view);
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
    }, [scrollKey, pageReady, id, restoreFocus]);

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
                {tracked && !source ? <SharedCatalogArtwork item={i} backdrop={horizontal} /> : <Artwork source={source} />}
                {horizontal && <span className='client-card-caption'><strong>{i.SeriesName || i.Name}</strong>
                    <small>{i.Type === 'Episode' ? `${episodeLabel(i)} · ${i.Name}` : i.ProductionYear}</small></span>}
                {progressPercent(i) > 0 && <span className='client-progress'><i style={{ width: `${progressPercent(i)}%` }} /></span>}
                <span className='client-card-fallback'>{i.Name}</span>
                {watched && <WatchedMarker />}
                {isExternal(i) && <span className='client-external-badge'>{tracked ? 'À télécharger' : mediaLabel((i as CatalogueItem).Seerr?.mediaInfo)}</span>}
            </Link>;
            return withFolders && canFile(i) ? <div className='client-folder-search-card' key={i.Id}>{card}<ListAction item={i} /></div> : card;
        });
    }
    function row(title: string, items: BaseItemDto[] | undefined, horizontal = false, kind?: MediaRowKind) {
        if (!items?.length) return null;
        return <MediaRow key={`${title}:${items.map(entry => entry.Id).join('|')}`} title={title} items={items} kind={kind} continuation={horizontal} showDescription={preferences.hoverDescriptions} showWatched={preferences.watchedMarkers} image={image} logo={logo} onPrepare={prepareDetail} onRelease={releaseDetail} />;
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
    const backdrop = ambient || pageBackdrop(id, view, hero, pageAmbient, media.data?.items || [], entry => image(entry, true));
    return { api, user, params, location, setParams, view, id, folderId, search, browseInput, media, details, item, preferences, actionError, busy,
        searchInput, setSearchInput, starting, genres, genre, sort, savePreference, image, play, playQueue, queueBusy, updateState, cards, row, playItem, hero, error,
        standaloneSearch, prepareDetail, releaseDetail, prepareTab, seerr, catalogue, shared, sharedItems, sharedLocal, upcoming, remote, heroItems, heroIndex, setHeroIndex, setHeroPaused, ambient, hasPreviews, previewProviderAvailable, setPreviewPlaying, previewSuspended, profileOpen, setProfileOpen, profileButton, profileMenu, surface, discovery, filters, audio, accent, backdrop, setPageAmbient };
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
    const spotlight = useRef<SpotlightHandle>(null);
    return <PreviewProvider serverAvailable={model.previewProviderAvailable} surface={model.surface} enabled={preferences.previews} muted={preferences.previewMuted} suspended={model.previewSuspended} toggleMuted={() => model.savePreference({ ...preferences, previewMuted: !preferences.previewMuted })} onPlayingChange={model.setPreviewPlaying}><Page id='clientPage' title={APP_NAME} className='client-page' isBackButtonEnabled={false}>
        <div ref={model.surface} className={`client-interface ${preferences.glass ? 'client-glass' : 'client-classic'} ${preferences.floating ? 'client-floating' : ''} ${preferences.chromatic ? 'client-chromatic' : ''} ${preferences.hero === 'background' ? 'client-hero-background' : ''} client-treatment-${preferences.detailTreatment} client-layout-${preferences.detail} ${id ? 'client-detail-page' : ''}`} style={{ '--client-accent': accent, '--detail-blur': `${preferences.detailBlur}px`, '--detail-shade': preferences.detailShade / 100, '--detail-width': `${preferences.detailWidth}%` } as CSSProperties}>
            <FolderPickerProvider>
                {preferences.ambient && !id && <AmbientBackdrop source={model.backdrop} />}
                <nav className='client-nav' data-alignment={preferences.headerAlignment} aria-label='Navigation principale'>
                    <button ref={profileButton} className='client-profile' aria-label='Menu du profil' aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}>{user?.PrimaryImageTag ? <img src={`${model.api?.basePath}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}&width=96&quality=90`} alt='' /> : user?.Name?.slice(0, 1) || '•'}</button>
                    <NavLinks view={model.folderId ? 'mine' : view} detail={!!id} prepare={model.prepareTab} />
                    {/* À gauche de la loupe : envoyer la lecture vers un autre appareil, regarder à plusieurs. */}
                    <button type='button' className='client-nav-tool' aria-label='Lire sur un autre appareil' title='Lire sur un autre appareil' onClick={() => openConnectivity('targets')}><RemoteIcon name='cast' /></button>
                    <button type='button' className='client-nav-tool' aria-label='Regarder ensemble' title='Regarder ensemble' onClick={() => openConnectivity('together')}><RemoteIcon name='people' /></button>
                    <button type='button' className='client-brand client-search-shortcut' aria-label='Rechercher' title='Rechercher (⌘K ou Ctrl+K)' aria-haspopup='dialog' aria-current={!id && view === 'search' ? 'page' : undefined} onClick={event => spotlight.current?.open(event.currentTarget)}><ClientIcon name='search' /></button>
                    {profileOpen && <div ref={profileMenu} className='client-profile-menu' role='dialog' aria-label='Menu du profil'>
                        <strong>{user?.Name}</strong><Link to='/client?view=profiles' onClick={() => setProfileOpen(false)}>Changer de profil</Link><Link to='/client?view=mine' onClick={() => setProfileOpen(false)}>Mon espace</Link><Link to='/client?view=settings' aria-label='Paramètres' onClick={() => setProfileOpen(false)}>Paramètres</Link><Link to='/offline' onClick={() => setProfileOpen(false)}>Hors ligne</Link><QuickConnectMenuItem /><button onClick={() => {
                            void signOut(model.api?.basePath, user?.Id);
                        }}>Se déconnecter</button>
                    </div>}
                </nav>
                <ProfileEntrance profile={profileButton} />
                {actionError && <p role='alert' className='client-message'>{actionError}</p>}
                {error && <div className='client-message' role='alert'><p>Impossible de charger les médias.</p><button type='button' className='client-button' onClick={() => (id ? details.item.refetch() : media.refetch())}>Réessayer</button></div>}
                {id && !model.remote && details.item.isPending && <ClientSkeleton layout='detail' label='Chargement de la fiche…' />}
                <BrowseControls model={model} />
                {!id && media.isPending && (view === 'home' || model.discovery) && <ClientSkeleton layout='hero' label='Chargement de la sélection…' />}
                <HeroView model={model} />
                <ContentView model={model} />
                <Spotlight ref={spotlight} glass={preferences.glass} showWatched={preferences.watchedMarkers} image={model.image} play={model.play} />
                <PlaybackStarting item={model.starting} basePath={model.api?.basePath || ''} />
            </FolderPickerProvider>
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
    const { hero, id, item, api, user, location, playItem, busy, play, playQueue, queueBusy, image, updateState } = model;
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
        {id && hero.Type === 'Series' && <QueueAction source={[hero]} playQueue={playQueue} pending={queueBusy} shuffled />}
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

function EpisodesView({ model }: ViewProps) {
    const { id, item, details, setParams, location, api, play, playQueue, queueBusy } = model;
    const [activeEpisode, setActiveEpisode] = useState('');
    if (!id || item?.Type !== 'Series') return null;
    return <section className='client-episodes'><header><h2>Épisodes</h2><div role='group' aria-label='Saison'>{details.seasons.data?.map(s => <button key={s.Id} aria-pressed={details.selected === s.Id} onClick={() => setParams({ id, season: s.Id! }, { state: location.state })}><strong>{s.IndexNumber === 0 ? 'Spéciaux' : `Saison ${s.IndexNumber}`}</strong><small>{s.ChildCount ? `${s.ChildCount} épisodes` : 'Voir les épisodes'}</small></button>)}</div>
        {details.episodes.data?.some(isQueuedVideo) && <QueueAction source={details.episodes.data} playQueue={playQueue}
            pending={queueBusy} label='Lire la saison' />}
    </header>
    {(details.seasons.isPending || (details.episodes.isPending && !!details.selected)) && <ClientSkeleton layout='episodes' count={4} contained label='Chargement des épisodes…' />}
    {details.episodes.isError && <button type='button' className='client-button' onClick={() => details.episodes.refetch()}>Réessayer le chargement des épisodes</button>}
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

/** A thin line under the home hero, as on the mockup: the way into « Ce soir ». */
function TonightInvite({ prepare }: Readonly<{ prepare: (view: string) => void }>) {
    const ready = useCallback(() => prepare('tonight'), [prepare]);
    return <Link className='client-tonight-invite' to='/client?view=tonight' onPointerEnter={ready} onFocus={ready}>
        <span className='client-tonight-invite-copy'><strong>Une idée pour ce soir ?</strong><span>Selon vos envies et votre temps.</span></span>
        <span className='client-tonight-invite-action'>Choisir un film<ClientIcon name='next' /></span>
    </Link>;
}

function ContentView({ model }: ViewProps) {
    const { id, view, details, media, row, api, image } = model;
    if (model.remote) return <ExternalDetail key={id} id={id} row={row} image={image} />;
    if (id) return details.item.data && api ? <DetailExtras item={details.item.data} similar={details.similar.data || []} image={image} /> : null;
    if (view === 'home') {
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
    if (model.folderId) {
        return <FolderPage key={model.folderId} id={model.folderId} image={image} full={model.preferences.hero === 'background'} showWatched={model.preferences.watchedMarkers}
            playQueue={model.playQueue} queueBusy={model.queueBusy} prepare={model.prepareDetail} release={model.releaseDetail} />;
    }
    if (view === 'settings') return <SettingsView model={model} />;
    if (view === 'collections') {
        return <PublicCollections image={image} full={model.preferences.hero === 'background'} showWatched={model.preferences.watchedMarkers}
            playQueue={model.playQueue} queueBusy={model.queueBusy} prepare={model.prepareDetail} release={model.releaseDetail} />;
    }
    if (view === 'recent') return <RecentPage items={media.data?.items || []} row={row} />;
    if (view === 'tonight') return <TonightPage items={media.data?.items || []} loading={media.isPending} image={item => artworkUrl(model.api?.basePath || '', item, 'draw')} onPrepare={model.prepareDetail} onRelease={model.releaseDetail} onFeature={entry => model.setPageAmbient(entry ? image(entry, true) : '')} />;
    if (model.discovery) return <DiscoveryView model={model} />;
    if (view === 'mine') return <PersonalView model={model} />;
    if (model.standaloneSearch) return <SearchView model={model} />;
    return <LibraryView model={model} />;
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

function PersonalView({ model }: ViewProps) {
    const { user, media, row, image, play, playQueue, queueBusy, seerr } = model;
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
    return <div className='client-personal'>
        <header className='client-personal-identity'><span aria-hidden='true'>{user?.PrimaryImageTag ? <img src={`${model.api?.basePath}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}&width=160&quality=90`} alt='' /> : user?.Name?.slice(0, 1)}</span><div><h1>Mon espace</h1>
            <p>{user?.Name}</p></div></header>
        <PersonalStatsBand stats={stats.data} pending={stats.isPending} favorites={media.data?.total || 0} favoritesPending={media.isPending} />
        {home.isPending && <ClientSkeleton layout='episodes' contained count={3} label='Chargement des reprises…' />}
        {lead && <section className='client-personal-spotlight'><Artwork source={image(lead, true, true)} eager /><PreviewClip item={lead} surface='spotlight' /><div><small>ON CONTINUE ?</small><h2>{lead.SeriesName || lead.Name}</h2><p>{lead.Type === 'Episode' ? `${episodeLabel(lead)} · ${lead.Name}` : 'Votre film vous attend'}</p>
            {progressPercent(lead) > 0 && <span className='client-spotlight-progress' aria-label={`Vu à ${Math.round(progressPercent(lead))} %`}><i style={{ width: `${progressPercent(lead)}%` }} /></span>}
            <button className='client-play' onClick={() => play(lead)}><ClientIcon name='play' />Reprendre</button><Link className='client-button' to={`/client?id=${lead.SeriesId || lead.Id}`}>Voir la fiche</Link></div></section>}
        <div id='client-resume'>{row('Continuer à regarder', resume.slice(1), true)}</div>
        {row('Épisodes à venir', upcoming.data, false, 'upcoming-episodes')}
        <div className='client-personal-favorites' id='client-favorites'>
            <header><h2>Ma liste</h2>{!!media.data?.total && <div className='client-queue-actions'>
                <QueueActions source='favorites' playQueue={playQueue} pending={queueBusy} />
            </div>}</header>
            <FolderPanel image={image} />
            <LibraryView model={model} embedded />
        </div>
        {row('Vus récemment', history.data)}
        {!!stats.data?.genres.length && <div className='client-personal-columns'><GenreTaste stats={stats.data} /></div>}
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
            <SearchGroup title='Catalogue partagé' count={results.saved.length}><div className='client-grid'>{cards(results.saved)}</div></SearchGroup>
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
            <LibraryResultCount model={model} embedded={embedded} loaded={local.length} extra={external.length} onlyMissing={withoutFiles} />
        </div>}
        {!embedded && !withoutFiles && isFullLibrary(view, params.get('mode'))
            && <AdvancedLibraryFilters key={view} view={view} filters={advanced} onChange={browse} />}
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
