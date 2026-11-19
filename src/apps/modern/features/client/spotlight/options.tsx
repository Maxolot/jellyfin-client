import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { type MouseEvent, type ReactNode } from 'react';

import Artwork from '../Artwork';
import ClientIcon from '../ClientIcon';
import SharedCatalogArtwork from '../SharedCatalogArtwork';
import { personPath, type PersonSearchResult } from '../person/model';
import { ListAction } from '../folders/FolderPicker';
import WatchedMarker, { watchedLabel } from '../WatchedMarker';
import { episodeLabel, isWatchedCard, progressPercent } from '../model';
import { imageUrl, isExternal, mediaLabel, type CatalogueItem } from '../seerr/model';
import { descriptionItem, type DescriptionHit } from './descriptionSearch';
import type { Layout } from './navigation';
import { matchesFilter, type SearchFilter } from './searchIndex';
import type { SpotlightResults } from './useSpotlightData';

export type Option = { key: string; label: string; run: (play: boolean) => void; playable?: boolean; view: () => ReactNode };
export type Group = { id: string; title?: string; layout: Layout; options: Option[]; status?: string; extra?: ReactNode };

export type Actions = {
    image: (item: BaseItemDto, backdrop?: boolean) => string;
    basePath: string;
    showWatched: boolean;
    shared: ReadonlySet<string>;
    protectEpisode?: (item: BaseItemDto) => boolean;
    openItem: (item: BaseItemDto) => void;
    playItem: (item: BaseItemDto) => void;
    go: (path: string) => void;
    isFavorite: (item: BaseItemDto) => boolean;
    toggleFavorite: (item: BaseItemDto) => void;
};

function typeLabel(item: BaseItemDto) {
    if (item.Type === 'Series') return 'Série';
    if (item.Type === 'Episode') return 'Épisode';
    return 'Film';
}

function availability(item: BaseItemDto, actions: Actions) {
    if (!isExternal(item)) return 'Disponible';
    return actions.shared.has(item.Id || '') ? 'À télécharger' : mediaLabel((item as CatalogueItem).Seerr?.mediaInfo);
}

function runner(item: BaseItemDto, actions: Actions) {
    return (play: boolean) => {
        if (play) actions.playItem(item);
        else actions.openItem(item);
    };
}

/** Buttons inside an option act alone: the option itself must not open on the same click. */
function alone(action: () => void) {
    return (event: MouseEvent) => {
        event.stopPropagation();
        action();
    };
}

function optionArtwork(item: BaseItemDto, actions: Actions, backdrop = false) {
    const source = actions.image(item, backdrop);
    if (actions.shared.has(item.Id || '')) return <SharedCatalogArtwork item={item} backdrop={backdrop} />;
    return <Artwork source={source} className={actions.protectEpisode?.(item) ? 'client-spoiler-art' : undefined} />;
}

function row(item: BaseItemDto, prefix: string, actions: Actions): Option {
    const watched = isWatchedCard(item, actions.showWatched);
    return {
        key: `${prefix}-${item.Id}`,
        label: [item.Name, item.ProductionYear, typeLabel(item), watched && watchedLabel].filter(Boolean).join(', '),
        playable: !isExternal(item),
        run: runner(item, actions),
        view: () => <>
            <span className='client-spotlight-thumb'>{optionArtwork(item, actions)}{watched && <WatchedMarker />}</span>
            <span className='client-spotlight-text'><strong>{item.Name}</strong>
                <small>{[item.ProductionYear, typeLabel(item)].filter(Boolean).join(' · ')}</small></span>
            <span className={`client-spotlight-badge${isExternal(item) ? '' : ' available'}`}>{availability(item, actions)}</span>
            {prefix === 'own' && <ListAction item={item} tabIndex={-1} />}
        </>
    };
}

function poster(item: BaseItemDto, prefix: string, actions: Actions): Option {
    const watched = isWatchedCard(item, actions.showWatched);
    return {
        key: `${prefix}-${item.Id}`,
        label: [item.Name, item.ProductionYear, watched && watchedLabel].filter(Boolean).join(', '),
        playable: !isExternal(item),
        run: runner(item, actions),
        view: () => <><span className='client-spotlight-art'>{optionArtwork(item, actions)}{watched && <WatchedMarker />}</span>
            {isExternal(item) && <span className='client-spotlight-poster-badge'>{availability(item, actions)}</span>}</>
    };
}

export function chip(key: string, label: string, run: () => void, icon?: 'collection' | 'clock'): Option {
    return { key, label, run: () => run(), view: () => <>{icon && <ClientIcon name={icon} />}{label}</> };
}

function BestActions({ item, actions }: Readonly<{ item: BaseItemDto; actions: Actions }>) {
    const favorite = actions.isFavorite(item);
    const requestLabel = actions.shared.has(item.Id || '') ? 'Voir la fiche' : 'Demander';
    return <span className='client-spotlight-best-actions'>
        {isExternal(item) ?
            <button type='button' className='client-play' tabIndex={-1} onClick={alone(() => actions.openItem(item))}><ClientIcon name='plus' />{requestLabel}</button> :
            <button type='button' className='client-play' tabIndex={-1} onClick={alone(() => actions.playItem(item))}><ClientIcon name='play' />Lecture</button>}
        {!isExternal(item) && <ListAction item={item} favorite={favorite} tabIndex={-1}
            // eslint-disable-next-line react/jsx-no-bind -- This action belongs to the current search result.
            fallback={() => actions.toggleFavorite(item)} />}
        <button type='button' className='client-button client-action-circle' tabIndex={-1} aria-label='Plus d’infos' title='Plus d’infos'
            onClick={alone(() => actions.openItem(item))}><ClientIcon name='info' /></button>
    </span>;
}

function best(item: BaseItemDto, actions: Actions): Option {
    const watched = isWatchedCard(item, actions.showWatched);
    return {
        key: `best-${item.Id}`,
        label: [item.Name, 'meilleur résultat', watched && watchedLabel].filter(Boolean).join(', '),
        playable: !isExternal(item),
        run: runner(item, actions),
        view: () => <>
            <span className='client-spotlight-best-art'>{optionArtwork(item, actions, true)}{watched && <WatchedMarker />}</span>
            <span className='client-spotlight-best-copy'>
                <strong>{item.Name}</strong>
                <small>{[item.ProductionYear, typeLabel(item), availability(item, actions)].filter(Boolean).join(' · ')}</small>
                <BestActions item={item} actions={actions} />
            </span>
        </>
    };
}

function person(entry: PersonSearchResult, actions: Actions): Option {
    const tag = entry.ImageTags?.Primary;
    const photo = imageUrl(entry.profilePath);
    return {
        key: `person-${entry.Id}`,
        label: `${entry.Name}, personne`,
        run: () => actions.go(personPath(entry.Id, entry.Name)),
        view: () => <>
            <span className='client-spotlight-avatar'>{(tag || photo) ?
                <img src={photo || `${actions.basePath}/Items/${entry.Id}/Images/Primary?maxWidth=120&quality=85&tag=${encodeURIComponent(tag || '')}`} alt='' loading='lazy' /> :
                (entry.Name || '?').slice(0, 1)}</span>
            <span className='client-spotlight-text'><strong>{entry.Name}</strong><small>Voir ses films et séries</small></span>
        </>
    };
}

function resume(item: BaseItemDto, actions: Actions): Option {
    return {
        key: `resume-${item.Id}`,
        label: `Reprendre ${[item.SeriesName, item.Type === 'Episode' && episodeLabel(item), item.Name].filter(Boolean).join(', ')}`,
        playable: true,
        // A title in progress starts again in one gesture.
        run: () => actions.playItem(item),
        view: () => <span className='client-spotlight-art'>{optionArtwork(item, actions, true)}
            <span className='client-spotlight-resume-play' aria-hidden='true'><ClientIcon name='play' /></span>
            {item.Type === 'Episode' && <span className='client-spotlight-resume-episode' aria-hidden='true'>{episodeLabel(item)}</span>}
            {progressPercent(item) > 0 && <span className='client-progress'><i style={{ width: `${progressPercent(item)}%` }} /></span>}
        </span>
    };
}

export function descriptionGroup(description: { active: boolean; pending: boolean; failed: boolean; results: DescriptionHit[] }, filter: SearchFilter, actions: Actions): Group | undefined {
    if (!description.active) return undefined;
    const options = description.results.flatMap(hit => {
        const item = descriptionItem(hit);
        if (!item || !matchesFilter(item, filter)) return [];
        const playable = !isExternal(item);
        if (filter === 'available' && !playable) return [];
        return [{
            key: `description-${item.Id}`,
            label: [item.Name, hit.reason, playable ? 'Disponible' : 'Catalogue partagé'].filter(Boolean).join(' · '),
            playable,
            run: runner(item, actions),
            view: () => <>
                <span className='client-spotlight-thumb'>{optionArtwork(item, actions)}</span>
                <span className='client-spotlight-text'><strong>{item.Name}</strong><small>{hit.reason}</small></span>
                <span className='client-spotlight-badge'>{playable ? 'Disponible' : 'Suivi'}</span>
            </>
        }];
    });
    let status: string | undefined;
    if (description.pending) status = 'Recherche…';
    else if (description.failed) status = 'Service temporairement indisponible.';
    else if (!options.length) status = 'Aucun titre proche.';
    return { id: 'description', title: 'Ça ressemble à…', layout: 'list', options, status };
}

const genrePath = (name: string) => `/client?view=home&genre=${encodeURIComponent(name)}`;

export function searchGroups(data: SpotlightResults, query: string, actions: Actions): Group[] {
    const text = query.trim();
    const groups: Group[] = [];
    if (data.best) groups.push({ id: 'best', title: 'Meilleur résultat', layout: 'best', options: [best(data.best, actions)] });
    groups.push(
        { id: 'own', title: 'Dans ta bibliothèque', layout: 'list', options: data.own.map(item => row(item, 'own', actions)), status: data.loadingLibrary ? 'Chargement…' : undefined },
        { id: 'shared', title: 'Catalogue partagé', layout: 'list', options: data.shared.map(item => row(item, 'shared', actions)) },
        { id: 'requestable', title: 'À demander', layout: 'list', options: data.requestable.map(item => row(item, 'request', actions)), status: data.requestLoading ? 'Recherche…' : undefined },
        { id: 'people', title: 'Personnes', layout: 'list', options: data.people.map(entry => person(entry, actions)) },
        { id: 'groups', title: 'Sagas et genres', layout: 'chips', options: data.groups.map(entry => entry.kind === 'collection' ?
            chip(`collection-${entry.id}`, entry.name, () => actions.go(`/client?view=search&collection=${entry.id}&collectionName=${encodeURIComponent(entry.name)}`), 'collection') :
            chip(`genre-${entry.id}`, entry.name, () => actions.go(genrePath(entry.name)))) },
        { id: 'more', layout: 'more', options: [{
            key: 'more', label: `Voir tous les résultats pour ${text}`,
            run: () => actions.go(`/client?view=search&q=${encodeURIComponent(text)}`),
            view: () => <><ClientIcon name='search' />Voir tous les résultats pour « {text} »<ClientIcon name='next' /></>
        }] }
    );
    return groups;
}

type Opening = { recent: Option[]; clearRecent?: ReactNode; trending: boolean };

export function openingGroups(data: SpotlightResults, actions: Actions, { recent, clearRecent, trending }: Opening): Group[] {
    const followedTitle = data.recentShared.byOthers ? 'Récemment suivis par les autres' : 'Récemment suivis dans le catalogue partagé';
    const groups: Group[] = [
        { id: 'resume', title: 'Reprendre', layout: 'wide', options: data.resume.map(item => resume(item, actions)) },
        { id: 'recent', title: 'Recherches récentes', layout: 'chips', options: recent, extra: clearRecent },
        { id: 'forYou', title: 'Pour toi', layout: 'posters', options: data.forYou.map(item => poster(item, 'for', actions)) },
        { id: 'recentShared', title: followedTitle, layout: 'posters', options: data.recentShared.items.map(item => poster(item, 'followed', actions)) }
    ];
    if (trending) groups.push({ id: 'trending', title: 'Tendances à demander', layout: 'posters', options: data.trending.map(item => poster(item, 'trend', actions)) });
    groups.push({ id: 'genres', title: 'Genres', layout: 'chips', options: data.genreShortcuts.map(name => chip(`genre-${name}`, name, () => actions.go(genrePath(name)))) });
    return groups;
}
