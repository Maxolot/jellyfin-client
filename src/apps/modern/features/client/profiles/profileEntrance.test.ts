import { afterEach, describe, expect, it } from 'vitest';

import { flightTransform, takeEntrance } from './profileEntrance';

const box = { left: 320, top: 210, width: 160, height: 160 };
const key = 'client-profile-entrance';

afterEach(() => sessionStorage.clear());

describe('profile entrance', () => {
    it('matches the measured button even when its dimensions are rectangular', () => {
        expect(flightTransform(box, { left: 18, top: 14, width: 40, height: 44 }))
            .toBe('translate(-302px, -196px) scale(0.25, 0.275)');
    });

    it('consumes a single valid flight and skips expired or invalid geometry', () => {
        const saved = { box, letter: 'A', at: Date.now() };
        sessionStorage.setItem(key, JSON.stringify(saved));
        expect(takeEntrance()).toMatchObject({ box, letter: 'A' });
        expect(takeEntrance()).toBeUndefined();
        sessionStorage.setItem(key, JSON.stringify({ ...saved, at: Date.now() - 21000 }));
        expect(takeEntrance()).toBeUndefined();
        sessionStorage.setItem(key, JSON.stringify({ ...saved, box: { ...box, width: 0 } }));
        expect(takeEntrance()).toBeUndefined();
    });
});
