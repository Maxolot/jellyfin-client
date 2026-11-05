import type { Api } from '@jellyfin/sdk';
import type { BaseItemDto, MediaStream } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

import { clientRequest } from './session';
import { readTrackChoice, resolveTracks, trackOptions, type TrackOption } from './trackChoice';

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

type FileTracks = { languages: FileLanguage[]; audio: TrackOption[]; subtitles: TrackOption[] };
const NO_TRACKS: FileTracks = { languages: [], audio: [], subtitles: [] };
const streamFields = [ItemFields.MediaStreams, ItemFields.MediaSources];

function merged(lists: TrackOption[][]) {
    const options = new Map<string, TrackOption>();
    for (const option of lists.flat()) options.set(option.key, option);
    return [...options.values()];
}

/** What the files of a film or series offer: its language tags, and the languages one can ask for. */
export function useFileTracks(item: BaseItemDto): FileTracks {
    const { api, user } = useApi();
    const kind = item.Type;
    const enabled = !!api && !!user?.Id && !!item.Id && (kind === BaseItemKind.Movie || kind === BaseItemKind.Series || kind === BaseItemKind.Episode);
    const query = useQuery({
        queryKey: ['Client', api?.basePath, user?.Id, 'FileTracks', item.Id], enabled, staleTime: 600000, retry: false,
        queryFn: ({ signal }) => clientRequest(async (): Promise<FileTracks> => {
            if (kind === BaseItemKind.Series) {
                const episodes = (await getLibraryApi(api!).getItems({ userId: user!.Id, parentId: item.Id, recursive: true,
                    includeItemTypes: [BaseItemKind.Episode], fields: streamFields, limit: 120 }, { signal })).data.Items || [];
                const files = episodes.map(streamsOf);
                return { languages: commonLanguages(files.map(fileLanguages)),
                    audio: merged(files.map(file => trackOptions(file, 'Audio'))), subtitles: merged(files.map(file => trackOptions(file, 'Subtitle'))) };
            }
            const full = (await getLibraryApi(api!).getItems({ userId: user!.Id, ids: [item.Id!], fields: streamFields }, { signal })).data.Items?.[0];
            const streams = full && streamsOf(full);
            return { languages: fileLanguages(streams), audio: trackOptions(streams, 'Audio'), subtitles: trackOptions(streams, 'Subtitle') };
        })
    });
    return query.data || NO_TRACKS;
}

export function useLocalLanguages(item: BaseItemDto): FileLanguage[] {
    return useFileTracks(item).languages;
}

/** The track numbers to start this very file with, from the languages chosen on its film or series. */
export async function chosenTracks(api: Api | undefined, userId: string | undefined, item: BaseItemDto) {
    const choice = readTrackChoice(api?.basePath, userId, item.SeriesId || item.Id);
    if (!api || !userId || !item.Id || (!choice.audio && !choice.subtitle && !choice.version)) return {};
    try {
        const full = (await getLibraryApi(api).getItems({ userId, ids: [item.Id], fields: streamFields })).data.Items?.[0];
        if (!full) return {};
        // A version only exists on the film it was chosen for; episodes keep their own.
        const source = full.MediaSources?.find(entry => entry.Id === choice.version);
        return { ...(source?.Id ? { mediaSourceId: source.Id } : {}), ...resolveTracks(source?.MediaStreams || streamsOf(full), choice) };
    } catch {
        // Playing with the account's preferences beats not playing.
        return {};
    }
}
