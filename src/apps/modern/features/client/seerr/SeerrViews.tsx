/* eslint-disable react/jsx-no-bind -- These controls belong to the current request form. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import './seerr.scss';

import Artwork from '../Artwork';
import HeroArtwork from '../HeroArtwork';
import ClientIcon from '../ClientIcon';
import { externalIdentity, catalogueItem, providerKey, canRequest, imageUrl, localMatch, mediaLabel, requestableSeasons, requestLabel,
    type ExternalMedia, type MediaRequest, type MediaType, type Quota, type Results, type SeerrIdentity } from './model';
import { useLocalIdentities, useSeerrDetail } from './queries';
import { useSeerr } from './SeerrContext';

export function SeerrSettings() {
    const seerr = useSeerr();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    let label = 'Le service de demandes n’est pas disponible sur ce serveur.';
    if (seerr.status.isFetching) label = 'Vérification de la connexion…';
    if (seerr.status.data?.enabled) label = 'Connexion aux demandes à rétablir.';
    if (seerr.connected) label = 'Connecté avec votre compte Jellyfin.';
    if (!seerr.enabled) label = 'Catalogue Jellyfin uniquement.';
    return <section className='client-seerr-settings'><h2>Découvertes et demandes</h2><label><input type='checkbox' checked={seerr.enabled} disabled={!seerr.permitted} onChange={event => seerr.setEnabled(event.target.checked)} /> Enrichir le catalogue avec Jellyseerr</label><p role='status'>{label}</p>
        {seerr.enabled && !seerr.connected && <button className='client-button' disabled={busy} onClick={async () => {
            setBusy(true);
            setError('');
            try {
                if (seerr.status.data?.enabled && !seerr.status.data.authenticated) await seerr.reconnect();
                else await seerr.status.refetch();
            } catch {
                setError('La connexion automatique n’est pas disponible. Connectez ce compte dans Moonfin, puis réessayez ici.');
            } finally { setBusy(false); }
        }}>{busy ? 'Connexion…' : 'Vérifier la connexion'}</button>}
        {error && <p role='alert'>{error}</p>}
    </section>;
}

function requestState({ data, identity, is4k, selected, permissions, quotaData, quotaReady, pending }: { data: ExternalMedia; identity: SeerrIdentity; is4k: boolean; selected: number[]; permissions: number; quotaData: Quota | undefined; quotaReady: boolean; pending: boolean }) {
    const info = data.mediaInfo;
    const state = is4k ? info?.status4k : info?.status;
    const seasons = requestableSeasons(data, is4k);
    const allSeasons = (data.seasons || []).filter(season => season.seasonNumber > 0);
    const currentQuota = quotaData?.[identity.type === 'movie' ? 'movie' : 'tv'];
    const remaining = currentQuota?.remaining ?? Math.max(0, (currentQuota?.limit || 0) - (currentQuota?.used || 0));
    const cost = identity.type === 'movie' ? 1 : selected.length;
    const permitted = canRequest(permissions, identity.type, is4k);
    const restricted = currentQuota?.restricted || (!!currentQuota?.limit && cost > remaining);
    const filmRequested = identity.type === 'movie' && [2, 3, 5, 6].includes(state || 0);
    const validSelection = identity.type === 'movie' || (selected.length > 0 && selected.every(number => seasons.some(season => season.seasonNumber === number)));
    const disabled = state === 6 || !permitted || !quotaReady || restricted || filmRequested || !validSelection || pending;
    return { info, state, seasons, allSeasons, currentQuota, remaining, permitted, restricted, filmRequested, disabled };
}

function SeasonPicker({ data, is4k, selected, disabled, toggle }: Readonly<{ data: ExternalMedia; is4k: boolean; selected: number[]; disabled: boolean; toggle: (number: number) => void }>) {
    const seasons = requestableSeasons(data, is4k);
    return <fieldset disabled={disabled}><legend>Choisir les saisons à compléter</legend><div className='client-request-seasons'>{(data.seasons || []).filter(season => season.seasonNumber > 0).map(season => {
        const available = seasons.some(entry => entry.seasonNumber === season.seasonNumber);
        const seasonInfo = data.mediaInfo?.seasons?.find(entry => entry.seasonNumber === season.seasonNumber);
        let label = mediaLabel({ status: is4k ? seasonInfo?.status4k : seasonInfo?.status });
        if (!available && label === 'À demander') label = 'Déjà demandée';
        return <button type='button' key={season.seasonNumber} disabled={!available} aria-pressed={selected.includes(season.seasonNumber)} onClick={() => toggle(season.seasonNumber)}><strong>Saison {season.seasonNumber}</strong><small>{label}</small></button>;
    })}</div></fieldset>;
}

function QuotaNotice({ label, loaded, restricted, error, onRetry }: Readonly<{ label: string; loaded: boolean; restricted: boolean; error: boolean; onRetry: () => void }>) {
    return <>{loaded && <p className='client-request-quota'>{label}</p>}{restricted && <p role='status'>Votre quota ne permet pas cette sélection.</p>}{error && <p role='alert'>Impossible de vérifier le quota. <button onClick={onRetry}>Réessayer</button></p>}</>;
}

function RequestHistory({ entries }: { readonly entries: MediaRequest[] }) {
    return <div className='client-request-history'>{entries.map(entry => <p key={entry.id}>{entry.is4k ? '4K · ' : ''}{entry.seasons?.length ? `Saisons ${entry.seasons.map(season => season.seasonNumber).join(', ')} · ` : ''}{requestLabel(entry.status)}</p>)}</div>;
}

export function RequestPanel({ identity }: { readonly identity: SeerrIdentity }) {
    const seerr = useSeerr();
    const detail = useSeerrDetail(identity.type, identity.id);
    if (!seerr.connected) return null;
    if (detail.isPending) return <section className='client-request-panel' role='status'>Chargement des disponibilités…</section>;
    if (!detail.data) {
        return <section className='client-request-panel'><p>Les disponibilités ne peuvent pas être vérifiées.</p><button onClick={() => {
            void detail.refetch();
        }}>Réessayer</button></section>;
    }
    return <RequestForm identity={identity} data={detail.data} />;
}

function RequestForm({ identity, data }: Readonly<{ identity: SeerrIdentity; data: ExternalMedia }>) {
    const seerr = useSeerr();
    const cache = useQueryClient();
    const [is4k, set4k] = useState(false);
    const [selected, setSelected] = useState<number[]>([]);
    const [confirm, setConfirm] = useState(false);
    const quota = useQuery({ queryKey: [...seerr.root, 'Quota', seerr.me.data?.id], enabled: seerr.connected,
        retry: false, staleTime: 15000, queryFn: ({ signal }) => seerr.call<Quota>(`Api/user/${seerr.me.data!.id}/quota`, signal) });
    const mutation = useMutation({ mutationFn: async () => {
        if (!canRequest(seerr.permissions, identity.type, is4k)) throw new Error('Vous ne pouvez pas demander ce contenu.');
        const body: { mediaType: MediaType; mediaId: number; is4k: boolean; seasons?: number[] } = { mediaType: identity.type, mediaId: identity.id, is4k };
        if (identity.type === 'tv') body.seasons = selected;
        const result = await seerr.call<MediaRequest>('Api/request', undefined, body);
        if (!Number.isSafeInteger(result.id)) throw new Error('Le serveur n’a pas confirmé la demande. Actualisez son statut avant de réessayer.');
        return result;
    }, retry: false, onSuccess: async () => {
        setConfirm(false);
        setSelected([]);
        await cache.invalidateQueries({ queryKey: seerr.root });
    }, onError: () => { void cache.invalidateQueries({ queryKey: [...seerr.root, 'Detail'] }); } });
    useEffect(() => {
        setSelected([]);
        setConfirm(false);
    }, [identity.id, identity.type, is4k]);
    const { info, state, currentQuota, remaining, permitted, restricted, filmRequested, disabled } = requestState({ data, identity, is4k, selected, permissions: seerr.permissions, quotaData: quota.data, quotaReady: quota.isSuccess, pending: mutation.isPending });
    const quotaUnit = identity.type === 'tv' ? 'saison(s)' : 'film(s)';
    const quotaLabel = currentQuota?.limit ? `${remaining} ${quotaUnit} restant(s) dans votre quota` : 'Aucune limite de demandes pour votre compte';
    return <section className='client-request-panel' aria-label='Disponibilité et demandes'><header><h2>{identity.type === 'tv' ? 'Saisons et demandes' : 'Disponibilité'}</h2><span>{mediaLabel({ status: state })}</span></header>
        {canRequest(seerr.permissions, identity.type, true) && <label className='client-request-quality'><input type='checkbox' checked={is4k} disabled={mutation.isPending} onChange={event => set4k(event.target.checked)} /> Version 4K</label>}
        {identity.type === 'tv' && <SeasonPicker data={data} is4k={is4k} selected={selected} disabled={mutation.isPending || !permitted} toggle={number => {
            setConfirm(false);
            setSelected(previous => previous.includes(number) ? previous.filter(value => value !== number) : [...previous, number]);
        }} />}
        {!permitted && <p>Votre compte peut consulter ce contenu mais ne peut pas le demander.</p>}
        <QuotaNotice label={quotaLabel} loaded={!!currentQuota} restricted={!!restricted} error={quota.isError} onRetry={() => { void quota.refetch(); }} />
        {!filmRequested && (!confirm ? <button className='client-button' disabled={disabled} onClick={() => setConfirm(true)}><ClientIcon name='plus' />{identity.type === 'tv' ? 'Demander la sélection' : 'Demander ce film'}</button> :
            <div className='client-request-confirm'><p>Demander <strong>{data.title || data.name}</strong>{identity.type === 'tv' ? ` · saisons ${selected.slice().sort((a, b) => a - b).join(', ')}` : ''}{is4k ? ' en 4K' : ''} ?</p><p>Le serveur appliquera la qualité configurée et les éventuelles règles de validation.</p><button className='client-play' disabled={disabled} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Envoi…' : 'Confirmer la demande'}</button><button className='client-button' disabled={mutation.isPending} onClick={() => setConfirm(false)}>Annuler</button></div>)}
        {mutation.isSuccess && <p role='status'>Demande enregistrée. Retrouvez son avancement dans Mon espace.</p>}
        {mutation.isError && <p role='alert'>{mutation.error.message}</p>}
        <RequestHistory entries={info?.requests || []} />
    </section>;
}

export function ExternalDetail({ id, row }: Readonly<{ id: string; row: (title: string, items: BaseItemDto[]) => React.ReactNode }>) {
    const identity = externalIdentity({ Id: id });
    const seerr = useSeerr();
    const detail = useSeerrDetail(identity?.type, identity?.id);
    const local = useLocalIdentities(seerr.connected);
    const location = useLocation();
    const back = (location.state as { returnTo?: string } | null)?.returnTo || '/client';
    if (!seerr.connected) return <section className='client-settings'><Link to={back} state={{ restoreFocus: true }}>← Retour</Link><h1>Découvertes et demandes</h1><p>Activez la connexion aux demandes pour retrouver cette fiche.</p><SeerrSettings /></section>;
    if (!detail.data || !identity) {
        return <section className='client-settings'><Link to={back} state={{ restoreFocus: true }}>← Retour</Link><p role='status'>{detail.isError ? 'La fiche ne peut pas être chargée.' : 'Chargement de la fiche…'}</p>{detail.isError && <button onClick={() => {
            void detail.refetch();
        }}>Réessayer</button>}</section>;
    }
    const data = detail.data;
    const match = localMatch(data, identity.type, local.data || []);
    return <><section className='client-hero client-detail client-external-detail'><HeroArtwork source={imageUrl(data.backdropPath, true)} /><Link className='client-back' to={back} state={{ restoreFocus: true }}>← Retour</Link><div className='client-hero-copy'><span className='client-eyebrow'>{match ? 'Dans votre bibliothèque' : mediaLabel(data.mediaInfo)}</span><h1>{data.title || data.name}</h1><p className='client-meta'>{(data.releaseDate || data.firstAirDate || '').slice(0, 4)} · {data.genres?.map(genre => genre.name).join(' · ')}</p><p className='client-overview'>{data.overview}</p>{match && <Link className='client-play' to={`/client?id=${match.Id}`}><ClientIcon name='play' />Voir dans ma bibliothèque</Link>}</div></section><RequestPanel key={id} identity={identity} /><ExternalRecommendations identity={identity} local={local.data || []} row={row} /></>;
}

function ExternalRecommendations({ identity, local, row }: Readonly<{ identity: SeerrIdentity; local: BaseItemDto[]; row: (title: string, items: BaseItemDto[]) => React.ReactNode }>) {
    const seerr = useSeerr();
    const query = useQuery({ queryKey: [...seerr.root, 'Recommendations', identity.type, identity.id],
        enabled: seerr.connected, retry: false, staleTime: 300000,
        queryFn: ({ signal }) => seerr.call<Results<ExternalMedia>>(`Api/${identity.type}/${identity.id}/recommendations?language=fr&page=1`, signal) });
    const items = (query.data?.results || []).map(media => catalogueItem(media, identity.type, local));
    return <>{row('Dans le même esprit', items)}</>;
}

function TrackedRequest({ entry, local }: { readonly entry: MediaRequest; readonly local: BaseItemDto[] }) {
    const type = entry.type || entry.media.mediaType || 'movie';
    const detail = useSeerrDetail(type, entry.media.tmdbId);
    if (!entry.media.tmdbId) return null;
    const media: ExternalMedia = detail.data || { id: entry.media.tmdbId };
    const item = catalogueItem(media, type, local);
    return <Link to={`/client?id=${item.Id}`} className='client-tracked-request'><Artwork source={imageUrl(media.posterPath)} /><span><strong>{media.title || media.name || 'Chargement du titre…'}</strong><small>{entry.seasons?.length ? `Saisons ${entry.seasons.map(season => season.seasonNumber).join(', ')} · ` : ''}{entry.is4k ? '4K · ' : ''}{entry.media.status === 4 ? 'Partiellement disponible' : requestLabel(entry.status)}</small></span><ClientIcon name='next' /></Link>;
}
export function RequestTracking() {
    const seerr = useSeerr();
    const [page, setPage] = useState(0);
    const [filter, setFilter] = useState('all');
    const local = useLocalIdentities(seerr.connected);
    const query = useQuery({ queryKey: [...seerr.root, 'Requests', page, filter], enabled: seerr.connected,
        refetchInterval: 20000, retry: false, queryFn: ({ signal }) => seerr.call<Results<MediaRequest>>(`Api/request?take=12&skip=${page * 12}&sort=modified&filter=${filter}&requestedBy=${seerr.me.data!.id}`, signal) });
    const refreshed = useRef('');
    const cache = useQueryClient();
    const missing = (query.data?.results || []).filter(entry => entry.status === 5 || entry.media.status === 5)
        .filter(entry => !local.data?.some(item => providerKey(item) === `${entry.type || entry.media.mediaType || 'movie'}:${entry.media.tmdbId}`))
        .map(entry => entry.media.tmdbId).sort((a, b) => (a || 0) - (b || 0)).join(',');
    useEffect(() => {
        if (!local.isSuccess || !missing || refreshed.current === missing) return;
        refreshed.current = missing;
        void cache.invalidateQueries({ queryKey: [...seerr.root, 'LocalIdentities'] });
    }, [local.isSuccess, missing, cache, seerr.root]);
    if (!seerr.connected) return null;
    return <section className='client-request-tracking'><header><h2>Mes demandes</h2><label>Afficher <select aria-label='Filtrer mes demandes' value={filter} onChange={event => {
        setFilter(event.target.value);
        setPage(0);
    }}><option value='all'>Toutes</option><option value='pending'>En attente</option><option value='processing'>En préparation</option><option value='available'>Disponibles</option><option value='failed'>Échecs</option></select></label></header>
    {query.isPending && <p role='status'>Chargement de vos demandes…</p>}{query.isError && <p role='alert'>Les demandes ne peuvent pas être chargées. <button onClick={() => {
        void query.refetch();
    }}>Réessayer</button></p>}
    <div className='client-request-list'>{query.data?.results.map(entry => <TrackedRequest key={entry.id} entry={entry} local={local.data || []} />)}</div>
    {query.data?.results.length === 0 && <p>Aucune demande dans cette sélection.</p>}
    <div className='client-pagination'><button disabled={!page} onClick={() => setPage(value => value - 1)}>Précédent</button><span>Page {page + 1}</span><button disabled={!query.data || (page + 1) * 12 >= (query.data.pageInfo?.results || 0)} onClick={() => setPage(value => value + 1)}>Suivant</button></div>
    </section>;
}

/* eslint-enable react/jsx-no-bind */
