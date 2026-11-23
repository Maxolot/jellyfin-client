/* eslint-disable react/jsx-no-bind -- Each action belongs to the selected card or current criteria. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useQuery } from '@tanstack/react-query';
import React, { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import Artwork from './Artwork';
import ClientDialog from './ClientDialog';
import ClientIcon from './ClientIcon';
import ClientSkeleton from './ClientSkeleton';
import { useFollowedMemberships } from './collections/followed';
import { followedMember } from './folders/model';
import PreviewClip from './PreviewClip';
import { catalogueItem, canRequest, externalIdentity, isExternal, providerKey, type ExternalMedia, type Results } from './seerr/model';
import { useSeerr } from './seerr/SeerrContext';
import { isRecommendable } from './seerr/queries';
import { RequestPanel } from './seerr/SeerrViews';
import { sharedCatalogItems, useSharedCatalog } from './sharedCatalog';
import SharedCatalogArtwork from './SharedCatalogArtwork';
import { descriptionItem, useDescriptionSearch } from './spotlight/descriptionSearch';
import { clockLabel, deadlineTargets, identity, readTonight, suggestTonight, tasteFrom, tonightStateKey, writeTonight,
    type TonightCriteria, type TonightIdea, type TonightTitle } from './tonight/model';
import { useTonightAction, useTonightLibrary, useTonightOptions, useTonightTogether } from './tonight/queries';
import TrailerAction from './trailers/TrailerAction';
import './tonight.scss';
import './tonight/tonightSession.scss';

type Play = (item: BaseItemDto, startTicks?: number) => unknown;
type Props = {
    image: (item: BaseItemDto, backdrop?: boolean) => string;
    onPrepare: (item: BaseItemDto) => void;
    onRelease: () => void;
    onFeature?: (item?: BaseItemDto) => void;
    play: Play;
};

function RequestDialog({ title, close }: Readonly<{ title: BaseItemDto; close: () => void }>) {
    const selection = externalIdentity(title);
    return <ClientDialog label='Demander' title='Demander' subtitle={title.Name || undefined} controlled={{ open: true, onClose: close }}>
        {selection && <RequestPanel identity={selection} />}
    </ClientDialog>;
}

function titleMetadata(item: TonightTitle, minutes: number) {
    if (item.Type !== 'Series') return minutes ? `Film · ${lengthLabel(minutes)}` : 'Film';
    const type = item.Status === 'Ended' && item.episodes && item.episodes <= 10 ? 'Mini-série' : 'Série';
    if (!minutes) return type;
    const duration = lengthLabel(minutes);
    return item.episodes ? `${type} · ${item.episodes} × ${duration}` : `${type} · ${duration} par épisode`;
}

function lengthLabel(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (!hours) return `${remainder} min`;
    if (!remainder) return `${hours} h`;
    return `${hours} h ${String(remainder).padStart(2, '0')}`;
}

function TonightCard({ idea, index, count, now, image, onPrepare, onRelease, play, onRequest, onSkip, onLater, canSave }: Readonly<
    Omit<Props, 'onFeature'> & { idea: TonightIdea; index: number; count: number; now: number; onRequest: () => void;
        onSkip: () => void; onLater: () => void; canSave: boolean }
>) {
    const location = useLocation();
    const { item, minutes, reasons } = idea;
    const [active, setActive] = useState(false);
    const absent = isExternal(item);
    const rating = item.CommunityRating && item.CommunityRating > 0 ? `${(item.CommunityRating / 2).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/5` : '';
    const ending = minutes ? `Fini vers ${clockLabel(now + minutes * 60000)}` : '';
    const style = { '--draw-order': index, '--card-angle': `${(index - (count - 1) / 2) * 6}deg`, '--card-lift': `${index === Math.floor(count / 2) ? -14 : 10}px` } as CSSProperties;
    function enter() {
        setActive(true);
        onPrepare(item);
    }
    function leave() {
        setActive(false);
        onRelease();
    }
    return <article className={`client-tonight-result client-draw-card${absent ? ' is-requestable' : ''}`} style={style}
        onAnimationEnd={event => {
            if (event.animationName === 'draw-deal') event.currentTarget.style.animation = 'none';
        }} onPointerEnter={enter} onPointerLeave={leave} onFocus={enter} onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) leave();
        }}>
        <div className='client-draw-shell'>
            <div className='client-draw-back' aria-hidden='true'><ClientIcon name='play' /></div>
            <div className='client-draw-front'>
                <span className='client-draw-poster' aria-hidden='true'>
                    {absent ? <SharedCatalogArtwork item={item} backdrop={false} /> : <Artwork source={image(item)} eager />}
                    {!absent && <PreviewClip item={item} surface='card' enabled={active} soundControl={false} />}
                </span>
                <div className='client-tonight-card-info'>
                    {absent && <span className='client-tonight-request-state'><ClientIcon name='plus' />À demander</span>}
                    <Link className='client-draw-open' to={`/client?id=${item.Id}`} aria-label={`Voir ${item.Name}`}
                        state={{ returnTo: location.pathname + location.search, returnState: location.state }}
                        onKeyDown={event => {
                            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                            event.preventDefault();
                            const list = event.currentTarget.closest('article')?.parentElement?.querySelectorAll<HTMLElement>('.client-draw-open');
                            const next = index + (event.key === 'ArrowRight' ? 1 : -1);
                            list?.[Math.max(0, Math.min((list?.length || 1) - 1, next))].focus();
                        }}><h2>{item.Name}</h2></Link>
                    <p className='client-tonight-meta'>{[titleMetadata(item, minutes), absent ? '' : ending, rating ? `★ ${rating}` : ''].filter(Boolean).join(' · ')}</p>
                    <ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
                    <div className='client-tonight-card-actions'>
                        {absent ? <button type='button' className='client-button' onClick={onRequest}><ClientIcon name='plus' />Demander</button> :
                            <button type='button' className='client-play' onClick={() => { play(item); }}><ClientIcon name='play' />Lecture</button>}
                        {!absent && <TrailerAction item={item} backdrop={image(item, true)} play={play} />}
                    </div>
                    <div className='client-tonight-card-actions secondary'>
                        <button type='button' className='client-button' onClick={onSkip}>Pas ce soir</button>
                        {canSave && <button type='button' className='client-button' onClick={onLater}><ClientIcon name='bookmark' />Plus tard</button>}
                    </div>
                </div>
            </div>
        </div>
    </article>;
}

type Partner = { id: string; name: string };
type CriteriaProps = { criteria: TonightCriteria; now: number; partners: Partner[]; allowRequests: boolean; change: (value: Partial<TonightCriteria>) => void };

function QuickQuestions({ criteria, now, partners, allowRequests, change }: Readonly<CriteriaProps>) {
    const clocks = deadlineTargets(now);
    const current = criteria.deadline >= 0 ? criteria.deadline : -1;
    const partner = partners.find(entry => identity(entry.id) === identity(criteria.partner));
    if (current >= 0 && !clocks.some(entry => entry.value === current)) {
        const date = new Date(now);
        date.setHours(Math.floor(current / 60), current % 60);
        clocks.push({ value: current, label: clockLabel(date.valueOf()) });
    }
    return <div className='client-tonight-questions'>
        <div className='client-tonight-quick-choices'>
            <fieldset><legend>Avec qui</legend><div className='client-draw-choices'>
                <button type='button' aria-pressed={!partner} onClick={() => change({ partner: '' })}>Seul</button>
                {partners.length > 0 && <label className='client-tonight-partner'><span>À deux avec</span>
                    <select aria-label='Profil partenaire' value={partner?.id || ''} onChange={event => change({ partner: event.target.value })}>
                        <option value=''>Choisir un profil</option>
                        {partners.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                    </select></label>}
            </div></fieldset>
            <fieldset><legend>Jusqu’à quand</legend><div className='client-draw-choices'>
                {clocks.map(({ value, label }) => <button type='button' key={value} aria-pressed={current === value}
                    onClick={() => change({ deadline: value })}>{label}</button>)}
                <button type='button' aria-pressed={current === -1} onClick={() => change({ deadline: -1 })}>Peu importe</button>
            </div></fieldset>
            <fieldset><legend>Énergie</legend><div className='client-draw-choices'>
                <button type='button' aria-pressed={criteria.energy === 'rest'} onClick={() => change({ energy: 'rest' })}>Se poser</button>
                <button type='button' aria-pressed={criteria.energy === 'engaged'} onClick={() => change({ energy: 'engaged' })}>Être captivé</button>
            </div></fieldset>
        </div>
        <label className='client-draw-keywords'>Une envie précise
            <input value={criteria.prompt} onChange={event => change({ prompt: event.target.value })} maxLength={180}
                placeholder='Un film qui fait un peu peur, sans gore' />
        </label>
        {allowRequests && !partner && <label className='client-tonight-include'>
            <input type='checkbox' checked={criteria.includeRequests} onChange={event => change({ includeRequests: event.target.checked })} />
            Inclure des titres à demander
        </label>}
    </div>;
}

function useRequestIdeas(enabled: boolean, library: TonightTitle[]) {
    const seerr = useSeerr();
    const shared = useSharedCatalog();
    const trending = useQuery({
        queryKey: [...seerr.root, 'TonightTrending'], enabled: enabled && seerr.connected, staleTime: 300000, retry: false,
        queryFn: ({ signal }) => seerr.call<Results<ExternalMedia>>('Api/discover/trending?language=fr&page=1', signal)
    });
    return useMemo(() => {
        if (!enabled || !seerr.connected) return [];
        const owned = new Set(library.map(providerKey).filter(Boolean));
        const entries = new Map<string, BaseItemDto>();
        for (const media of trending.data?.results || []) {
            const type = media.mediaType;
            if ((type !== 'movie' && type !== 'tv') || !isRecommendable(media) || !canRequest(seerr.permissions, type) || [2, 3, 4, 5, 6].includes(media.mediaInfo?.status || 0)) continue;
            const item = catalogueItem(media, type, []);
            entries.set(item.Id!, { ...item, RunTimeTicks: media.runtime ? media.runtime * 6e8 : undefined });
        }
        for (const item of sharedCatalogItems(shared.data || [], [])) {
            const match = externalIdentity(item);
            if (match && canRequest(seerr.permissions, match.type) && !entries.has(item.Id!)) entries.set(item.Id!, item);
        }
        return [...entries.values()].filter(item => !owned.has(providerKey(item)));
    }, [enabled, library, seerr.connected, seerr.permissions, shared.data, trending.data]);
}

function useClock() {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 30000);
        return () => window.clearInterval(timer);
    }, []);
    return now;
}

function useFiling(key: string | undefined, library: TonightTitle[], filed: Record<string, string | null> | undefined) {
    const ages = useMemo(() => {
        const saved = readTonight(key).favorites;
        return Object.fromEntries(library.filter(item => item.Id && item.UserData?.IsFavorite)
            .map(item => [identity(item.Id!), saved[identity(item.Id!)] || Date.now()]));
    }, [key, library]);
    useEffect(() => {
        if (library.length) writeTonight(key, { favorites: ages });
    }, [key, ages, library.length]);
    return useMemo(() => {
        const result = new Map<string, number>(Object.entries(ages));
        for (const [id, date] of Object.entries(filed || {})) {
            const parsed = Date.parse(date || '');
            const canonical = identity(id);
            const earliest = Number.isFinite(parsed) ? parsed : Date.now();
            result.set(canonical, Math.min(result.get(canonical) || earliest, earliest));
        }
        return result;
    }, [ages, filed]);
}

function useIdeas(criteria: TonightCriteria, key: string | undefined, now: number, excluded: string[], previous: string[], seed: number) {
    const options = useTonightOptions();
    const library = useTonightLibrary(!!options.data, options.isFetched);
    const items = useMemo(() => library.data?.items || [], [library.data]);
    const filed = useFiling(key, items, options.data?.filed);
    const partner = options.data?.partners.find(entry => identity(entry.id) === identity(criteria.partner));
    const together = useTonightTogether(partner?.id || '');
    const requestables = useRequestIdeas(criteria.includeRequests && !partner, items);
    const description = useDescriptionSearch(!!criteria.prompt, criteria.prompt, true);
    const semantic = new Map(description.results.flatMap(hit => {
        const item = descriptionItem(hit);
        return item?.Id ? [[identity(item.Id), { ...hit, itemId: item.Id }] as const] : [];
    }));
    const profile = useMemo(() => tasteFrom(items), [items]);
    const eligible = items.filter(item => item.Type !== 'Series' || item.episodes);
    const pending = library.isPending || (!options.isFetched && !!criteria.partner) || (!!partner && together.isPending) || description.pending;
    const selection = suggestTonight({
        items: [...eligible, ...requestables], profile, criteria, now, seed,
        hidden: new Set([...(options.data?.hidden || []).map(identity), ...excluded]),
        recent: new Set(previous), started: new Set(library.data?.started || []), filed, semantic,
        joint: partner ? together.data || new Map() : undefined
    });
    return { ...selection, options, partner, pending, error: library.isError || (!!partner && together.isError) };
}

export default function TonightPage(props: Readonly<Props>) {
    const { api, user } = useApi();
    const account = tonightStateKey(api?.basePath, user?.Id);
    return <TonightSession key={account} account={account} {...props} />;
}

function TonightSession({ account, onFeature, ...card }: Readonly<Props & { account?: string }>) {
    const seerr = useSeerr();
    const now = useClock();
    const [criteria, setCriteria] = useState(() => readTonight(account).criteria);
    const [previous, setPrevious] = useState(() => readTonight(account).recent);
    const [excluded, setExcluded] = useState<string[]>([]);
    const [skipped, setSkipped] = useState<string[]>([]);
    const [seed, setSeed] = useState(0);
    const [requestedTitle, setRequestedTitle] = useState<BaseItemDto>();
    const [notice, setNotice] = useState('');
    const current = useIdeas(criteria, account, now, [...excluded, ...skipped], previous, seed);
    const action = useTonightAction();
    const catalog = useSharedCatalog(criteria.includeRequests);
    const memberships = useFollowedMemberships(criteria.includeRequests && !!current.options.data);
    function canSave(item: BaseItemDto) {
        return !!current.options.data && (!isExternal(item) || (memberships.data === true && !!followedMember(item, catalog.data)));
    }
    const feature = useRef(onFeature);
    feature.current = onFeature;
    const middle = current.ideas[Math.floor(current.ideas.length / 2)]?.item;
    const shown = current.pending ? '' : current.ideas.map(idea => identity(idea.item.Id!)).join(',');
    useEffect(() => {
        if (!account || !shown) return;
        writeTonight(account, { recent: [...new Set([...shown.split(','), ...readTonight(account).recent])].slice(0, 18) });
    }, [account, shown]);
    useEffect(() => feature.current?.(middle), [middle]);

    function update(value: Partial<TonightCriteria>) {
        const next = { ...criteria, ...value };
        setCriteria(next);
        writeTonight(account, { criteria: next });
        setExcluded([]);
    }

    function reroll() {
        const ids = current.ideas.map(idea => identity(idea.item.Id!));
        const recent = [...new Set([...ids, ...previous])].slice(0, 18);
        setExcluded(ids);
        setPrevious(recent);
        writeTonight(account, { recent });
        setSeed(value => value + 1);
    }

    function skip(id: string) {
        setSkipped(values => [...values, identity(id)]);
        if (!current.options.data) return;
        action.mutate({ route: '/Hide', data: { key: identity(id) } }, {
            onError: () => {
                setNotice('Impossible d’écarter ce titre sur votre compte.');
                setSkipped(values => values.filter(value => value !== identity(id)));
            }
        });
    }

    function later(item: BaseItemDto) {
        const member = followedMember(item, catalog.data);
        const identityPath = member ? `${member.type}/${member.id}` : item.Id;
        action.mutate({ route: `/Later/${identityPath}`, data: {} }, {
            onSuccess: () => setNotice('Ajouté à « À voir plus tard ».'),
            onError: () => setNotice('Le titre n’a pas pu être ajouté.')
        });
    }

    const allowRequests = seerr.connected && (canRequest(seerr.permissions, 'movie') || canRequest(seerr.permissions, 'tv'));
    return <section className='client-tonight-table'>
        <header className='client-tonight-table-head'>
            <h1>Ce soir</h1>
            <div className='client-tonight-actions'><button type='button' className='client-draw-reroll' disabled={current.pending || !current.ideas.length} onClick={reroll}>
                <ClientIcon name='refresh' />Autres idées
            </button></div>
        </header>
        <QuickQuestions criteria={criteria} now={now} partners={current.options.data?.partners || []} allowRequests={allowRequests} change={update} />
        {current.earliest !== undefined && <p className='client-tonight-constraint'>Rien ne tient dans le temps choisi. Voici les titres qui finissent à partir de {clockLabel(now + current.earliest * 60000)}.</p>}
        <p className='client-tonight-notice' role='status'>{notice}</p>
        <div className='client-draw-stage' aria-busy={current.pending}>
            {current.pending && <ClientSkeleton layout='draw' count={3} contained label='Recherche d’idées…' />}
            {!current.pending && !current.ideas.length && <p className='client-draw-empty'>{current.error ? 'Impossible de charger les idées.' : 'Aucun autre titre pour ces critères.'}</p>}
            {!current.pending && current.ideas.length > 0 && <div className='client-draw-fan'>{current.ideas.map((idea, index) =>
                <TonightCard key={`${seed}-${idea.item.Id}`} idea={idea} index={index} count={current.ideas.length} now={now} {...card}
                    onRequest={() => setRequestedTitle(idea.item)} onSkip={() => skip(idea.item.Id!)} onLater={() => later(idea.item)} canSave={canSave(idea.item)} />
            )}</div>}
        </div>
        {requestedTitle && <RequestDialog key={requestedTitle.Id} title={requestedTitle} close={() => setRequestedTitle(undefined)} />}
    </section>;
}
/* eslint-enable react/jsx-no-bind */
