import { afterEach, describe, expect, it } from 'vitest';
import { activeSegment, clampSeek, formatTime, SECOND, trickplayTile } from './model';
import { playerDefaults, playerPreferenceKey, readPlayerPreferences } from './preferences';

afterEach(() => localStorage.clear());
describe('player preferences', () => {
    it('isolates user and server settings and restores choices before rendering', () => {
        const key = playerPreferenceKey('server-a', 'alice');
        localStorage.setItem(key, JSON.stringify({ style: 'minimal', next: 0, skip: 30, previews: false, intro: 'never' }));
        expect(readPlayerPreferences(key)).toMatchObject({ style: 'minimal', next: 0, skip: 30, previews: false, intro: 'never' });
        expect(readPlayerPreferences(playerPreferenceKey('server-a', 'bob'))).toEqual(playerDefaults);
        expect(readPlayerPreferences(playerPreferenceKey('server-b', 'alice'))).toEqual(playerDefaults);
    });
    it('bounds numeric options and rejects malformed saved choices', () => {
        localStorage.setItem('p', JSON.stringify({ size: 500, hideAfter: -1, subtitlePosition: 90, subtitleSize: 0, skip: 99, style: '<style>', accent: 'invalid' }));
        expect(readPlayerPreferences('p')).toMatchObject({ size: 130, hideAfter: 2, subtitlePosition: 25, subtitleSize: 70, skip: 10, style: 'glass', accent: 'white' });
        for (const invalid of ['{', 'null', '[]', 'true']) {
            localStorage.setItem('p', invalid);
            expect(readPlayerPreferences('p')).toEqual(playerDefaults);
        }
    });
});
describe('player timeline', () => {
    it('formats invalid, negative and multi-hour durations', () => {
        expect(formatTime(NaN)).toBe('00:00');
        expect(formatTime(-3)).toBe('00:00');
        expect(formatTime(3661.8)).toBe('1:01:01');
        expect(clampSeek(-20, 120)).toBe(0);
        expect(clampSeek(150, 120)).toBeCloseTo(119.9);
    });
    it('locates supported segments at their start and excludes their end', () => {
        const segment = { Type: 'Intro' as const, StartTicks: 5 * SECOND, EndTicks: 15 * SECOND };
        expect(activeSegment([segment], 5)).toBe(segment);
        expect(activeSegment([segment], 15)).toBeUndefined();
        expect(activeSegment([{ ...segment, EndTicks: 0 }], 6)).toBeUndefined();
    });
    it('finds sprite pages and offsets from milliseconds without off-by-one errors', () => {
        const info = { Width: 160, Height: 90, TileWidth: 5, TileHeight: 5, Interval: 1000 };
        expect(trickplayTile(info, 7)).toEqual({ index: 0, width: 160, height: 90, x: -320, y: -90 });
        expect(trickplayTile(info, 25)?.index).toBe(1);
        expect(trickplayTile({ ...info, Interval: 0 }, 25)).toBeUndefined();
    });
});
