/* eslint-disable react/jsx-no-bind -- Local controls for the three-card draw. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import Artwork from './Artwork';
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

export default function TonightPage({ items, image, onPrepare, onRelease }: Readonly<{ items: BaseItemDto[]; image: (item: BaseItemDto) => string; onPrepare: (item: BaseItemDto) => void; onRelease: () => void }>) {
    const [mood, setMood] = useState('Évasion');
    const [minutes, setMinutes] = useState(150);
    const [prompt, setPrompt] = useState('');
    const [applied, setApplied] = useState('');
    const [excluded, setExcluded] = useState<string[]>([]);
    const [previous, setPrevious] = useState<string[]>([]);
    const [seed, setSeed] = useState(1);
    const location = useLocation();
    const selection = useMemo(() => tonightCandidates(items, mood, minutes, applied, excluded, previous, seed), [items, mood, minutes, applied, excluded, previous, seed]);
    const draw = usePreparedDraw(selection, seed, image);
    return <section className='client-tonight-table'><header className='client-tonight-table-head'><h1>Ce soir.</h1><form className='client-draw-form' onSubmit={event => {
        event.preventDefault();
        setApplied(prompt);
        setPrevious(selection.map(item => item.Id || ''));
        setSeed(value => value + 1);
    }}><div className='client-draw-prompt'><input aria-label='Une envie pour ce soir' placeholder='Une envie particulière ?' value={prompt} onChange={event => setPrompt(event.target.value)} /></div><div className='client-draw-controls'><select aria-label='Ambiance' value={mood} onChange={event => {
            setMood(event.target.value);
            setPrevious([]);
        }}>{Object.keys(moods).map(name => <option key={name}>{name}</option>)}</select><select aria-label='Temps disponible' value={minutes} onChange={event => {
            setMinutes(Number(event.target.value));
            setPrevious([]);
        }}>{[[90, '1 h 30'], [120, '2 h'], [150, '2 h 30'], [0, 'Sans limite']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className='client-play'>Tirer trois cartes</button></div></form></header>
    <div className='client-draw-stage' aria-live='polite'>{draw.items.length ? <><div className='client-draw-orbit' aria-hidden='true' /><div className='client-draw-fan'>{draw.items.map((item, index) => <article key={`${draw.seed}-${item.Id}`} className='client-tonight-result client-draw-card' style={{ '--card-angle': `${[-9, 0, 9][index]}deg`, '--card-lift': `${index === 1 ? -20 : 16}px`, '--deal-delay': `${index * 140}ms`, '--card-color': '150 160 180' } as CSSProperties} onAnimationEnd={event => {
        if (event.animationName === 'draw-deal') event.currentTarget.style.animation = 'none';
    }} onPointerEnter={() => onPrepare(item)} onPointerLeave={onRelease} onFocus={() => onPrepare(item)} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) onRelease();
    }}><div className='client-draw-shell'><div className='client-draw-back' aria-hidden='true'><span>C</span></div><div className='client-draw-front'><Link onKeyDown={event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const list = event.currentTarget.closest('article')?.parentElement?.querySelectorAll<HTMLElement>('.client-draw-open');
            list?.[Math.max(0, Math.min(draw.items.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))].focus();
        }} className='client-draw-open' to={`/client?id=${item.Id}`} state={{ returnTo: location.pathname + location.search }} aria-label={`Voir ${item.Name}`}><Artwork source={image(item)} eager /><span className='client-draw-reflection' /></Link><span className='client-draw-duration'>{Math.round((item.RunTimeTicks || 0) / 6e8)} min</span><span className='client-draw-available'><ClientIcon name='check' /> Disponible</span><button className='client-draw-dismiss' aria-label={`Ne plus proposer ${item.Name}`} onClick={() => {
            setExcluded(values => [...values, item.Id || '']);
            setSeed(value => value + 1);
        }}>×</button></div></div></article>)}</div></> : <div className='client-draw-empty'><p>{selection.length ? 'Préparation du tirage…' : 'Aucun film pour ce créneau.'}</p><button className='client-button' onClick={() => {
        setMinutes(0);
        setExcluded([]);
        setPrevious([]);
    }}>Élargir le tirage</button></div>}</div>
    </section>;
}
/* eslint-enable react/jsx-no-bind */
