import { describe, expect, it } from 'vitest';

import { remoteTrailer, trailerEmbedUrl, youtubeTrailerId } from './trailerSources';

const id = 'aBcDeFg_1-2';

describe('YouTube trailers', () => {
    it('recognizes standard, short, mobile and privacy-enhanced URLs', () => {
        for (const url of [
            `https://www.youtube.com/watch?v=${id}&t=59`,
            `https://youtu.be/${id}?si=shared`,
            `https://m.youtube.com/shorts/${id}`,
            `https://www.youtube-nocookie.com/embed/${id}`
        ]) expect(youtubeTrailerId(url)).toBe(id);
    });

    it('skips unsupported links and rejects spoofed domains, non-web schemes and invalid IDs', () => {
        const rejected = [
            'https://vimeo.com/123456', `https://youtube.com.example.test/watch?v=${id}`,
            `https://youtube.com@attacker.test/watch?v=${id}`, `https://user@youtube.com/watch?v=${id}`,
            `ftp://youtube.com/watch?v=${id}`, 'https://youtu.be/too-short', `https://youtu.be/${id}/extra`,
            `https://youtube.com:444/watch?v=${id}`, 'data:text/plain,fixture'
        ];
        for (const url of rejected) expect(youtubeTrailerId(url)).toBeUndefined();
        expect(remoteTrailer([...rejected.map(Url => ({ Url })), { Url: `https://youtu.be/${id}` }])).toBe(id);
    });

    it('builds a privacy-enhanced embed with autoplay off and the client origin', () => {
        const origin = 'https://client.example.test';
        const url = new URL(trailerEmbedUrl(id, origin));
        expect(url.origin).toBe('https://www.youtube-nocookie.com');
        expect(url.pathname).toBe(`/embed/${id}`);
        expect(url.searchParams.get('autoplay')).toBe('0');
        expect(url.searchParams.get('origin')).toBe(origin);
    });
});
