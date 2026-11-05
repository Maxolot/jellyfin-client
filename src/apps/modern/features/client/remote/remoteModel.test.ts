import { describe, expect, it } from 'vitest';

import { groupStateLabel, livePosition, participantsLabel, syncPlayRights, targetKind, targetLabel, videoTargets, type PlayTarget } from './remoteModel';

const target = (fields: Partial<PlayTarget>): PlayTarget => ({ id: 'x', name: 'Salon', playerName: 'Remote Control', isLocalPlayer: false, ...fields });

describe('play targets', () => {
    it('keeps only other devices that show video', () => {
        const list = [target({ id: 'a' }), target({ id: 'b', playableMediaTypes: ['Audio'] }), target({ id: 'c', isLocalPlayer: true }), target({ id: 'd', playableMediaTypes: ['Audio', 'Video'] }), target({ id: 'cast', playerName: 'Chromecast', playableMediaTypes: ['Video'] })];
        expect(videoTargets(list).map(entry => entry.id)).toEqual(['a', 'd']);
    });
    it('names a device with its application', () => {
        expect(targetLabel({ name: 'Salon', appName: 'Jellyfin Android TV' })).toBe('Salon · Jellyfin Android TV');
        expect(targetLabel({ name: 'Chrome', appName: 'Chrome' })).toBe('Chrome');
    });
    it('guesses the kind of device', () => {
        expect(targetKind({ name: 'Salon', appName: 'Jellyfin Android TV' })).toBe('tv');
        expect(targetKind({ name: 'iPhone', appName: 'Swiftfin' })).toBe('phone');
        expect(targetKind({ name: 'Firefox', appName: 'Jellyfin Web' })).toBe('computer');
    });
});

describe('position of a remote device', () => {
    it('moves on while playing', () => expect(livePosition(10000000, 1000, false, 3000)).toBe(30000000));
    it('stays still while paused', () => expect(livePosition(10000000, 1000, true, 3000)).toBe(10000000));
    it('never goes beyond the end', () => expect(livePosition(10000000, 1000, false, 60000, 20000000)).toBe(20000000));
});

describe('watching together', () => {
    it('reads the account rights', () => {
        expect(syncPlayRights('CreateAndJoinGroups')).toEqual({ join: true, create: true });
        expect(syncPlayRights('JoinGroups')).toEqual({ join: true, create: false });
        expect(syncPlayRights(undefined)).toEqual({ join: false, create: false });
    });
    it('says what the group is doing', () => {
        expect(groupStateLabel('Playing')).toMatch(/lecture/);
        expect(groupStateLabel('Waiting')).toMatch(/Attente/);
        expect(groupStateLabel('Idle')).toMatch(/lancez un titre/);
    });
    it('lists participants briefly', () => {
        expect(participantsLabel(['Anna'])).toBe('Anna');
        expect(participantsLabel(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C et 2 autres');
        expect(participantsLabel([])).toMatch(/Personne/);
    });
});
