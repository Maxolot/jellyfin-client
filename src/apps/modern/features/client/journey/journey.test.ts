import { describe, expect, it } from 'vitest';

import type { RequestProgress } from '../requests/model';
import { buildJourney, durationLabel, fitsIn, relativeDay } from './journey';

const now = Date.parse('2026-11-26T20:00:00');
const day = 864e5;
const request = (id: number, stage: RequestProgress['stage'], extra: Partial<RequestProgress> = {}): RequestProgress => ({
    id, type: 'movie', tmdb: id, title: `Demande ${id}`, ultra: false, stage, updated: new Date(now - day).toISOString(), seasons: [], active: stage !== 'available', ...extra
});
const empty = { resume: [], next: [], requests: [], upcoming: [], saved: [], history: [] };

describe('journey', () => {
    it('puts arrived requests and new episodes before resumes, then ordinary next episodes', () => {
        const entries = buildJourney({ ...empty,
            resume: [{ Id: 'm1', Name: 'Film', Type: 'Movie', RunTimeTicks: 60 * 600000000, UserData: { Key: 'm1', PlaybackPositionTicks: 20 * 600000000 } }],
            next: [
                { Id: 'e1', SeriesId: 's1', SeriesName: 'Ancienne', Name: 'Ép', Type: 'Episode', PremiereDate: '2025-01-01' },
                { Id: 'e2', SeriesId: 's2', SeriesName: 'Neuve', Name: 'Ép', Type: 'Episode', PremiereDate: new Date(now - 2 * day).toISOString() }
            ],
            requests: [request(1, 'available')]
        }, now);
        expect(entries.filter(entry => entry.stage === 'ready').map(entry => entry.kind)).toEqual(['arrived', 'new', 'resume', 'next']);
        expect(entries.find(entry => entry.kind === 'resume')?.reason).toBe('Il te reste 40 min');
        expect(entries.find(entry => entry.kind === 'new')?.reason).toBe('Nouvel épisode, sorti il y a 2 jours');
    });

    it('keeps active and blocked requests on the way, and drops old or removed ones', () => {
        const entries = buildJourney({ ...empty, requests: [
            request(1, 'downloading', { percent: 42 }), request(2, 'declined'), request(3, 'removed'),
            request(4, 'available', { updated: new Date(now - 40 * day).toISOString() })
        ] }, now);
        expect(entries.map(entry => [entry.key, entry.stage, entry.tone])).toEqual([['request:1', 'coming', undefined], ['request:2', 'coming', 'alert']]);
        expect(entries[0].reason).toContain('42 %');
    });

    it('lists a title once, at its furthest stage', () => {
        const series = { Id: 'e1', SeriesId: 's1', SeriesName: 'Série', Name: 'Ép', Type: 'Episode' as const };
        const entries = buildJourney({ ...empty, next: [series], saved: [{ Id: 's1', Name: 'Série', Type: 'Series' }] }, now);
        expect(entries.map(entry => entry.stage)).toEqual(['ready']);
    });

    it('dates what I filed in my folders', () => {
        const entries = buildJourney({ ...empty, saved: [{ Id: 'AB-CD', Name: 'Classique', Type: 'Movie' }], filed: { abcd: new Date(now - 2 * day).toISOString() } }, now);
        expect(entries[0]).toMatchObject({ stage: 'saved', reason: 'Mis de côté il y a 2 jours' });
    });

    it('says when, simply', () => {
        expect(relativeDay(now - 1000, now)).toBe('aujourd’hui');
        expect(relativeDay(now - day, now)).toBe('hier');
        // The start of a day two days ago is « il y a 2 jours », like any other moment of that day.
        const twoDaysAgo = new Date(now - 2 * day);
        twoDaysAgo.setHours(0, 0, 0, 0);
        expect(relativeDay(twoDaysAgo.getTime(), now)).toBe('il y a 2 jours');
        expect(relativeDay(twoDaysAgo.getTime() + 15 * 3600e3, now)).toBe('il y a 2 jours');
        expect(durationLabel(95)).toBe('1 h 35');
        expect(fitsIn({ key: 'a', stage: 'ready', kind: 'resume', title: '', reason: '', minutes: 50 }, 30)).toBe(false);
    });
});
