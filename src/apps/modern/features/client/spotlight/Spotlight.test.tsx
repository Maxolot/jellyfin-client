import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act, useCallback, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { recentSearchesKey, rememberSearch } from './recentSearches';
import Spotlight, { type SpotlightHandle } from './Spotlight';

const dune: BaseItemDto = { Id: 'dune', Name: 'Dune', Type: 'Movie', ProductionYear: 2021 };
const arrival: BaseItemDto = { Id: 'arrival', Name: 'Premier Contact', Type: 'Movie', ProductionYear: 2016 };
const episode: BaseItemDto = { Id: 'ep', Name: 'Pilote', SeriesName: 'Severance', Type: 'Episode', SeriesId: 'sev', IndexNumber: 1, ParentIndexNumber: 1 };
const followed: BaseItemDto = { Id: 'seerr-movie-42', Name: 'Horizons', Type: 'Movie' };
const otherFollowed: BaseItemDto = { Id: 'seerr-tv-43', Name: 'Horizons lointains', Type: 'Series' };
const empty = { loadingLibrary: false, requestLoading: false, best: undefined, own: [], shared: [], requestable: [], people: [], groups: [],
    sharedIds: new Set([followed.Id!, otherFollowed.Id!]), resume: [], forYou: [], recentShared: { entries: [], items: [], byOthers: true }, trending: [], genreShortcuts: [] };

vi.mock('hooks/useApi', () => ({ useApi: () => ({ api: { basePath: 'https://media.example.test', axiosInstance: { get: async () => ({ data: { available: false } }) } }, user: { Id: 'user-a' } }) }));
vi.mock('../seerr/SeerrContext', () => ({ useSeerr: () => ({ connected: false }) }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: { isPlayingVideo: () => false } }));
vi.mock('../Artwork', () => ({ default: ({ source }: { source: string }) => <img alt='' src={source || undefined} /> }));
vi.mock('../useCatalogArtwork', () => ({
    useRepairCatalogArtwork: (identity?: { id: number }) => ({
        data: identity ? { posterPath: `/poster-${identity.id}.jpg`, backdropPath: `/backdrop-${identity.id}.jpg` } : undefined
    })
}));
vi.mock('../session', () => ({ clientRequest: (request: () => Promise<unknown>) => request() }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: {} }));
vi.mock('./useSpotlightData', () => ({
    spotlightIndexQuery: () => ({ queryKey: ['index'], queryFn: () => [] }),
    spotlightResumeQuery: () => ({ queryKey: ['resume'], queryFn: () => [] }),
    useSpotlightData: (_open: boolean, query: string) => (query.trim() ?
        results(query) : {
            ...empty, searching: false, resume: [episode], forYou: [arrival],
            recentShared: { ...empty.recentShared, items: [otherFollowed] }, genreShortcuts: ['Science-fiction']
        })
}));

function results(query: string) {
    if (query === 'horizons') return { ...empty, searching: true, best: followed, shared: [otherFollowed] };
    return { ...empty, searching: true, best: dune, own: [arrival] };
}

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const play = vi.fn();

function Location() {
    return <output data-testid='location'>{useLocation().search}</output>;
}

const noImage = () => '';

function Harness() {
    const handle = useRef<SpotlightHandle>(null);
    const open = useCallback((event: React.MouseEvent<HTMLButtonElement>) => handle.current?.open(event.currentTarget), []);
    return <>
        <button type='button' className='client-search-shortcut' onClick={open}>Rechercher</button>
        <Spotlight ref={handle} glass image={noImage} play={play} />
        <Location />
    </>;
}

let root: Root;
let container: HTMLDivElement;
const dialog = () => document.querySelector<HTMLElement>('.client-spotlight')!;
const field = () => dialog().querySelector<HTMLInputElement>('input')!;
const press = (target: EventTarget, key: string, init: KeyboardEventInit = {}) => act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
});
function type(value: string) {
    act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(field(), value);
        field().dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('Spotlight', () => {
    beforeEach(() => {
        localStorage.clear();
        play.mockReset();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => root.render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/client?view=home']}><Harness /></MemoryRouter></QueryClientProvider>));
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('opens with Ctrl+K, focused, and shows resumes and recent searches before typing', () => {
        rememberSearch(recentSearchesKey('https://media.example.test', 'user-a'), 'Interstellar');
        expect(dialog().hidden).toBe(true);
        press(window, 'k', { ctrlKey: true });
        expect(dialog().hidden).toBe(false);
        expect(document.activeElement).toBe(field());
        expect(dialog().textContent).toContain('Reprendre');
        const resume = dialog().querySelector('[aria-label="Reprendre Severance, S1:E1, Pilote"]');
        expect(resume?.textContent).toBe('S1:E1');
        expect(resume?.querySelector('.client-spotlight-art')?.textContent).toBe('S1:E1');
        expect(dialog().querySelector('[aria-label="Premier Contact, 2016"]')?.textContent).toBe('');
        expect(dialog().textContent).toContain('Interstellar');
        expect(dialog().textContent).toContain('Science-fiction');
    });

    it('recovers artwork for older followed titles in posters, the best result and rows', () => {
        press(window, 'k', { ctrlKey: true });
        const poster = dialog().querySelector('[aria-label="Horizons lointains"]');
        expect(poster?.querySelector('img')?.getAttribute('src')).toContain('/w500/poster-43.jpg');
        expect(poster?.textContent).toBe('À télécharger');

        type('horizons');
        const best = dialog().querySelector('[aria-label="Horizons, meilleur résultat"]');
        expect(best?.querySelector('img')?.getAttribute('src')).toContain('/w1280/backdrop-42.jpg');
        expect(best?.textContent).toContain('Voir la fiche');
        const row = dialog().querySelector('[aria-label="Horizons lointains, Série"]');
        expect(row?.querySelector('img')?.getAttribute('src')).toContain('/w500/poster-43.jpg');
        expect(row?.querySelector('strong')?.textContent).toBe('Horizons lointains');
    });

    it('selects the best result first, moves with the arrows and opens with Enter', () => {
        act(() => document.querySelector<HTMLButtonElement>('.client-search-shortcut')!.click());
        type('dune');
        expect(dialog().textContent).toContain('Meilleur résultat');
        expect(field().getAttribute('aria-activedescendant')).toBe('client-spotlight-best-dune');
        press(field(), 'ArrowDown');
        expect(field().getAttribute('aria-activedescendant')).toBe('client-spotlight-own-arrival');
        press(field(), 'Enter');
        expect(document.querySelector('[data-testid="location"]')!.textContent).toBe('?id=arrival');
        expect(dialog().hidden).toBe(true);
    });

    it('plays the selected title with Ctrl+Enter and remembers the search', () => {
        act(() => document.querySelector<HTMLButtonElement>('.client-search-shortcut')!.click());
        type('dune');
        press(field(), 'Enter', { ctrlKey: true });
        expect(play).toHaveBeenCalledWith(dune);
        expect(localStorage.getItem(recentSearchesKey('https://media.example.test', 'user-a'))).toContain('dune');
    });

    it('closes with Escape and gives the focus back where it was', () => {
        const opener = document.querySelector<HTMLButtonElement>('.client-search-shortcut')!;
        opener.focus();
        act(() => opener.click());
        press(field(), 'Escape');
        expect(dialog().hidden).toBe(true);
        expect(document.activeElement).toBe(opener);
    });

    it('opens with « / » outside a field only', () => {
        press(document.body, '/');
        expect(dialog().hidden).toBe(false);
        press(field(), 'Escape');
        const other = document.createElement('input');
        document.body.appendChild(other);
        press(other, '/');
        expect(dialog().hidden).toBe(true);
        other.remove();
    });
});
