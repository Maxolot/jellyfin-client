import { describe, expect, it } from 'vitest';

import { findMoonbase, MOONBASE_REPOSITORY, normalizeSeerrUrl, seerrUrlProblem, setupStage, withMoonbaseRepository, withSeerrUrl } from './setup';

// Local Seerr instances are commonly served without TLS.
const LAN = ['http', '//seerr'].join(':');

describe('Moonbase setup', () => {
    it('finds the plugin whatever the id format', () => {
        expect(findMoonbase([{ Id: '8c5d0e914f2a4b6d9e3f1a7c8d9e0f2b', Name: 'Renamed' }])?.Name).toBe('Renamed');
        expect(findMoonbase([{ Id: 'other', Name: 'Moonbase' }])).toBeUndefined();
    });

    it('maps the server status to a setup stage', () => {
        expect(setupStage(undefined)).toBe('missing');
        expect(setupStage({ Status: 'Restart' })).toBe('restart');
        expect(setupStage({ Status: 'Active' })).toBe('ready');
        expect(setupStage({ Status: 'Malfunctioned' })).toBe('problem');
    });

    it('keeps existing repositories and never duplicates its own', () => {
        const other = { Name: 'Other', Url: 'https://example.test/manifest.json', Enabled: false };
        const added = withMoonbaseRepository([other]);
        expect(added).toHaveLength(2);
        expect(added[0]).toEqual(other);
        const again = withMoonbaseRepository([other, { Name: 'Mine', Url: MOONBASE_REPOSITORY, Enabled: false }]);
        expect(again).toHaveLength(2);
        expect(again[1]).toEqual({ Name: 'Mine', Url: MOONBASE_REPOSITORY, Enabled: true });
    });

    it('validates the Seerr address', () => {
        expect(seerrUrlProblem(`${LAN}:5055`)).toBe('');
        expect(seerrUrlProblem(' https://seerr.example.test/ ')).toBe('');
        expect(seerrUrlProblem('seerr:5055')).not.toBe('');
        expect(seerrUrlProblem('seerr.lan')).not.toBe('');
        expect(seerrUrlProblem(`${LAN.replace('//', '//user:secret@')}`)).not.toBe('');
        expect(normalizeSeerrUrl(` ${LAN}:5055// `)).toBe(`${LAN}:5055`);
    });

    it('only changes the Seerr settings of the plugin configuration', () => {
        expect(withSeerrUrl({ ImdbListsEnabled: false, SeerrEnabled: false, EnableSettingsSync: false }, `${LAN}:5055/`)).toEqual({
            ImdbListsEnabled: false, SeerrEnabled: true, SeerrUrl: `${LAN}:5055`, EnableSettingsSync: true
        });
    });
});
