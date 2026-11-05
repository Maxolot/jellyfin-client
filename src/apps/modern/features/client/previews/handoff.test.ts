import { describe, expect, it } from 'vitest';

import { PreviewHandoff, sameClip } from './handoff';

const media = (variant: string, ticket: string) => `https://server/NativePreviews/Media/abc/${variant}.mp4?ticket=${ticket}`;

describe('sameClip', () => {
    it('matches the variants of one server clip whatever the ticket', () => expect(sameClip(media('compact', '1'), media('full', '2'))).toBe(true));
    it('does not match another clip', () => expect(sameClip(media('full', '1'), media('full', '1').replace('abc', 'def'))).toBe(false));
    it('does not match unrelated files of one folder', () => expect(sameClip('https://server/clips/a.mp4', 'https://server/clips/b.mp4')).toBe(false));
});

describe('PreviewHandoff', () => {
    const entry = { itemId: 'movie', source: media('compact', '1'), time: 7, at: 1000 };

    it('resumes the same title once', () => {
        const handoff = new PreviewHandoff();
        handoff.save(entry);
        expect(handoff.take('movie', 'https://server/other.mp4', 1500)?.time).toBe(7);
        expect(handoff.take('movie', 'https://server/other.mp4', 1500)).toBeUndefined();
    });

    it('resumes another title showing the same clip', () => {
        const handoff = new PreviewHandoff();
        handoff.save({ ...entry, itemId: 'episode' });
        expect(handoff.take('series', media('full', '2'), 1500)?.time).toBe(7);
    });

    it('keeps the point away from another clip', () => {
        const handoff = new PreviewHandoff();
        handoff.save(entry);
        expect(handoff.take('other', 'https://server/other.mp4', 1500)).toBeUndefined();
    });

    it('forgets a clip stopped too long ago', () => {
        const handoff = new PreviewHandoff();
        handoff.save(entry);
        expect(handoff.fresh(1500)).toBe(true);
        expect(handoff.fresh(5000)).toBe(false);
        expect(handoff.take('movie', entry.source, 5000)).toBeUndefined();
    });
});
