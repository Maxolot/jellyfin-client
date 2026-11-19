/* eslint-disable react/jsx-no-bind -- Option handlers are rebuilt with the results they act on. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api';
import { getUserDataApi } from '@jellyfin/sdk/lib/utils/api/user-data-api';
import useClientMediaQuery from '../useClientMediaQuery';
import { useQueryClient } from '@tanstack/react-query';
import React, { forwardRef, type KeyboardEvent, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { playbackManager } from 'components/playback/playbackmanager';
import { useApi } from 'hooks/useApi';

import ClientIcon from '../ClientIcon';
import { clientRequest } from '../session';
import { isExternal } from '../seerr/model';
import { useSeerr } from '../seerr/SeerrContext';
import { moveActive, type Move } from './navigation';
import { chip, openingGroups, searchGroups, type Actions, type Group } from './options';
import { clearSearches, forgetSearch, readRecentSearches, recentSearchesKey, rememberSearch } from './recentSearches';
import type { SearchFilter } from './searchIndex';
import { spotlightIndexQuery, spotlightResumeQuery, useSpotlightData } from './useSpotlightData';
import './spotlight.scss';

export type SpotlightHandle = { open: (origin?: Element | null) => void };

type Props = Readonly<{
    image: (item: BaseItemDto, backdrop?: boolean) => string;
    play: (item: BaseItemDto) => unknown;
    glass: boolean;
    showWatched?: boolean;
}>;

const filters: [SearchFilter, string][] = [['all', 'Tout'], ['films', 'Films'], ['series', 'Séries'], ['available', 'Disponibles']];
const optionId = (key: string) => `client-spotlight-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';
const keyMoves: Record<string, Move> = { ArrowDown: 'down', ArrowUp: 'up', ArrowRight: 'right', ArrowLeft: 'left' };

/** Typing in a field, an open dialog or a playing video keep their own keys. */
function busyTarget(target: EventTarget | null) {
    if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return true;
    return !!document.querySelector('dialog[open], [aria-modal="true"]:not(.client-spotlight)') || !!playbackManager.isPlayingVideo?.();
}

/** The bar comes out of the magnifier and lands in the middle of the screen. */
function animateOpening(element: HTMLElement, from: DOMRect | null, reducedMotion: boolean) {
    if (typeof element.animate !== 'function') return;
    const target = element.getBoundingClientRect();
    if (reducedMotion || !from || !target.width) {
        element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
        return;
    }
    const dx = from.left + from.width / 2 - (target.left + target.width / 2);
    const dy = from.top + from.height / 2 - (target.top + 28);
    const scale = Math.max(0.05, from.width / target.width);
    element.animate([
        { opacity: 0.2, transform: `translate(${dx}px, ${dy}px) scale(${scale})`, borderRadius: '999px' },
        { opacity: 1, transform: 'none', borderRadius: getComputedStyle(element).borderRadius }
    ], { duration: 360, easing: 'cubic-bezier(.2, .9, .24, 1)' });
}

function useOpening(reset: () => void, prepare: () => void) {
    const reducedMotion = useClientMediaQuery('(prefers-reduced-motion: reduce)');
    const [open, setOpen] = useState(false);
    const [seed, setSeed] = useState(() => Date.now() % 100000);
    const input = useRef<HTMLInputElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const opener = useRef<HTMLElement | null>(null);
    const origin = useRef<DOMRect | null>(null);
    const closing = useRef(false);

    const show = useCallback((from?: Element | null) => {
        if (closing.current) return;
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        origin.current = from?.getBoundingClientRect() || null;
        // Rendered at once and focused within the click itself, so that phones bring up their keyboard.
        flushSync(() => {
            prepare();
            setSeed(value => value + 1);
            setOpen(true);
        });
        input.current?.focus({ preventScroll: true });
    }, [prepare]);

    const close = useCallback((restore = true) => {
        if (closing.current) return;
        const element = panel.current;
        const backdrop = element?.previousElementSibling;
        let fades: Animation[] = [];
        const finish = () => {
            // Hidden in the same frame as the fade ends, then the faded state is released:
            // the bar never shows again at full opacity on its way out.
            flushSync(() => {
                setOpen(false);
                reset();
            });
            for (const fade of fades) fade.cancel();
            closing.current = false;
            if (restore) opener.current?.focus({ preventScroll: true });
        };
        if (!element || typeof element.animate !== 'function' || reducedMotion) {
            finish();
            return;
        }
        closing.current = true;
        const timing: KeyframeAnimationOptions = { duration: 160, easing: 'ease-in', fill: 'forwards' };
        fades = [element.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px) scale(0.97)' }], timing)];
        // The blurred background fades with the bar instead of vanishing at the end.
        if (backdrop instanceof HTMLElement) fades.push(backdrop.animate([{ opacity: 1 }, { opacity: 0 }], timing));
        Promise.all(fades.map(fade => fade.finished)).then(finish, finish);
    }, [reducedMotion, reset]);

    useLayoutEffect(() => {
        if (open && panel.current) animateOpening(panel.current, origin.current, reducedMotion);
    }, [open, reducedMotion]);

    useEffect(() => {
        document.body.classList.toggle('client-spotlight-open', open);
        return () => document.body.classList.remove('client-spotlight-open');
    }, [open]);

    // ⌘K / Ctrl+K anywhere, « / » outside a field, Échap to leave, as on a Mac.
    useEffect(() => {
        const keys = (event: globalThis.KeyboardEvent) => {
            if (document.querySelector('dialog[open]')) return;
            const mod = event.metaKey || event.ctrlKey;
            const toggle = mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k';
            const slash = event.key === '/' && !mod && !event.altKey && !busyTarget(event.target);
            if (open && (toggle || event.key === 'Escape')) {
                event.preventDefault();
                close();
            } else if (!open && ((toggle && !playbackManager.isPlayingVideo?.()) || slash)) {
                event.preventDefault();
                show(document.querySelector('.client-search-shortcut'));
            }
        };
        window.addEventListener('keydown', keys);
        return () => window.removeEventListener('keydown', keys);
    }, [open, show, close]);

    return { open, seed, show, close, input, panel };
}

/** Prepared while the app is idle: opening then shows everything at once. */
function usePreparation() {
    const { api, user } = useApi();
    const cache = useQueryClient();
    useEffect(() => {
        if (!api || !user?.Id) return;
        const prepare = () => {
            void cache.prefetchQuery(spotlightIndexQuery({ api, user }));
            void cache.prefetchQuery(spotlightResumeQuery({ api, user }));
        };
        const host = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
        if (host.requestIdleCallback) {
            const id = host.requestIdleCallback(prepare, { timeout: 4000 });
            return () => host.cancelIdleCallback?.(id);
        }
        const timer = window.setTimeout(prepare, 2500);
        return () => window.clearTimeout(timer);
    }, [api, user, cache]);
}

type Connection = NonNullable<ReturnType<typeof useApi>['api']>;

async function nextEpisode(api: Connection, userId: string, seriesId: string) {
    const shows = getShowApi(api);
    const next = (await clientRequest(() => shows.getNextUp({ userId, seriesId, limit: 1, enableResumable: true }))).data.Items?.[0];
    return next || (await clientRequest(() => shows.getEpisodes({ seriesId, userId, limit: 1 }))).data.Items?.[0];
}

function useActions(close: (restore?: boolean) => void, remember: () => void, play: Props['play']) {
    const { api, user } = useApi();
    const cache = useQueryClient();
    const navigate = useNavigate();
    const location = useLocation();
    const [favorites, setFavorites] = useState<Record<string, boolean>>({});
    const go = (path: string) => {
        remember();
        close(false);
        navigate(path, { state: { returnTo: location.pathname + location.search, returnState: location.state } });
    };
    const openItem = (item: BaseItemDto) => go(`/client?id=${item.Id}`);
    async function start(item: BaseItemDto) {
        remember();
        close(false);
        let target: BaseItemDto | undefined = item;
        if (item.Type === 'Series' && api && user?.Id) target = await nextEpisode(api, user.Id, item.Id || '').catch(() => undefined);
        if (target) await play(target);
        else navigate(`/client?id=${item.Id}`);
    }
    async function toggle(item: BaseItemDto) {
        if (!api || !user?.Id || !item.Id) return;
        const id = item.Id;
        const now = !(favorites[id] ?? item.UserData?.IsFavorite);
        setFavorites(state => ({ ...state, [id]: now }));
        try {
            const userData = getUserDataApi(api);
            const target = { userId: user.Id, itemId: id };
            await clientRequest(() => (now ? userData.markFavoriteItem(target) : userData.unmarkFavoriteItem(target)));
            void cache.invalidateQueries({ queryKey: ['Client', api.basePath, user.Id] });
        } catch {
            setFavorites(state => ({ ...state, [id]: !now }));
        }
    }
    return {
        go,
        openItem,
        playItem: (item: BaseItemDto) => {
            if (isExternal(item)) openItem(item);
            else void start(item);
        },
        isFavorite: (item: BaseItemDto) => !!(favorites[item.Id || ''] ?? item.UserData?.IsFavorite),
        toggleFavorite: (item: BaseItemDto) => {
            void toggle(item);
        }
    };
}

function Groups({ groups, active, setActive, onForget }: Readonly<{
    groups: Group[]; active: number; setActive: (index: number) => void; onForget: (label: string) => void;
}>) {
    let start = 0;
    return <>{groups.map(group => {
        const first = start;
        start += group.options.length;
        return <section key={group.id} className={`client-spotlight-group client-spotlight-${group.layout}`} role='group'
            aria-labelledby={group.title ? `client-spotlight-title-${group.id}` : undefined} aria-label={group.title ? undefined : 'Autres résultats'}>
            {group.title && <header><h2 id={`client-spotlight-title-${group.id}`}>{group.title}</h2>
                {group.status && <span className='client-spotlight-status'>{group.status}</span>}{group.extra}</header>}
            <div className='client-spotlight-options'>{group.options.map((option, index) => {
                const selected = first + index === active;
                const run = (play: boolean) => option.run(play && !!option.playable);
                return <div key={option.key} id={optionId(option.key)} role='option' tabIndex={-1} aria-selected={selected} aria-label={option.label}
                    className={`client-spotlight-option${selected ? ' active' : ''}`}
                    onPointerMove={() => {
                        if (!selected) setActive(first + index);
                    }}
                    onClick={event => run(event.metaKey || event.ctrlKey)}
                    onKeyDown={event => {
                        if (event.target === event.currentTarget && event.key === 'Enter') run(event.metaKey || event.ctrlKey);
                    }}>
                    {option.view()}
                    {group.id === 'recent' && <button type='button' className='client-spotlight-forget' aria-label={`Oublier ${option.label}`} onClick={event => {
                        event.stopPropagation();
                        onForget(option.label);
                    }}><ClientIcon name='close' /></button>}
                </div>;
            })}</div>
        </section>;
    })}</>;
}

function emptyMessage(searching: boolean, query: string, count: number, waiting: boolean, anyOption: boolean) {
    if (searching) return !count && !waiting ? `Aucun titre ne correspond à « ${query.trim()} ». Vérifie l’orthographe ou essaie le titre original.` : '';
    return anyOption ? '' : 'Tape le nom d’un film, d’une série ou d’une personne.';
}

function keyMove(event: KeyboardEvent) {
    if (event.altKey) return undefined;
    if (event.key === 'Tab') return event.shiftKey ? 'previous' : 'next';
    return keyMoves[event.key];
}

const Spotlight = forwardRef<SpotlightHandle, Props>(function ClientSpotlight({ image, play, glass, showWatched = true }, handle) {
    const { api, user } = useApi();
    const seerr = useSeerr();
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<SearchFilter>('all');
    const [active, setActive] = useState(-1);
    const recentKey = recentSearchesKey(api?.basePath, user?.Id);
    const [recent, setRecent] = useState<string[]>([]);
    const reset = useCallback(() => {
        setQuery('');
        setActive(-1);
    }, []);
    // Whatever opens the bar (magnifier, ⌘K, « / »), the recent searches are read again.
    const loadRecent = useCallback(() => setRecent(readRecentSearches(recentKey)), [recentKey]);
    const { open, seed, show, close, input, panel } = useOpening(reset, loadRecent);
    useImperativeHandle(handle, () => ({ open: show }), [show]);
    usePreparation();
    const data = useSpotlightData(open, query, filter, seed);
    const actionsBase = useActions(close, () => {
        if (query.trim()) setRecent(rememberSearch(recentKey, query));
    }, play);
    useEffect(() => setActive(query.trim() ? 0 : -1), [query, filter]);

    const actions: Actions = { ...actionsBase, image, showWatched, basePath: api?.basePath || '', shared: data.sharedIds };
    const focusField = () => input.current?.focus({ preventScroll: true });
    const groups = data.searching ? searchGroups(data, query, actions) : openingGroups(data, actions, {
        recent: recent.map(entry => chip(`recent-${entry}`, entry, () => {
            setQuery(entry);
            focusField();
        }, 'clock')),
        clearRecent: recent.length ? <button type='button' className='client-spotlight-clear-all' onClick={() => setRecent(clearSearches(recentKey))}>Tout effacer</button> : undefined,
        trending: seerr.connected
    });
    const shown = groups.filter(group => group.options.length || group.status);
    const flat = shown.flatMap(group => group.options);
    const current = active >= 0 ? flat[active] : undefined;

    useEffect(() => {
        if (current) document.getElementById(optionId(current.key))?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }, [current]);

    function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        const folderAction = current && event.key === 'Tab' && !event.shiftKey
            && document.getElementById(optionId(current.key))?.querySelector<HTMLButtonElement>('button[data-folder-action]');
        if (folderAction) {
            event.preventDefault();
            folderAction.focus();
            return;
        }
        const move = keyMove(event);
        if (move) {
            const next = moveActive(shown.map(group => ({ layout: group.layout, size: group.options.length })), active, move, !!query);
            if (next !== null) {
                event.preventDefault();
                setActive(next);
            }
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const target = current || (query.trim() ? flat[0] : undefined);
            target?.run((event.metaKey || event.ctrlKey) && !!target.playable);
        }
    }

    const count = data.own.length + data.shared.length + data.requestable.length + data.people.length + (data.best ? 1 : 0);
    const message = emptyMessage(data.searching, query, count, data.loadingLibrary || data.requestLoading, flat.length > 0);
    const plural = count > 1 ? 's' : '';
    const status = data.searching ? `${count} résultat${plural}` : '';
    return createPortal(<div className={`client-spotlight ${glass ? 'client-spotlight-glass' : 'client-spotlight-classic'}`} role='dialog' aria-modal='true' aria-label='Recherche' hidden={!open}>
        <div className='client-spotlight-backdrop' onClick={() => close()} aria-hidden='true' />
        <div ref={panel} className='client-spotlight-panel'>
            <div className='client-spotlight-field'>
                <ClientIcon name='search' />
                <input ref={input} type='search' role='combobox' aria-expanded={open} aria-controls='client-spotlight-results' aria-autocomplete='list'
                    aria-activedescendant={current ? optionId(current.key) : undefined} aria-label='Rechercher un film, une série ou une personne'
                    placeholder='Film, série, acteur, saga…' autoComplete='off' autoCorrect='off' spellCheck={false} enterKeyHint='search'
                    value={query} onChange={event => setQuery(event.target.value)} onKeyDown={onKeyDown} />
                {query && <button type='button' className='client-spotlight-clear' aria-label='Effacer' onClick={() => {
                    setQuery('');
                    focusField();
                }}><ClientIcon name='close' /></button>}
                <button type='button' className='client-spotlight-close' onClick={() => close()}><kbd>Échap</kbd><span>Fermer</span></button>
            </div>
            <div className='client-spotlight-filters' role='group' aria-label='Filtrer les résultats'>
                {filters.map(([key, label]) => <button key={key} type='button' aria-pressed={filter === key} onClick={() => {
                    setFilter(key);
                    focusField();
                }}>{label}</button>)}
            </div>
            <div className='client-spotlight-body' id='client-spotlight-results' role='listbox' aria-label='Résultats'>
                <Groups groups={shown} active={active} setActive={setActive} onForget={label => setRecent(forgetSearch(recentKey, label))} />
                {message && <p className='client-spotlight-empty'>{message}</p>}
            </div>
            <footer className='client-spotlight-hints' aria-hidden='true'>
                <span><kbd>↑</kbd><kbd>↓</kbd>Naviguer</span><span><kbd>Entrée</kbd>Ouvrir</span><span><kbd>{modKey}</kbd><kbd>Entrée</kbd>Lire</span>
                <span><kbd>Tab</kbd>Groupe suivant</span><span><kbd>Échap</kbd>Fermer</span>
            </footer>
            <p className='client-spotlight-sr' role='status' aria-live='polite'>{status}</p>
        </div>
    </div>, document.body);
});

export default Spotlight;
/* eslint-enable react/jsx-no-bind */
