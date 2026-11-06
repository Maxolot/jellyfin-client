/* eslint-disable react/jsx-no-bind -- Local controls for the three-card draw. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { type CSSProperties, type Dispatch, type RefObject, type SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import Artwork from './Artwork';
import ClientSkeleton from './ClientSkeleton';
import ClientIcon from './ClientIcon';
import { preloadArtwork } from './artwork';
import './tonight.scss';

const moods: Record<string, string[]> = { Évasion: ['Adventure', 'Fantasy', 'Science Fiction', 'Aventure', 'Fantastique', 'Science-fiction'], Léger: ['Comedy', 'Family', 'Animation', 'Comédie', 'Familial'], Frissons: ['Thriller', 'Horror', 'Mystery', 'Horreur', 'Mystère'], Émotion: ['Drama', 'Romance', 'Drame'], Surprise: [] };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function tonightCandidates(items: BaseItemDto[], mood: string, minutes: number, prompt: string, excluded: string[], previous: string[], seed: number) {
    const words = normalize(prompt).split(/\W+/).filter(word => word.length > 3);
    let candidates = items.filter(item => item.Type === 'Movie' && !excluded.includes(item.Id || '') && (!minutes || (!!item.RunTimeTicks && item.RunTimeTicks <= minutes * 6e8)));
    if (candidates.filter(item => !previous.includes(item.Id || '')).length >= 3) candidates = candidates.filter(item => !previous.includes(item.Id || ''));
    const score = (item: BaseItemDto) => {
        const text = normalize([item.Name, item.Overview, ...(item.Genres || [])].join(' '));
        const genre = (item.Genres || []).filter(value => (moods[mood] || []).includes(value)).length * 5;
        const phrase = words.filter(word => text.includes(word)).length * 2;
        const hash = [...(item.Id || '')].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 100003, seed * 7993);
        return genre + phrase + (hash % 997) / 997;
    };
    return candidates.slice().sort((a, b) => score(b) - score(a)).slice(0, 3);
}
function usePreparedDraw(selection: BaseItemDto[], seed: number, image: (item: BaseItemDto) => string) {
    const wanted = { items: selection, seed };
    const latest = useRef(wanted);
    latest.current = wanted;
    const sources = selection.map(image);
    const key = `${seed}:${sources.join('|')}`;
    const currentSources = useRef(sources);
    currentSources.current = sources;
    const [draw, setDraw] = useState({ items: [] as BaseItemDto[], seed: 0 });
    useEffect(() => {
        let disposed = false;
        const next = latest.current;
        void Promise.allSettled(currentSources.current.map(preloadArtwork)).then(() => {
            if (!disposed) setDraw(next);
        });
        return () => {
            disposed = true;
        };
    }, [key]);
    return draw;
}

type Criteria = { mood: string; minutes: number; prompt: string };
const initialCriteria: Criteria = { mood: 'Surprise', minutes: 0, prompt: '' };
const durations = [[90, '1 h 30'], [120, '2 h'], [150, '2 h 30'], [0, 'Sans limite']] as const;
type Props = { items: BaseItemDto[]; loading?: boolean; image: (item: BaseItemDto) => string; onPrepare: (item: BaseItemDto) => void; onRelease: () => void; onFeature?: (item?: BaseItemDto) => void };

function DrawFilters({ panel, criteria, draft, setDraft, canReset, onApply, onReset }: Readonly<{
    panel: RefObject<HTMLDetailsElement>; criteria: Criteria; draft: Criteria; setDraft: Dispatch<SetStateAction<Criteria>>;
    canReset: boolean; onApply: (event: React.FormEvent) => void; onReset: () => void;
}>) {
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes the native disclosure from its focusable descendants.
    return <details className='client-draw-refine' ref={panel} onToggle={event => {
        if (event.currentTarget.open) setDraft(criteria);
    }} onKeyDown={event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary')?.focus();
        }
    }}><summary>Affiner <ClientIcon name='down' /></summary>
        <form onSubmit={onApply}><span className='client-draw-filter-label'>Une ambiance</span>
            <div className='client-draw-choices' role='group' aria-label='Ambiance'>{Object.keys(moods).map(name => <button type='button' key={name} aria-pressed={draft.mood === name} onClick={() => setDraft(value => ({ ...value, mood: name }))}>{name}</button>)}</div>
            <span className='client-draw-filter-label'>Durée maximale</span>
            <div className='client-draw-choices' role='group' aria-label='Durée maximale'>{durations.map(([minutes, label]) => <button type='button' key={minutes} aria-pressed={draft.minutes === minutes} onClick={() => setDraft(value => ({ ...value, minutes }))}>{label}</button>)}</div>
            <label className='client-draw-keywords'>Des mots-clés, si vous avez une envie précise<input aria-label='Une envie pour ce soir' maxLength={80} placeholder='Un titre, un thème, un genre…' value={draft.prompt} onChange={event => setDraft(value => ({ ...value, prompt: event.target.value }))} /></label>
            <footer>{canReset && <button type='button' className='client-draw-reset' onClick={onReset}>Réinitialiser</button>}<button className='client-play'>Appliquer</button></footer>
        </form>
    </details>;
}

function DrawPoster({ item, index, count, image, onPrepare, onRelease, onDismiss }: Readonly<Omit<Props, 'items' | 'loading' | 'onFeature'> & { item: BaseItemDto; index: number; count: number; onDismiss: (id: string) => void }>) {
    const location = useLocation();
    return <article className='client-tonight-result client-draw-card' style={{ '--draw-order': index, '--card-angle': `${(index - (count - 1) / 2) * 9}deg`, '--card-lift': `${index === Math.floor(count / 2) ? -16 : 12}px` } as CSSProperties} onAnimationEnd={event => {
        if (event.animationName === 'draw-deal') event.currentTarget.style.animation = 'none';
    }} onPointerEnter={() => onPrepare(item)} onPointerLeave={onRelease} onFocus={() => onPrepare(item)} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) onRelease();
    }}><div className='client-draw-shell'><div className='client-draw-back' aria-hidden='true'><span>C</span></div><div className='client-draw-front'><Link className='client-draw-open' to={`/client?id=${item.Id}`} state={{ returnTo: location.pathname + location.search, returnState: location.state }} aria-label={`Voir ${item.Name}`} onKeyDown={event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const list = event.currentTarget.closest('article')?.parentElement?.querySelectorAll<HTMLElement>('.client-draw-open');
            list?.[Math.max(0, Math.min((list?.length || 1) - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))].focus();
        }}><span className='client-draw-poster'><Artwork source={image(item)} eager /></span></Link>
        <button className='client-draw-dismiss' aria-label={`Ne plus proposer ${item.Name}`} onClick={() => onDismiss(item.Id || '')}><ClientIcon name='close' /></button>
        </div></div></article>;
}

let lastVisit: { seed: number; previous: string[]; at: number } | undefined;
const lastDrawKey = 'client-tonight-last-draw';
function readLastDraw(): string[] {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(lastDrawKey) || '[]');
        return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(0, 12) : [];
    } catch {
        return [];
    }
}
function rememberDraw(ids: string[]) {
    try {
        // The last few draws are skipped on the next visit, so opening the tab does not always deal the same films.
        localStorage.setItem(lastDrawKey, JSON.stringify([...ids, ...readLastDraw().filter(id => !ids.includes(id))].slice(0, 12)));
    } catch {
        // Private browsing: the draw is still random, only less varied across visits.
    }
}

/**
 * The library first arrives from the local cache, then fresh from the server a moment later.
 * A draw already dealt is kept as long as its films are still there, so the cards are not dealt twice.
 */
function useStableSelection(items: BaseItemDto[], criteria: Criteria, excluded: string[], previous: string[], seed: number) {
    const kept = useRef<{ inputs: string; items: BaseItemDto[] }>();
    return useMemo(() => {
        const inputs = JSON.stringify([criteria, excluded, previous, seed]);
        const ids = new Set(items.map(item => item.Id));
        if (kept.current?.inputs === inputs && kept.current.items.length === 3 && kept.current.items.every(item => ids.has(item.Id))) return kept.current.items;
        const next = tonightCandidates(items, criteria.mood, criteria.minutes, criteria.prompt, excluded, previous, seed);
        kept.current = { inputs, items: next };
        return next;
    }, [items, criteria, excluded, previous, seed]);
}

export default function TonightPage({ items, loading = false, image, onPrepare, onRelease, onFeature }: Readonly<Props>) {
    const [criteria, setCriteria] = useState(initialCriteria);
    const [draft, setDraft] = useState(initialCriteria);
    const [excluded, setExcluded] = useState<string[]>([]);
    // Mounted again within a few seconds (data arriving, layout switch): the same draw is resumed, never a second one.
    const resumed = useState(() => (lastVisit && Date.now() - lastVisit.at < 5000 ? lastVisit : undefined))[0];
    const [previous, setPrevious] = useState<string[]>(() => resumed?.previous || readLastDraw());
    // eslint-disable-next-line sonarjs/pseudo-random -- Only varies which films are suggested first, nothing secret.
    const [seed, setSeed] = useState(() => resumed?.seed || 1 + Math.floor(Math.random() * 1e6));
    useEffect(() => () => {
        lastVisit = { seed: seedRef.current, previous: previousRef.current, at: Date.now() };
    }, []);
    const seedRef = useRef(seed);
    seedRef.current = seed;
    const previousRef = useRef(previous);
    previousRef.current = previous;
    const panel = useRef<HTMLDetailsElement>(null);
    const selection = useStableSelection(items, criteria, excluded, previous, seed);
    const shown = selection.map(item => item.Id || '').join('|');
    useEffect(() => {
        if (shown) rememberDraw(shown.split('|'));
    }, [shown]);
    const draw = usePreparedDraw(selection, seed, image);
    const pending = loading || draw.seed !== seed;
    // The film dealt in the middle gives the page its blurred background.
    const featured = draw.items[Math.floor(draw.items.length / 2)];
    const feature = useRef(onFeature);
    feature.current = onFeature;
    useEffect(() => feature.current?.(featured), [featured]);
    const refined = criteria.mood !== 'Surprise' || criteria.minutes !== 0 || !!criteria.prompt;
    const description = refined ? [criteria.mood === 'Surprise' ? '' : criteria.mood, criteria.minutes ? `Jusqu’à ${criteria.minutes} min` : '', criteria.prompt].filter(Boolean).join(' · ') : 'Trois films de votre bibliothèque.';
    function reroll() {
        setPrevious(selection.map(item => item.Id || ''));
        setSeed(value => value + 1);
    }
    function reset() {
        setCriteria(initialCriteria);
        setDraft(initialCriteria);
        setExcluded([]);
        setPrevious([]);
        setSeed(value => value + 1);
        if (panel.current) panel.current.open = false;
    }
    const emptyDraw = pending ? <ClientSkeleton layout='draw' count={3} contained label='Préparation des affiches…' /> : <div className='client-draw-empty'><p role='status'>Aucun film pour ces critères.</p>{(refined || !!excluded.length) && <button className='client-button' onClick={reset}>Élargir le choix</button>}</div>;
    return <section className='client-tonight-table'><header className='client-tonight-table-head'><div><h1>Ce soir</h1><p title={description}>{description}</p></div>
        <div className='client-tonight-actions'><button className='client-draw-reroll' disabled={pending || !draw.items.length} onClick={reroll}><ClientIcon name='refresh' />{pending ? 'Préparation…' : 'Autres idées'}</button>
            <DrawFilters panel={panel} criteria={criteria} draft={draft} setDraft={setDraft} canReset={refined || !!excluded.length} onReset={reset} onApply={event => {
                event.preventDefault();
                setCriteria(draft);
                reroll();
                if (panel.current) panel.current.open = false;
            }} />
        </div></header>
    <div className='client-draw-stage' aria-live='polite' aria-busy={pending}>{draw.items.length ? <div className='client-draw-fan'>{draw.items.map((item, index) => <DrawPoster key={`${draw.seed}-${item.Id}`} item={item} index={index} count={draw.items.length} image={image} onPrepare={onPrepare} onRelease={onRelease} onDismiss={id => {
        setExcluded(values => [...values, id]);
        setSeed(value => value + 1);
    }} />)}</div> : emptyDraw}</div>
    </section>;
}
/* eslint-enable react/jsx-no-bind */
