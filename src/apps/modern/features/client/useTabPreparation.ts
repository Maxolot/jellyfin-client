import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { useApi } from 'hooks/useApi';

import { artworkUrl, preloadArtwork } from './artwork';
import { prepareCatalogue } from './seerr/queries';
import { useSeerr } from './seerr/SeerrContext';
import { browseQuery } from './useClientMedia';

/** The tabs a viewer goes back and forth between; the others are prepared on approach only. */
const MAIN_TABS = ['home', 'series', 'films', 'recent'];
const POSTERS = 12;
const DISCOVERY_TABS = new Set(['home', 'films', 'series']);

type Browse = { items: BaseItemDto[]; movies: BaseItemDto[]; series: BaseItemDto[]; picks: BaseItemDto[] };

const whenIdle = (run: () => void) => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 3000 });
    else window.setTimeout(run, 400);
};

function lightOnData() {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    return connection?.saveData === true || /2g/.test(connection?.effectiveType || '');
}

/** What a tab shows first: its lead picture and its first posters. */
export function firstPictures(basePath: string, data: Browse) {
    const titles = [...data.items, ...data.picks, ...data.movies, ...data.series];
    const lead = titles[0];
    return [...(lead ? [artworkUrl(basePath, lead, 'hero')] : []), ...titles.slice(0, POSTERS).map(title => artworkUrl(basePath, title, 'poster'))].filter(Boolean);
}

/** Fetches other tabs before they are asked for, so that opening one is immediate. Returns the same action for a tab about to be opened. */
export default function useTabPreparation(pageReady: boolean) {
    const { api, user } = useApi();
    const seerr = useSeerr();
    const cache = useQueryClient();
    const prepared = useRef(new Set<string>());
    const account = `${api?.basePath}|${user?.Id}`;
    useEffect(() => {
        prepared.current = new Set();
    }, [account]);
    const prepare = useCallback((view: string) => {
        if (!api || !user?.Id || prepared.current.has(view) || lightOnData() || !['home', 'series', 'films', 'recent', 'tonight', 'mine'].includes(view)) return;
        prepared.current.add(view);
        const query = browseQuery({ api, user }, view, '', 0);
        cache.prefetchQuery(query).then(() => {
            const data = cache.getQueryData<Browse>(query.queryKey);
            // A failed tab can be tried again on the next approach.
            if (!data) {
                prepared.current.delete(view);
                return;
            }
            for (const picture of firstPictures(api.basePath, data)) void preloadArtwork(picture).catch(() => undefined);
        }).catch(() => prepared.current.delete(view));
        if (seerr.connected && DISCOVERY_TABS.has(view)) void prepareCatalogue(cache, seerr, view === 'home' ? 'home' : view).catch(() => undefined);
    }, [api, user, cache, seerr]);
    useEffect(() => {
        if (!pageReady) return;
        let left = false;
        const timer = window.setTimeout(() => whenIdle(() => {
            if (!left) MAIN_TABS.forEach(prepare);
        }), 800);
        return () => {
            left = true;
            window.clearTimeout(timer);
        };
    }, [pageReady, prepare]);
    return prepare;
}
