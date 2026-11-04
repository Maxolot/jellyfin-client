import { afterEach, describe, expect, it, vi } from 'vitest';

import { artworkUrl } from './artwork';

const base = 'https://media.example.test';
afterEach(() => vi.unstubAllGlobals());

describe('versioned, usage-sized artwork', () => {
    it('retains sufficient poster and logo resolution on high-density 4K layouts', () => {
        vi.stubGlobal('window', { innerWidth: 3840, devicePixelRatio: 2 });
        const poster = new URL(artworkUrl(base, { Id: 'film' }));
        const logo = new URL(artworkUrl(base, { Id: 'film', ImageTags: { Logo: 'logo' } }, 'logo'));
        expect(Number(poster.searchParams.get('maxWidth'))).toBeGreaterThanOrEqual(1200);
        expect(Number(logo.searchParams.get('maxWidth'))).toBeGreaterThanOrEqual(1160);
    });
    it('uses series posters for episodes and episode stills for episode cards', () => {
        const episode = { Id: 'episode', Type: 'Episode' as const, SeriesId: 'series', SeriesPrimaryImageTag: 'series-version', ImageTags: { Primary: 'episode-version' } };
        expect(artworkUrl(base, episode)).toContain('/Items/series/Images/Primary?');
        expect(artworkUrl(base, episode)).toContain('tag=series-version');
        expect(artworkUrl(base, episode, 'episode')).toContain('/Items/episode/Images/Primary?');
        expect(artworkUrl(base, episode, 'episode')).toContain('tag=episode-version');
    });
    it('uses the parent backdrop and its version together', () => {
        const item = { Id: 'child', ParentBackdropItemId: 'parent', ParentBackdropImageTags: ['version / 2'] };
        expect(artworkUrl(base, item, 'backdrop')).toContain('/Items/parent/Images/Backdrop/0?');
        expect(artworkUrl(base, item, 'backdrop')).toContain('tag=version%20%2F%202');
    });
    it('keeps the item backdrop when present and chooses a full-screen hero size', () => {
        const item = { Id: 'film', BackdropImageTags: ['own'], ParentBackdropItemId: 'other' };
        const card = new URL(artworkUrl(base, item, 'backdrop'));
        const hero = new URL(artworkUrl(base, item, 'hero'));
        expect(hero.pathname).toContain('/Items/film/');
        expect(hero.searchParams.get('tag')).toBe('own');
        expect(Number(hero.searchParams.get('maxWidth'))).toBeGreaterThan(Number(card.searchParams.get('maxWidth')));
    });
    it('does not request images without a server or item and preserves stable cache URLs', () => {
        expect(artworkUrl('', { Id: 'film' })).toBe('');
        expect(artworkUrl(base, {})).toBe('');
        expect(artworkUrl(base, { Id: 'film', ImageTags: { Primary: 'v1' } })).toBe(artworkUrl(base, { Id: 'film', ImageTags: { Primary: 'v1' } }));
    });
    it('uses existing thumbs or backdrops when a poster is missing', () => {
        expect(artworkUrl(base, { Id: 'film', ImageTags: { Thumb: 'thumb' } })).toContain('/Images/Thumb?');
        expect(artworkUrl(base, { Id: 'film', BackdropImageTags: ['backdrop'] })).toContain('/Images/Backdrop/0?');
        expect(artworkUrl(base, { Id: 'film', ImageTags: { Primary: 'poster', Thumb: 'thumb' } })).toContain('/Images/Primary?');
    });
});
