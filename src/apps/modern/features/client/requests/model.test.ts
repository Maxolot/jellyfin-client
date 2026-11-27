import { describe, expect, it } from 'vitest';

import { latestRequest, requestEta, requestReason, requestRing, requestStep, type RequestProgress } from './model';

const later = '2099-05-03T19:20:00';
const transfer: RequestProgress = { id: 23, type: 'movie', tmdb: 123, title: 'Fixture', ultra: false, stage: 'downloading',
    updated: '2099-05-03T14:00:00', seasons: [], etaFrom: '2099-05-03T19:10:00', etaTo: later,
    percent: 45, active: true };

describe('request progress display', () => {
    it('uses a bounded local-time estimate for transfers only', () => {
        const now = new Date('2099-05-03T19:01:00').getTime();
        expect(requestEta(transfer, now)).toBe('Arrivée estimée entre 19:10 et 19:20');
        expect(requestEta({ ...transfer, stage: 'blocked' }, now)).toBeUndefined();
        expect(requestEta(transfer, new Date(later).getTime())).toBeUndefined();
        expect(requestEta({ ...transfer, etaTo: transfer.etaFrom }, now)).toBeUndefined();
    });

    it('locates a stalled import and shows a reason without upstream technical messages', () => {
        const blocked: RequestProgress = { ...transfer, stage: 'blocked', reason: 'importFailed' };
        expect(requestStep(blocked)).toBe(4);
        expect(requestReason(blocked)).toBe('Le téléchargement est terminé, mais son import a échoué.');
        expect(requestReason({ ...blocked, reason: 'private service output' })).toBeUndefined();
    });

    it('matches the type and prefers active requests for the same title', () => {
        const old: RequestProgress = { ...transfer, id: 21, stage: 'available', active: false };
        expect(latestRequest([old, transfer], { id: 123, type: 'movie' })).toBe(transfer);
        expect(latestRequest([old, transfer], { id: 123, type: 'tv' })).toBeUndefined();
        expect(requestRing([old, transfer])).toEqual({ count: 1, percent: 45 });
        expect(requestRing([old])).toBeUndefined();
    });
});
