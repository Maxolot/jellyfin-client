import { describe, expect, it } from 'vitest';

import { availableMinutes, deadlineTargets, defaultCriteria, readTonight, suggestTonight, tasteFrom, tonightStateKey, writeTonight, type TonightTitle } from './tonight/model';

const now = new Date(2026, 10, 19, 22, 30).getTime();
const movie = (id: string, genre: string, minutes = 100): TonightTitle =>
    ({ Id: id, Name: id, Type: 'Movie', Genres: [genre], RunTimeTicks: minutes * 6e8 });
const select = (items: TonightTitle[], options: Partial<Parameters<typeof suggestTonight>[0]> = {}) => suggestTonight({
    items, criteria: defaultCriteria, now, seed: 0, profile: new Map(), hidden: new Set(), recent: new Set(),
    started: new Set(), filed: new Map(), semantic: new Map(), ...options
});
const ids = (result: ReturnType<typeof select>) => result.ideas.map(({ item }) => item.Id);

describe('Ce soir', () => {
    it('uses personal scores, directors, watched history and filing age with readable reasons', () => {
        const director = [{ Name: 'C. Écran', Type: 'Director' as const }];
        const positive = { ...movie('Les ombres', 'Thriller'), People: director, UserData: { Key: 'fixture', Rating: 10, Played: true } };
        const negative = { ...movie('Rêve', 'Comédie'), UserData: { Key: 'fixture', Rating: 2, Played: true } };
        const good = { ...movie('good', 'Thriller'), People: director };
        const poor = movie('poor', 'Comédie');
        const saved = movie('saved', 'Aventure');
        const result = select([positive, negative, good, poor, saved], {
            profile: tasteFrom([positive, negative]), filed: new Map([['saved', now - 100 * 864e5]])
        });
        expect(ids(result)).toEqual(['good', 'saved', 'poor']);
        expect(result.ideas[0].reasons).toContain('Parce que vous avez noté Les ombres 5 ★');
        expect(result.ideas[1].reasons).toContain('Dans votre liste depuis 3 mois');
    });

    it('excludes watched, resumed, poorly rated public titles and series started from an episode', () => {
        const fresh = { ...movie('fresh', 'Drame'), Type: 'Series' as const, episodes: 6, episodeMinutes: 45 };
        const result = select([
            fresh, { ...fresh, Id: 'started' }, { ...movie('watched', 'Mystère'), UserData: { Key: 'fixture', Played: true } },
            { ...movie('resume', 'Mystère'), UserData: { Key: 'fixture', PlaybackPositionTicks: 10 } }, { ...movie('poor', 'Drame'), CommunityRating: 3 },
            movie('hidden', 'Action')
        ], { started: new Set(['started']), hidden: new Set(['hidden']) });
        expect(ids(result)).toEqual(['fresh']);
        expect(result.ideas[0].minutes).toBe(45);
    });

    it('calculates clocks through midnight and falls back to titles finishing soonest', () => {
        expect(deadlineTargets(now).map(({ label }) => label)).toEqual(['23 h', '23 h 30', 'minuit', '0 h 30']);
        expect(availableMinutes(0, now)).toBe(90);
        const criteria = { ...defaultCriteria, deadline: 23 * 60 };
        const items = [movie('near', 'Drame', 45), movie('away', 'Action', 85)];
        expect(select(items, { criteria })).toMatchObject({ earliest: 45 });
        expect(ids(select(items, { criteria }))).toEqual(['near']);
        expect(ids(select([...items, movie('fits', 'Mystère', 25)], { criteria }))).toEqual(['fits']);
    });

    it('uses a semantic match or keyword, diversifies genres, and skips recent suggestions when possible', () => {
        const items = [movie('recent', 'Drame'), movie('semantic', 'Drame'), movie('keyword', 'Aventure'), movie('other', 'Western')];
        items[2].Overview = 'Des astéroïdes masquent le ciel.';
        const result = select(items, { criteria: { ...defaultCriteria, prompt: 'astéroïdes' }, recent: new Set(['recent']),
            semantic: new Map([['semantic', { itemId: 'semantic', score: 0.93, reason: 'Ambiance proche' }]]) });
        expect(ids(result)).toEqual(['semantic', 'keyword', 'other']);
        expect(result.ideas[0].reasons).toContain('Ambiance proche');
        expect(result.ideas[1].reasons).toContain('asteroides');
    });

    it('requires opt-in for external ideas and keeps only one per draw', () => {
        const items = ['seerr-movie-10', 'seerr-tv-20', 'a', 'b'].map(id => movie(id, id));
        expect(ids(select(items))).toHaveLength(2);
        expect(ids(select(items, { criteria: { ...defaultCriteria, includeRequests: true } })).filter(id => id?.startsWith('seerr'))).toHaveLength(1);
    });

    it('restricts a joint draw to ids offered by the server and uses its aggregate reason', () => {
        const items = [movie('private', 'Action'), movie('prior', 'Aventure'), movie('both', 'Science-fiction')];
        const joint = new Map([
            ['both', { itemId: 'both', position: 0, reason: 'Pour vous deux : de la science-fiction' }],
            ['prior', { itemId: 'prior', position: 1, reason: 'Pour vous deux : une découverte commune' }]
        ]);
        const result = select(items, { joint, started: new Set(['prior']) });
        expect(ids(result)).toEqual(['both']);
        expect(result.ideas[0].reasons[0]).toBe('Pour vous deux : de la science-fiction');
    });

    it('stores criteria and recent ideas separately per profile', () => {
        const first = tonightStateKey('server', 'a');
        const second = tonightStateKey('server', 'b');
        writeTonight(first, { criteria: { ...defaultCriteria, energy: 'engaged' }, recent: ['a', 'b'] });
        expect(readTonight(first)).toMatchObject({ criteria: { energy: 'engaged' }, recent: ['a', 'b'] });
        expect(readTonight(second)).toMatchObject({ criteria: { energy: 'rest' }, recent: [] });
    });
});
