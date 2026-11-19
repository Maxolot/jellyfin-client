import type { BaseItemDto, MediaSourceInfo, MediaStream } from '@jellyfin/sdk/lib/generated-client';

import { describeAudio, formatSize } from './mediaInfo';
import { resolveTracks, type TrackChoice } from './trackChoice';

function resolution(video: MediaStream | undefined) {
    const width = video?.Width || 0;
    const height = video?.Height || 0;
    if (width >= 7600 || height >= 4320) return '8K';
    if (width >= 3800 || height >= 2160) return '4K';
    if (width >= 1900 && width <= 2048 && height >= 800 && height <= 1080) return '1080p';
    if (height > 0) return `${height}p`;
    return undefined;
}

function dynamicRange(video: MediaStream | undefined) {
    const range = video?.VideoRangeType;
    if (range?.startsWith('DOVI') && range !== 'DOVIInvalid') return 'Dolby Vision';
    if (range === 'HDR10Plus') return 'HDR10+';
    if (range === 'HDR10' || range === 'HLG' || range === 'SDR') return range;
    if (video?.VideoRange === 'HDR' || video?.VideoRange === 'SDR') return video.VideoRange;
    return undefined;
}

export function versionDescription(source: MediaSourceInfo, index: number) {
    const streams = source.MediaStreams || [];
    const video = streams.find(stream => stream.Type === 'Video');
    const resolutionLabel = resolution(video);
    const range = dynamicRange(video);
    const picture = [resolutionLabel, range === 'SDR' ? undefined : range].filter(Boolean).join(' ');
    const name = source.Name?.trim();
    const named = !!name && name !== source.Id;
    const audio = streams.filter(stream => stream.Type === 'Audio');
    const lead = audio.find(stream => stream.Index != null && stream.Index === source.DefaultAudioStreamIndex)
        || audio.find(stream => stream.IsDefault) || audio[0];
    return {
        label: (named && name) || picture || `Version ${index + 1}`,
        detail: [named && picture, lead && describeAudio({ ...lead, Title: undefined }), formatSize(source.Size)].filter(Boolean).join(' · ')
    };
}

export function mediaVersions(sources: MediaSourceInfo[] | null | undefined) {
    const distinct = new Map<string, MediaSourceInfo>();
    for (const source of sources || []) {
        if (source.Id && !distinct.has(source.Id)) distinct.set(source.Id, source);
    }
    return [...distinct].map(([id, source], index) => ({ id, source, ...versionDescription(source, index) }));
}

/** Playback negotiates a source only if the selected ID still belongs to this item. */
export function filePlaybackOptions(item: BaseItemDto, choice: TrackChoice) {
    const chosen = choice.version && item.MediaSources?.find(source => source.Id === choice.version);
    const streams = chosen ? chosen.MediaStreams : item.MediaSources?.[0]?.MediaStreams || item.MediaStreams;
    return { ...(chosen ? { mediaSourceId: chosen.Id } : {}), ...resolveTracks(streams, choice) };
}
