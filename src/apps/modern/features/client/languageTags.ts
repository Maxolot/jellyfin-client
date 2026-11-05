import type { BaseItemDto, MediaStream } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

import { clientRequest } from './session';

/** What the files of a title offer: French dub, original audio, several audio languages, French subtitles. */
export type FileLanguage = 'multi' | 'vf' | 'vo' | 'vostfr';
const ORDER: FileLanguage[] = ['multi', 'vf', 'vo', 'vostfr'];
const FRENCH = new Set(['fra', 'fre', 'fr', 'french', 'français', 'francais']);

const isFrench = (stream: MediaStream) => FRENCH.has((stream.Language || '').toLowerCase());

/** Language tags of one file, read from its audio and subtitle tracks. */
export function fileLanguages(streams: MediaStream[] | null | undefined): FileLanguage[] {
    const audio = (streams || []).filter(stream => stream.Type === 'Audio');
    const french = audio.some(isFrench);
    const other = audio.some(stream => !isFrench(stream) && !!stream.Language && stream.Language.toLowerCase() !== 'und');
    const subtitles = (streams || []).some(stream => stream.Type === 'Subtitle' && isFrench(stream) && !stream.IsForced);
    const tags = new Set<FileLanguage>();
    if (french && other) tags.add('multi');
    if (french) tags.add('vf');
    if (other && !french) tags.add('vo');
    if (subtitles && other) tags.add('vostfr');
    return ORDER.filter(tag => tags.has(tag));
}

/** A series shows only what every inspected episode offers, so a tag never overpromises. */
export function commonLanguages(files: FileLanguage[][]): FileLanguage[] {
    if (!files.length) return [];
    return ORDER.filter(tag => files.every(list => list.includes(tag)));
}

const streamsOf = (item: BaseItemDto) => item.MediaSources?.[0]?.MediaStreams || item.MediaStreams;

/** Language tags of a film or series already in the library; empty while loading or when nothing is known. */
export function useLocalLanguages(item: BaseItemDto): FileLanguage[] {
    const { api, user } = useApi();
    const kind = item.Type;
    const enabled = !!api && !!user?.Id && !!item.Id && (kind === BaseItemKind.Movie || kind === BaseItemKind.Series || kind === BaseItemKind.Episode);
    const query = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'FileLanguages', item.Id], enabled, staleTime: 600000, retry: false,
        queryFn: ({ signal }) => clientRequest(async () => {
            if (kind === BaseItemKind.Series) {
                const episodes = (await getLibraryApi(api!).getItems({ userId: user!.Id, parentId: item.Id, recursive: true,
                    includeItemTypes: [BaseItemKind.Episode], fields: [ItemFields.MediaStreams, ItemFields.MediaSources], limit: 120 }, { signal })).data.Items || [];
                return commonLanguages(episodes.map(episode => fileLanguages(streamsOf(episode))));
            }
            const full = (await getLibraryApi(api!).getItems({ userId: user!.Id, ids: [item.Id!], fields: [ItemFields.MediaStreams, ItemFields.MediaSources] }, { signal })).data.Items?.[0];
            return fileLanguages(full && streamsOf(full));
        })
    });
    return query.data || [];
}
