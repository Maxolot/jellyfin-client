import { beforeEach, describe, expect, it } from 'vitest';

import { dropToken, forgetProfile, markProfileChosen, profileChosen, profileTone, readProfiles, rememberProfile } from './profileStore';

const anna = { userId: 'a', name: 'Anna', token: 't-a' };
const ben = { userId: 'b', name: 'Ben', token: 't-b' };

describe('saved profiles', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('keeps people per server', () => {
        rememberProfile('s1', anna);
        expect(readProfiles('s1')).toEqual([anna]);
        expect(readProfiles('s2')).toEqual([]);
    });

    it('updates a person in place', () => {
        rememberProfile('s', anna);
        rememberProfile('s', ben);
        rememberProfile('s', { ...anna, token: 'new' });
        expect(readProfiles('s').map(entry => entry.name)).toEqual(['Anna', 'Ben']);
        expect(readProfiles('s')[0].token).toBe('new');
    });

    it('stays bounded', () => {
        for (let index = 0; index < 12; index++) rememberProfile('s', { userId: `u${index}`, name: `U${index}` });
        expect(readProfiles('s')).toHaveLength(8);
    });

    it('forgets a person', () => {
        rememberProfile('s', anna);
        forgetProfile('s', 'a');
        expect(readProfiles('s')).toEqual([]);
    });

    it('keeps the person but not the session when it expired', () => {
        rememberProfile('s', anna);
        dropToken('s', 'a');
        expect(readProfiles('s')).toEqual([{ userId: 'a', name: 'Anna' }]);
    });

    it('survives a damaged store', () => {
        localStorage.setItem('client-profiles-s', '{oops');
        expect(readProfiles('s')).toEqual([]);
    });

    it('asks once per visit', () => {
        expect(profileChosen()).toBe(false);
        markProfileChosen();
        expect(profileChosen()).toBe(true);
    });

    it('gives one person one colour', () => expect(profileTone('abc')).toBe(profileTone('abc')));
});
