import type { Api } from '@jellyfin/sdk';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getPersonApi } from '@jellyfin/sdk/lib/utils/api/person-api';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { useApi } from 'hooks/useApi';

import { uniqueItems } from '../model';
import { clientRequest } from '../session';
import { sharedCatalogItems, useSharedCatalog } from '../sharedCatalog';
import { useLocalIdentities, useSeerrCatalogue } from '../seerr/queries';
import { useSeerr } from '../seerr/SeerrContext';
import { externalIdentity, isExternal } from '../seerr/model';
import { useClientCollections, useClientFilters } from '../useClientMedia';
import { rankItems, rankNames, titleScore, parseQuery, matchesFilter, type SearchFilter } from './searchIndex';
import { othersRecent, type SharedEntry } from './sharedRecent';

type Connection = { api?: Api; user?: { Id?: string | null } };

/** Every film and series, small enough to search on the device while typing. */
export function spotlightIndexQuery({ api, user }: Connection) {
    return {
        queryKey: ['Client', api?.basePath, user?.Id, 'SpotlightIndex'],
        staleTime: 300000,
        queryFn: ({ signal }: { signal: AbortSignal }) => clientRequest(async () => {
            const items: BaseItemDto[] = [];
            let total = 1;
            while (items.length < total) {
                const result = await getLibraryApi(api!).getItems({ userId: user!.Id!, recursive: true,
                    includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series], enableUserData: true, imageTypeLimit: 1,
                    fields: [ItemFields.OriginalTitle, ItemFields.SortName, ItemFields.ProviderIds, ItemFields.Genres, ItemFields.DateCreated],
                    limit: 300, startIndex: items.length }, { signal });
                const batch = result.data.Items || [];
                total = result.data.TotalRecordCount || 0;
                items.push(...batch);
                if (!batch.length) break;
            }
            return items;
        })
    };
}

export function spotlightResumeQuery({ api, user }: Connection) {
    return {
        queryKey: ['Client', api?.basePath, user?.Id, 'SpotlightResume'],
        staleTime: 30000,
        queryFn: ({ signal }: { signal: AbortSignal }) => clientRequest(async () => uniqueItems((await getLibraryApi(api!).getResumeItems({
            userId: user!.Id!, limit: 6, includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Episode], enableUserData: true,
            fields: [ItemFields.ProviderIds] }, { signal })).data.Items || []).filter((entry, index, all) =>
            !entry.SeriesId || all.findIndex(other => other.SeriesId === entry.SeriesId) === index).slice(0, 3))
    };
}

/** Waits for a pause in typing before asking the servers, while local results follow every key. */
export function useDebounced<T>(value: T, delay: number) {
    const [settled, setSettled] = useState(value);
    useEffect(() => {
        const timer = window.setTimeout(() => setSettled(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);
    return settled;
}

/** Shuffles once per opening, so that « Pour toi » changes each time without moving while it is shown. */
function seededPick(items: BaseItemDto[], seed: number, count: number) {
    const hash = (id: string) => [...id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 1000003, seed * 7919 + 17);
    return items.slice().sort((a, b) => hash(a.Id || '') - hash(b.Id || '')).slice(0, count);
}

type Catalogue = ReturnType<typeof useSeerrCatalogue>;
type Shared = { entries: SharedEntry[]; local: BaseItemDto[] };

/** Titles of the shared catalogue that match, still to be downloaded. */
function sharedMatches(query: string, filter: SearchFilter, { entries, local }: Shared) {
    if (filter === 'available') return [];
    return sharedCatalogItems(rankNames(entries, entry => entry.title, query, 8), local)
        .filter(item => isExternal(item) && matchesFilter(item, filter));
}

/** Titles to request, once typing has settled, without those already followed in the catalogue. */
function requestableMatches(remote: Catalogue, filter: SearchFilter, entries: SharedEntry[]) {
    const followed = new Set(entries.map(entry => `${entry.type}:${entry.id}`));
    return remote.items.filter(item => {
        const identity = externalIdentity(item);
        return isExternal(item) && matchesFilter(item, filter) && !(identity && followed.has(`${identity.type}:${identity.id}`));
    }).slice(0, 8);
}

/** The best answer: a title of the library unless something else clearly matches better. */
function bestMatch(own: { item: BaseItemDto; score: number }[], shared: BaseItemDto[], requestable: BaseItemDto[], query: string) {
    const parsed = parseQuery(query);
    const candidates: { item: BaseItemDto; score: number }[] = [];
    if (own[0]) candidates.push({ item: own[0].item, score: own[0].score + 5 });
    if (shared[0]) candidates.push({ item: shared[0], score: titleScore(shared[0].Name, parsed) });
    if (requestable[0]) candidates.push({ item: requestable[0], score: titleScore(requestable[0].Name, parsed) - 3 });
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.item;
}

type Named = { Id?: string | null; Name?: string | null };

function namedGroups(query: string, collections: Named[], genres: Named[]) {
    return [
        ...rankNames(collections, entry => entry.Name, query, 4).map(entry => ({ kind: 'collection' as const, id: entry.Id || '', name: entry.Name || '' })),
        ...rankNames(genres, entry => entry.Name, query, 3).map(entry => ({ kind: 'genre' as const, id: entry.Name || '', name: entry.Name || '' }))
    ].slice(0, 6);
}

function useSources(open: boolean, query: string, filter: SearchFilter) {
    const { api, user } = useApi();
    const server = useDebounced(query.trim(), 220);
    const searching = !!query.trim();
    const ready = open && !!api && !!user?.Id;
    const index = useQuery({ ...spotlightIndexQuery({ api, user }), enabled: ready });
    const resume = useQuery({ ...spotlightResumeQuery({ api, user }), enabled: ready && !searching });
    const people = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'SpotlightPeople', server],
        enabled: ready && server.length >= 3 && filter === 'all',
        staleTime: 60000,
        queryFn: ({ signal }) => clientRequest(async () => (await getPersonApi(api!).getPersons({
            searchTerm: server, limit: 8, userId: user!.Id!, enableImages: true, imageTypeLimit: 1 }, { signal })).data.Items || [])
    });
    const collections = useClientCollections(open);
    const genres = useClientFilters(open ? 'home' : 'disabled');
    const shared = useSharedCatalog();
    const entries = useMemo(() => shared.data || [], [shared.data]);
    const local = useLocalIdentities(open && entries.length > 0);
    const remote = useSeerrCatalogue('search', server, open && server.length >= 2 && filter !== 'available');
    const trending = useSeerrCatalogue('home', '', open && !searching && filter !== 'available');
    return { user, server, searching, index, resume, people, collections, genres, entries, local: local.data || [], remote, trending };
}

export type SpotlightResults = ReturnType<typeof useSpotlightData>;

export function useSpotlightData(open: boolean, query: string, filter: SearchFilter, seed: number) {
    const seerr = useSeerr();
    const sources = useSources(open, query, filter);
    const { searching, server, entries, local, remote } = sources;
    const sharedIds = useMemo(() => new Set(entries.map(entry => `seerr-${entry.type}-${entry.id}`)), [entries]);
    const library = sources.index.data || [];
    const settled = server === query.trim();
    const all = searching && filter === 'all';

    const typeFilter = filter === 'available' ? 'all' : filter;
    const own = searching ? rankItems(library, query, typeFilter, 12) : [];
    const shared = searching ? sharedMatches(query, filter, { entries, local }) : [];
    const requestable = searching && settled ? requestableMatches(remote, filter, entries) : [];
    const best = bestMatch(own, shared, requestable, query);
    const without = (items: BaseItemDto[]) => items.filter(item => item.Id !== best?.Id);

    const recentShared = othersRecent(entries, sources.user?.Id);
    const resume = sources.resume.data || [];
    const unseen = library.filter(item => !item.UserData?.Played && !item.UserData?.PlaybackPositionTicks && matchesFilter(item, filter)
        && !resume.some(entry => (entry.SeriesId || entry.Id) === item.Id));
    return {
        loadingLibrary: open && sources.index.isPending,
        searching,
        best,
        own: without(own.map(entry => entry.item)).slice(0, 6),
        shared: without(shared).slice(0, 4),
        sharedIds,
        requestable: without(requestable).slice(0, 6),
        requestLoading: searching && seerr.connected && filter !== 'available' && (!settled || remote.loading),
        people: all ? rankNames(sources.people.data || [], entry => entry.Name, server, 5) : [],
        groups: all ? namedGroups(query, sources.collections.data || [], sources.genres.data?.Genres || []) : [],
        resume,
        forYou: seededPick(unseen, seed, 6),
        recentShared: { ...recentShared, items: sharedCatalogItems(recentShared.entries, local).filter(item => matchesFilter(item, filter)) },
        trending: seerr.connected ? sources.trending.items.filter(item => isExternal(item) && matchesFilter(item, filter)).slice(0, 8) : [],
        genreShortcuts: (sources.genres.data?.Genres || []).slice(0, 10).map(entry => entry.Name || '').filter(Boolean)
    };
}
