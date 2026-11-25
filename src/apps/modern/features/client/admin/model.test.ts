import type { SystemStorageDto, TaskInfo, UserDto, UserPolicy } from '@jellyfin/sdk/lib/generated-client';
import { describe, expect, it } from 'vitest';

import { disableBlocker, itemTitle, nowPlaying, plural, policyChanges, relativeTime, storageVolumes, taskGroups, transcodeReasons, transcodeSummary, volumeTone, withPolicy } from './model';

const GB = 1024 ** 3;
const folder = (path: string, deviceId: string | undefined, free: number, used: number) => ({ Path: path, DeviceId: deviceId, FreeSpace: free, UsedSpace: used });

describe('administration model', () => {
    it('counts a disk shared by several folders once', () => {
        const storage = {
            Libraries: [
                { Id: 'a', Name: 'Films', Folders: [folder('/media/films', 'disk1', 400 * GB, 600 * GB)] },
                { Id: 'b', Name: 'Séries', Folders: [folder('/media/series', 'disk1', 400 * GB, 600 * GB)] }
            ],
            ProgramDataFolder: folder('/config', 'disk2', 50 * GB, 50 * GB),
            CacheFolder: folder('/cache', 'disk2', 50 * GB, 50 * GB),
            LogFolder: folder('/config/log', undefined, -1, -1)
        } as unknown as SystemStorageDto;
        const volumes = storageVolumes(storage);
        expect(volumes).toHaveLength(2);
        expect(volumes[0]).toMatchObject({ total: 1000 * GB, uses: ['Films', 'Séries'], paths: ['/media/films', '/media/series'] });
        expect(volumes[0].share).toBe(60);
        expect(volumes[1].uses).toEqual(['Données', 'Cache']);
        expect(storageVolumes(undefined)).toEqual([]);
        // Each container mount reports its own device: identical measures are still one disk.
        const mounts = { Libraries: [{ Id: 'a', Name: 'Films', Folders: [folder('/media/films', 'm1', 100 * GB, 400 * GB)] }],
            CacheFolder: folder('/cache', 'm2', 100 * GB, 400 * GB) } as unknown as SystemStorageDto;
        expect(storageVolumes(mounts)).toHaveLength(1);
    });

    it('warns when a disk fills up', () => {
        expect(volumeTone({ share: 50, free: 500 * GB })).toBe('ok');
        expect(volumeTone({ share: 88, free: 200 * GB })).toBe('warning');
        expect(volumeTone({ share: 50, free: 10 * GB })).toBe('error');
    });

    it('explains a transcode in French', () => {
        const info = { IsVideoDirect: false, VideoCodec: 'h264', IsAudioDirect: true, HardwareAccelerationType: 'qsv', TranscodeReasons: ['VideoCodecNotSupported', 'Novel'] } as never;
        expect(transcodeSummary(info)).toBe('vidéo convertie en H264 · audio d’origine · accélération QSV');
        expect(transcodeReasons(info)).toEqual(['codec vidéo non pris en charge', 'Novel']);
        expect(transcodeSummary(undefined)).toBeUndefined();
    });

    it('lists only sessions that play something, latest first', () => {
        const sessions = [
            { Id: '1', LastActivityDate: '2026-11-24T10:00:00Z', NowPlayingItem: { Name: 'A' } },
            { Id: '2', LastActivityDate: '2026-11-24T11:00:00Z' },
            { Id: '3', LastActivityDate: '2026-11-24T12:00:00Z', NowPlayingItem: { Name: 'B' } }
        ];
        expect(nowPlaying(sessions).map(session => session.Id)).toEqual(['3', '1']);
    });

    it('names an episode with its series and number', () => {
        expect(itemTitle({ Type: 'Episode', SeriesName: 'Severance', ParentIndexNumber: 1, IndexNumber: 2, Name: 'Pilote' })).toBe('Severance · S1 · É2 · Pilote');
        expect(itemTitle({ Type: 'Movie', Name: 'Dune', ProductionYear: 2021 })).toBe('Dune · 2021');
    });

    it('groups tasks by category with running ones first', () => {
        const tasks: TaskInfo[] = [
            { Id: 'a', Name: 'Nettoyer', Category: 'Maintenance', State: 'Idle' },
            { Id: 'b', Name: 'Analyser', Category: 'Bibliothèque', State: 'Idle' },
            { Id: 'c', Name: 'Aperçus', Category: 'Bibliothèque', State: 'Running' },
            { Id: 'd', Name: 'Caché', Category: 'Bibliothèque', IsHidden: true }
        ];
        expect(taskGroups(tasks).map(group => [group.category, group.tasks.map(task => task.Id)])).toEqual([['Bibliothèque', ['c', 'b']], ['Maintenance', ['a']]]);
    });

    it('never disables the account in use or the last active administrator', () => {
        const admin = { Id: 'admin', Policy: { IsAdministrator: true, IsDisabled: false } } as UserDto;
        const other = { Id: 'other', Policy: { IsAdministrator: false } } as UserDto;
        const users = [admin, other];
        expect(disableBlocker(admin, 'admin', users)).toMatch(/utilisez/);
        expect(disableBlocker(admin, 'someone', users)).toMatch(/dernier administrateur/);
        expect(disableBlocker(other, 'admin', users)).toBeUndefined();
        const second = { Id: 'second', Policy: { IsAdministrator: true, IsDisabled: false } } as UserDto;
        expect(disableBlocker(admin, 'second', [admin, second])).toBeUndefined();
    });

    it('saves only what the form changed, on top of the server copy', () => {
        const start = { EnableRemoteAccess: true, EnableAllFolders: false, EnabledFolders: ['a'], AuthenticationProviderId: 'x', PasswordResetProviderId: 'y' } as UserPolicy;
        const edited = { ...start, EnableRemoteAccess: false, EnabledFolders: ['a', 'b'] };
        const changes = policyChanges(start, edited);
        expect(changes).toEqual({ EnableRemoteAccess: false, EnabledFolders: ['a', 'b'] });
        // Changed meanwhile on the server: kept.
        const server = { ...start, MaxActiveSessions: 3, EnableContentDownloading: true } as UserPolicy;
        expect(withPolicy(server, changes)).toMatchObject({ MaxActiveSessions: 3, EnableContentDownloading: true, EnableRemoteAccess: false, EnabledFolders: ['a', 'b'], AuthenticationProviderId: 'x' });
        expect(policyChanges(start, { ...start })).toEqual({});
    });

    it('writes counts and times in French', () => {
        expect(plural(1, 'compte')).toBe('1 compte');
        expect(plural(3, 'compte')).toBe('3 comptes');
        const now = Date.parse('2026-11-24T12:00:00Z');
        expect(relativeTime('2026-11-24T11:59:30Z', now)).toBe('à l’instant');
        expect(relativeTime('2026-11-24T11:45:00Z', now)).toBe('il y a 15 min');
        expect(relativeTime('2026-11-24T09:00:00Z', now)).toBe('il y a 3 h');
        expect(relativeTime(undefined, now)).toBe('jamais');
    });
});
