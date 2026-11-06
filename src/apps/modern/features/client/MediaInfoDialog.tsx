/* eslint-disable react/jsx-no-bind -- Actions are local to this dialog. */
import type { BaseItemDto, MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { useApi } from 'hooks/useApi';

import ClientDialog from './ClientDialog';
import ClientIcon from './ClientIcon';
import { describeAudio, describeSubtitle, describeVideo, formatBitrate, formatClock, formatSize, safeLink } from './mediaInfo';
import { clientRequest } from './session';
import { serverInterfaceUrl } from './session/ServerInterfacePage';
import type { TrackChoice } from './trackChoice';

type Props = { item: BaseItemDto; basePath: string; open: boolean; onClose: () => void; play: (item: BaseItemDto, startTicks?: number) => void; choice: TrackChoice; chooseVersion: (version?: string) => void };

function useMediaInfo(item: BaseItemDto, enabled: boolean) {
    const { api, user } = useApi();
    return useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'MediaInfo', item.Id], enabled: enabled && !!api && !!user?.Id && !!item.Id, staleTime: 300000, retry: false,
        queryFn: ({ signal }) => clientRequest(async () => {
            const library = getLibraryApi(api!);
            const userId = user!.Id!;
            const list = async (path: string) => {
                try {
                    const { data } = await api!.axiosInstance.get<BaseItemDto[]>(`${api!.basePath}/Items/${item.Id}/${path}?userId=${userId}`, { signal, headers: { Authorization: `MediaBrowser Token="${api!.accessToken}"` } });
                    return Array.isArray(data) ? data : [];
                } catch {
                    return [];
                }
            };
            // A series has no file of its own: its first episode stands for the technical details.
            const first = item.Type === BaseItemKind.Series ? (await library.getItems({ userId, parentId: item.Id, recursive: true, includeItemTypes: [BaseItemKind.Episode], limit: 1, sortBy: [ItemSortBy.ParentIndexNumber, ItemSortBy.IndexNumber] }, { signal })).data.Items?.[0] : item;
            const [title, file, bonus, trailers] = await Promise.all([
                library.getItem({ itemId: item.Id!, userId }, { signal }),
                first?.Id ? library.getItem({ itemId: first.Id, userId }, { signal }) : undefined,
                list('SpecialFeatures'), list('LocalTrailers')
            ]);
            return { title: title.data, file: file?.data, bonus, trailers };
        })
    });
}

function Technical({ source, name }: Readonly<{ source: MediaSourceInfo; name?: string }>) {
    const streams = source.MediaStreams || [];
    const of = (type: string) => streams.filter(stream => stream.Type === type);
    const video = of('Video')[0];
    return <dl>
        {name && <><dt>Version</dt><dd>{name}</dd></>}
        {source.Container && <><dt>Format</dt><dd>{source.Container.toUpperCase()}</dd></>}
        {formatSize(source.Size) && <><dt>Taille</dt><dd>{formatSize(source.Size)}</dd></>}
        {formatBitrate(source.Bitrate) && <><dt>Débit</dt><dd>{formatBitrate(source.Bitrate)}</dd></>}
        {video && <><dt>Vidéo</dt><dd>{describeVideo(video)}</dd></>}
        {of('Audio').map(stream => <React.Fragment key={stream.Index}><dt>Audio</dt><dd>{describeAudio(stream)}</dd></React.Fragment>)}
        {of('Subtitle').map(stream => <React.Fragment key={stream.Index}><dt>Sous-titres</dt><dd>{describeSubtitle(stream)}</dd></React.Fragment>)}
    </dl>;
}

function PlayList({ title, entries, play }: Readonly<{ title: string; entries: BaseItemDto[]; play: Props['play'] }>) {
    if (!entries.length) return null;
    return <section><h3>{title}</h3><ul>{entries.map(entry => <li key={entry.Id}><button type='button' className='client-media-row' onClick={() => play(entry, 0)}><ClientIcon name='play' />{entry.Name}<time>{formatClock(entry.RunTimeTicks)}</time></button></li>)}</ul></section>;
}

/** Everything the former detail page offered that is useful to a viewer, out of sight until asked for. */
export default function MediaInfoDialog({ item, basePath, open, onClose, play, choice, chooseVersion }: Readonly<Props>) {
    const { user } = useApi();
    const info = useMediaInfo(item, open);
    const start: Props['play'] = (entry, ticks) => {
        onClose();
        play(entry, ticks);
    };
    const { title, file, bonus = [], trailers = [] } = info.data || {};
    const sources = file?.MediaSources || [];
    const versions = item.Type === BaseItemKind.Movie && sources.length > 1 ? sources : [];
    const shown = versions.find(source => source.Id === choice.version) || sources[0];
    const chapters = item.Type === BaseItemKind.Movie ? file?.Chapters || [] : [];
    const links = [...(title?.ExternalUrls || []).map(link => ({ name: link.Name, url: safeLink(link.Url) })),
        ...(title?.RemoteTrailers || []).map((link, index) => ({ name: link.Name || `Bande-annonce ${index + 1}`, url: safeLink(link.Url) }))].filter(link => link.url);
    return <ClientDialog controlled={{ open, onClose }} label='Informations' title='Informations' subtitle={item.Name || ''}>
        <div className='client-media-info'>
            {info.isPending && open && <p role='status'>Chargement…</p>}
            {info.isError && <p role='alert'>Ces informations sont indisponibles pour le moment.</p>}
            {versions.length > 0 && <section><h3>Version à lire</h3><ul>{versions.map(source => <li key={source.Id}>
                <button type='button' className='client-media-row' aria-pressed={shown?.Id === source.Id} onClick={() => chooseVersion(source.Id || undefined)}>
                    {shown?.Id === source.Id && <ClientIcon name='check' />}{source.Name || source.Id}<small>{formatSize(source.Size)}</small>
                </button></li>)}</ul></section>}
            {shown && <section><h3>{item.Type === BaseItemKind.Series ? `Fichier de l’épisode « ${file?.Name} »` : 'Fichier'}</h3><Technical source={shown} name={versions.length ? shown.Name || undefined : undefined} /></section>}
            {chapters.length > 0 && <section><h3>Chapitres</h3><ul>{chapters.map((chapter, index) => <li key={chapter.StartPositionTicks ?? index}>
                <button type='button' className='client-media-row' onClick={() => start(file!, chapter.StartPositionTicks || 0)}>
                    {chapter.ImageTag && <img src={`${basePath}/Items/${file!.Id}/Images/Chapter/${index}?tag=${chapter.ImageTag}&maxWidth=160&quality=80`} alt='' loading='lazy' />}
                    {chapter.Name || `Chapitre ${index + 1}`}<time>{formatClock(chapter.StartPositionTicks)}</time>
                </button></li>)}</ul></section>}
            <PlayList title='Bandes-annonces' entries={trailers} play={start} />
            <PlayList title='Bonus' entries={bonus} play={start} />
            {links.length > 0 && <section><h3>Liens</h3><div className='client-media-links'>{links.map(link => <a key={link.url} href={link.url} target='_blank' rel='noopener noreferrer'>{link.name}</a>)}</div></section>}
            {user?.Policy?.IsAdministrator && item.Id && <section><h3>Administration</h3><div className='client-media-links'><a href={serverInterfaceUrl(basePath, `details?id=${item.Id}`)} target='_blank' rel='noopener noreferrer'>Modifier ce titre sur le serveur ↗</a></div></section>}
        </div>
    </ClientDialog>;
}
/* eslint-enable react/jsx-no-bind */
