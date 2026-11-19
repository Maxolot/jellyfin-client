/* eslint-disable react/jsx-no-bind -- Filmography controls refer to the current person and selected credit. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import Artwork from '../Artwork';
import { artworkUrl } from '../artwork';
import ClientDialog from '../ClientDialog';
import ClientIcon from '../ClientIcon';
import ClientSkeleton from '../ClientSkeleton';
import { canRequest, externalIdentity, imageUrl, type CatalogueItem } from '../seerr/model';
import { useSeerr } from '../seerr/SeerrContext';
import { RequestPanel } from '../seerr/SeerrViews';
import { ChoiceSelect, type Option } from '../settings/controls';
import SharedCatalogArtwork from '../SharedCatalogArtwork';
import { browseFilmography, filmography, filmographyCounts, personDepartment, type FilmographyEntry, type FilmographyRole, type FilmographyStatus } from './model';
import { usePersonData } from './queries';
import './person.scss';

type Props = { id: string; basePath: string; image: (item: BaseItemDto) => string; play: (item: BaseItemDto) => void };

const mediaKinds: Option<string>[] = [['', 'Films et séries'], ['movie', 'Films'], ['tv', 'Séries']];
const order: Option<string>[] = [['popular', 'Popularité'], ['date', 'Date de sortie']];
const roles: Array<{ key: FilmographyRole; label: string }> = [
    { key: 'acting', label: 'Acteur' }, { key: 'directing', label: 'Réalisation' }, { key: 'other', label: 'Autres postes' }
];
const sections: Array<{ key: FilmographyStatus; label: string }> = [
    { key: 'available', label: 'Disponible maintenant' },
    { key: 'tracked', label: 'Suivi / en cours de demande' },
    { key: 'requestable', label: 'À demander' }
];

type Navigation = { returnTo?: string; returnState?: unknown };

function dateLabel(value?: string) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    return new Date(value + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function PersonHero({ name, portrait, job, birth, place, death, bio, counts }: Readonly<{
    name: string; portrait: string; job?: string; birth?: string; place?: string; death?: string; bio?: string | null; counts?: string;
}>) {
    const location = useLocation();
    const previous = location.state as Navigation | null;
    const born = [dateLabel(birth), place].filter(Boolean).join(' · ');
    const died = dateLabel(death);
    return <header className='client-person-hero'>
        <Link className='client-shelf-back' to={previous?.returnTo || '/client?view=search'}
            state={{ ...(previous?.returnState as object), restoreFocus: true }}><ClientIcon name='back' />Retour</Link>
        <div className='client-person-intro'>
            <span className='client-person-new-portrait'>
                {portrait && <Artwork source={portrait} eager />}
                <span aria-hidden='true'>{name.slice(0, 1).toLocaleUpperCase('fr')}</span>
            </span>
            <div>
                <h1>{name}</h1>
                {job && <p className='client-person-job'>{job}</p>}
                {(born || died) && <dl className='client-person-dates'>
                    {born && <><dt>Naissance</dt><dd>{born}</dd></>}
                    {died && <><dt>Décès</dt><dd>{died}</dd></>}
                </dl>}
                {counts && <p className='client-person-count'>{counts}</p>}
                {bio && <details className='client-person-biography'><summary>Biographie</summary><p>{bio}</p></details>}
            </div>
        </div>
    </header>;
}

export default function PersonPage({ id, basePath, image, play }: Readonly<Props>) {
    const [params] = useSearchParams();
    const seerr = useSeerr();
    const data = usePersonData(id, params.get('name') || '');
    const [type, setType] = useState('');
    const [role, setRole] = useState('');
    const [sort, setSort] = useState('popular');
    const [includeAppearances, setAppearances] = useState(false);
    const [request, setRequest] = useState<FilmographyEntry>();
    const canClassify = seerr.connected && data.remote.isSuccess && data.library.isSuccess;
    const credits = canClassify ? data.remote.data?.credits : undefined;
    const remote = seerr.connected ? data.remote.data?.person : undefined;
    const contents = filmography({ credits, local: data.localItems, library: data.library.data || [], shared: data.shared.data || [],
        personId: data.localId, includeAppearances });
    const shown = browseFilmography(contents, type, role, sort);
    const there = contents.filter(entry => entry.status === 'available').length;
    const toRequest = contents.filter(entry => entry.status === 'requestable').length;
    const counts = filmographyCounts(there, canClassify ? toRequest : undefined);
    const roleTabs = roles.filter(tab => contents.some(entry => entry.roles[tab.key]?.length));
    const loading = data.associated.isLoading || data.local.isLoading || data.resolving || data.remote.isLoading || (data.remote.isSuccess && data.library.isLoading);
    const portrait = imageUrl(remote?.profilePath) || (data.local.data?.ImageTags?.Primary ? artworkUrl(basePath, data.local.data, 'portrait') : '');
    return <div className='client-person-page'>
        <PersonHero name={remote?.name || data.name || 'Personne'} portrait={portrait}
            job={personDepartment(remote?.knownForDepartment)} birth={remote?.birthday} place={remote?.placeOfBirth}
            death={remote?.deathday} bio={remote?.biography || data.local.data?.Overview} counts={counts} />
        <section className='client-person-filmography' aria-labelledby='client-filmography-heading'>
            <header><h2 id='client-filmography-heading'>Filmographie</h2>
                {contents.length > 0 && <div className='client-filter-options'>
                    <ChoiceSelect label='Type de titre' value={type} options={mediaKinds} onChange={setType} />
                    <ChoiceSelect label='Trier' value={sort} options={order} onChange={setSort} />
                    {canClassify && <label className='client-person-appearances'><input type='checkbox' checked={includeAppearances}
                        onChange={event => setAppearances(event.target.checked)} />Inclure les apparitions et talk-shows</label>}
                </div>}
            </header>
            {roleTabs.length > 1 && <div className='client-person-role-tabs' role='group' aria-label='Participation'>
                <button type='button' aria-pressed={!role} onClick={() => setRole('')}>Tous les rôles</button>
                {roleTabs.map(tab => <button type='button' key={tab.key} aria-pressed={role === tab.key} onClick={() => setRole(tab.key)}>{tab.label}</button>)}
            </div>}
            {loading && <ClientSkeleton layout='grid' count={6} contained label='Chargement de la filmographie…' />}
            {!loading && !canClassify && <p className='client-person-note'>La filmographie affiche les titres de votre bibliothèque Jellyfin.</p>}
            {sections.filter(section => canClassify || section.key === 'available').map(section => <CreditSection key={section.key} label={section.label}
                status={section.key} entries={shown.filter(entry => entry.status === section.key)} role={role} image={image} play={play}
                request={entry => setRequest(entry)} permissions={seerr.permissions} />)}
        </section>
        <ClientDialog label='Demander' title='Demander' subtitle={request?.item.Name || undefined} controlled={{ open: !!request, onClose: () => setRequest(undefined) }}>
            {request && externalIdentity(request.item) && <RequestPanel identity={externalIdentity(request.item)!} />}
        </ClientDialog>
    </div>;
}

type CreditActions = Pick<Props, 'image' | 'play'> & { role: string; request: (entry: FilmographyEntry) => void; permissions: number };

function CreditSection({ label, status, entries, ...actions }: Readonly<CreditActions & { label: string; status: FilmographyStatus; entries: FilmographyEntry[] }>) {
    if (!entries.length && status !== 'available') return null;
    return <section className={`client-credit-section is-${status}`}>
        <h3>{label}</h3>
        {!entries.length ? <p>Aucun titre disponible pour cette sélection.</p> : <div className='client-grid' data-reveal='static'>
            {entries.map(entry => <CreditTile key={entry.item.Id} entry={entry} {...actions} />)}
        </div>}
    </section>;
}

function CreditTile({ entry, role, image, play, request, permissions }: Readonly<CreditActions & { entry: FilmographyEntry }>) {
    const location = useLocation();
    const { item, status } = entry;
    const credits = (role ? entry.roles[role as FilmographyRole] : Object.values(entry.roles).flat()) || [];
    const badge = entry.label || (status === 'available' ? 'Disponible' : 'À demander');
    const poster = status === 'available' ? image(item) : imageUrl((item as CatalogueItem).Seerr?.posterPath);
    const fallback = entry.followed ? <SharedCatalogArtwork item={item} backdrop={false} /> : <span className='client-card-fallback'>{item.Name}</span>;
    return <article className='client-credit-card'>
        <Link className='client-card client-credit-poster' to={`/client?id=${item.Id}`} data-client-focus={item.Id}
            state={{ returnTo: location.pathname + location.search, returnState: location.state }}
            aria-label={[item.Name, ...credits, badge].filter(Boolean).join(' · ')}>
            {poster ? <Artwork source={poster} /> : fallback}
            <span className='client-credit-badge'>{badge}</span>
            <span className='client-credit-copy' aria-hidden='true'><strong>{item.Name}</strong>
                {credits.length > 0 && <small>{credits.join(' · ')}</small>}
            </span>
        </Link>
        {status === 'available' && <button type='button' className='client-button' aria-label={`Lire ${item.Name}`} onClick={() => play(item)}><ClientIcon name='play' />Lecture</button>}
        {status === 'requestable' && canRequest(permissions, entry.type, false) && <button type='button' className='client-button'
            aria-label={`Demander ${item.Name}`} onClick={() => request(entry)}><ClientIcon name='plus' />Demander</button>}
    </article>;
}

/* eslint-enable react/jsx-no-bind */
