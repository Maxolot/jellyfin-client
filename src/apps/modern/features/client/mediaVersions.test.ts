import type { BaseItemDto, MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';
import { describe, expect, it } from 'vitest';

import { filePlaybackOptions, mediaVersions, versionLabel } from './mediaVersions';

describe('media versions', () => {
    it('prefers a named edition and omits missing and duplicate source IDs', () => {
        const sources = [{ Id: 'extended', Name: '  Édition longue  ' }, { Name: 'Inconnue' }, { Id: 'extended', Name: 'Doublon' }];
        expect(mediaVersions(sources).map(({ id, label }) => [id, label])).toEqual([['extended', 'Édition longue']]);
    });

    it('describes an unnamed version with resolution, HDR, default audio and size', () => {
        const source: MediaSourceInfo = {
            Size: 14500000000,
            DefaultAudioStreamIndex: 4,
            MediaStreams: [
                { Type: 'Video', Width: 3840, Height: 1600, VideoRangeType: 'HDR10Plus' },
                { Type: 'Audio', Index: 1, Language: 'eng', Codec: 'aac' },
                { Type: 'Audio', Index: 4, Language: 'fra', Codec: 'eac3', ChannelLayout: '5.1' }
            ]
        };
        expect(versionLabel(source, 0)).toBe('4K · HDR10+ · Français · EAC3 · 5.1 · 14.5 Go');
        expect(versionLabel({ MediaStreams: [{ Type: 'Video', Width: 2560, Height: 1440, VideoRangeType: 'SDR' }] }, 0)).toBe('1440p · SDR');
        expect(versionLabel({ Id: 'id', Name: 'id' }, 1)).toBe('Version 2');
        expect(versionLabel({ MediaStreams: [{ Type: 'Video', Height: 1080, VideoRangeType: 'DOVIWithHDR10' }] }, 0)).toBe('1080p · Dolby Vision');
    });

    it('resolves audio and subtitles against the chosen source and falls back for a removed version', () => {
        const item: BaseItemDto = { MediaSources: [
            { Id: 'first', MediaStreams: [{ Type: 'Audio', Index: 1, Language: 'fra' }] },
            { Id: 'second', MediaStreams: [{ Type: 'Audio', Index: 4, Language: 'fra' }, { Type: 'Subtitle', Index: 6, Language: 'fra' }] }
        ] };
        expect(filePlaybackOptions(item, { version: 'second', audio: 'fra', subtitle: 'fra' }))
            .toEqual({ mediaSourceId: 'second', audioStreamIndex: 4, subtitleStreamIndex: 6 });
        expect(filePlaybackOptions(item, { version: 'removed', audio: 'fra' })).toEqual({ audioStreamIndex: 1 });
        expect(filePlaybackOptions({ MediaSources: [{ Id: 'single' }] }, { version: 'removed' })).toEqual({});
    });

    it('keeps the selected file even without stream metadata and never borrows another file’s audio index', () => {
        const item: BaseItemDto = { MediaSources: [{ Id: 'first', MediaStreams: [{ Type: 'Audio', Index: 1, Language: 'fra' }] }, { Id: 'second' }] };
        expect(filePlaybackOptions(item, { version: 'second', audio: 'fra', subtitle: 'none' })).toEqual({ mediaSourceId: 'second', subtitleStreamIndex: -1 });
    });
});
