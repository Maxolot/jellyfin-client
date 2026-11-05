import { describe, expect, it } from 'vitest';

import { accountKey, decideSync, entryKey, estimateBytes, formatBytes, nextToDownload, originalMime, progressOf, qualityOptions, stoppedAt, storageRoom, type OfflineEntry } from './model';

const TICKS = 10000000;
const entry = (fields: Partial<OfflineEntry>): OfflineEntry => ({ key: 'k', account: 'a', serverId: 's', userId: 'u', itemId: 'i', type: 'Movie', name: 'Film', quality: 'standard', mediaSourceId: 'm', runTimeTicks: 0, estimatedBytes: 100, bytes: 0, segmentsDone: 0, segmentsTotal: 0, state: 'queued', hasPoster: false, hasSubtitles: false, createdAt: 0, position: { ticks: 0, played: false, updatedAt: 0, syncedAt: 0 }, ...fields });

describe('keys', () => {
    it('ignores dashes and case in identifiers', () => {
        expect(accountKey('AB-CD', 'Ef-01')).toBe('abcd:ef01');
        expect(entryKey('abcd:ef01', 'X-Y')).toBe('abcd:ef01:xy');
    });
});

describe('sizes', () => {
    it('estimates a transcoded film from its length', () => expect(estimateBytes('standard', 3600 * TICKS)).toBe(Math.round((4000000 + 192000) * 3600 / 8)));
    it('keeps the real size of an original', () => expect(estimateBytes('original', 3600 * TICKS, 4200000000)).toBe(4200000000));
    it('writes sizes in French', () => {
        expect(formatBytes(4200000000)).toBe('4,2 Go');
        expect(formatBytes(750000000)).toBe('750 Mo');
    });
});

describe('original files', () => {
    const mp4 = { Container: 'mp4', Size: 9, MediaStreams: [{ Type: 'Video', Codec: 'h264', Width: 1920 }, { Type: 'Audio', Codec: 'aac' }] };
    it('describes a playable MP4', () => expect(originalMime(mp4)).toBe('video/mp4; codecs="avc1.640028, mp4a.40.2"'));
    it('refuses a Matroska file', () => expect(originalMime({ ...mp4, Container: 'mkv' })).toBeUndefined());
    it('refuses an unknown codec', () => expect(originalMime({ ...mp4, MediaStreams: [{ Type: 'Video', Codec: 'mpeg2video' }] })).toBeUndefined());
});

describe('qualityOptions', () => {
    const source = { Container: 'mp4', Size: 2000000000, MediaStreams: [{ Type: 'Video', Codec: 'h264', Width: 1920 }, { Type: 'Audio', Codec: 'aac' }] };
    const all = { download: true, transcode: true };
    it('offers the original first when the browser can play it', () => expect(qualityOptions(source, 3600 * TICKS, all, () => true).map(option => option.quality)).toEqual(['original', 'high', 'standard', 'light']));
    it('only offers conversions when the browser cannot play the file', () => expect(qualityOptions(source, 3600 * TICKS, all, () => false).map(option => option.quality)).toEqual(['high', 'standard', 'light']));
    it('offers nothing without the right to download', () => expect(qualityOptions(source, 3600 * TICKS, { download: false, transcode: true }, () => true)).toEqual([]));
    it('does not offer more than the film has', () => {
        const small = { ...source, MediaStreams: [{ Type: 'Video', Codec: 'h264', Width: 640 }] };
        expect(qualityOptions(small, 3600 * TICKS, all, () => false).map(option => option.quality)).toEqual(['light']);
    });
});

describe('storage', () => {
    it('keeps a margin', () => {
        expect(storageRoom({ quota: 100000, usage: 0 }, 96000).fits).toBe(false);
        expect(storageRoom({ quota: 100000, usage: 0 }, 90000).fits).toBe(true);
    });
    it('counts what is already reserved', () => expect(storageRoom({ quota: 100000, usage: 90000 }, 6000, 3000).fits).toBe(true));
});

describe('queue', () => {
    it('continues the running download first', () => {
        const list = [entry({ key: 'old', createdAt: 1 }), entry({ key: 'running', state: 'downloading', createdAt: 5 })];
        expect(nextToDownload(list, 'a')?.key).toBe('running');
    });
    it('then takes the oldest waiting one of this account', () => {
        const list = [entry({ key: 'other', account: 'b', createdAt: 0 }), entry({ key: 'second', createdAt: 2 }), entry({ key: 'first', createdAt: 1 }), entry({ key: 'paused', state: 'paused' })];
        expect(nextToDownload(list, 'a')?.key).toBe('first');
    });
    it('measures progress by segment for conversions', () => expect(progressOf(entry({ segmentsDone: 3, segmentsTotal: 12 }))).toBe(0.25));
});

describe('positions', () => {
    const base = { ticks: 0, played: false, updatedAt: 0, syncedAt: 0 };
    it('counts the end of a film as seen', () => expect(stoppedAt(95 * TICKS, 100 * TICKS, 10, base)).toEqual({ ticks: 0, played: true, updatedAt: 10, syncedAt: 0 }));
    it('keeps a position in the middle', () => expect(stoppedAt(40 * TICKS, 100 * TICKS, 10, base).ticks).toBe(40 * TICKS));
    it('has nothing to send once in step', () => expect(decideSync({ ...base, updatedAt: 5, syncedAt: 5 }, {})).toBe('none'));
    it('sends a position watched offline', () => expect(decideSync({ ...base, updatedAt: Date.parse('2026-11-05T10:00:00Z') }, { LastPlayedDate: '2026-11-04T10:00:00Z' })).toBe('push'));
    it('never overwrites a newer position from another device', () => expect(decideSync({ ...base, updatedAt: Date.parse('2026-11-05T10:00:00Z') }, { LastPlayedDate: '2026-11-05T12:00:00Z' })).toBe('pull'));
});
