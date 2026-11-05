import { describe, expect, it } from 'vitest';

import { describeAudio, describeSubtitle, describeVideo, formatBitrate, formatClock, formatSize, safeLink } from './mediaInfo';

const stream = (fields: object) => fields as never;

describe('media information', () => {
    it('writes sizes', () => {
        expect(formatSize(8510000000)).toBe('8.5 Go');
        expect(formatSize(700000000)).toBe('700 Mo');
        expect(formatSize(0)).toBeUndefined();
    });
    it('writes bitrates', () => {
        expect(formatBitrate(12400000)).toBe('12.4 Mb/s');
        expect(formatBitrate(640000)).toBe('640 kb/s');
    });
    it('writes positions', () => {
        expect(formatClock(0)).toBe('0:00');
        expect(formatClock(754 * 10000000)).toBe('12:34');
        expect(formatClock(3725 * 10000000)).toBe('1:02:05');
    });
    it('sums up a video track', () => expect(describeVideo(stream({ Width: 3840, Height: 2160, Codec: 'hevc', VideoRangeType: 'DOVI', AverageFrameRate: 23.976, BitRate: 40000000 }))).toBe('3840×2160 · HEVC · DOVI · 23.98 i/s · 40.0 Mb/s'));
    it('hides the ordinary range', () => expect(describeVideo(stream({ Width: 1920, Height: 1080, VideoRangeType: 'SDR' }))).toBe('1920×1080'));
    it('sums up an audio track', () => expect(describeAudio(stream({ Language: 'fre', Codec: 'eac3', ChannelLayout: '5.1' }))).toBe('Français · EAC3 · 5.1'));
    it('admits an unknown language', () => expect(describeAudio(stream({ Language: 'und', Codec: 'aac' }))).toContain('Langue inconnue'));
    it('sums up subtitles', () => expect(describeSubtitle(stream({ Language: 'eng', Codec: 'srt', IsForced: true, IsExternal: true }))).toBe('Anglais · SRT · forcés · externes'));
    it('opens web links only', () => {
        expect(safeLink('https://www.imdb.com/title/tt1')).toBe('https://www.imdb.com/title/tt1');
        expect(safeLink('data:text/html,x')).toBeUndefined();
        expect(safeLink(undefined)).toBeUndefined();
    });
});
