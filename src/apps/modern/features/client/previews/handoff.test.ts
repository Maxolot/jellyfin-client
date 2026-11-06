import { describe, expect, it, vi } from 'vitest';

import { createPreviewVideo, PreviewHandoff, sameClip, sameFile } from './handoff';

const media = (variant: string, ticket: string) => `https://server/NativePreviews/Media/abc/${variant}.mp4?ticket=${ticket}`;
const rect = { left: 10, top: 20, width: 300, height: 170 } as DOMRect;

function handed(itemId = 'movie', source = media('compact', '1')) {
    const stop = vi.fn();
    const handoff = new PreviewHandoff(stop);
    handoff.intend('movie', 1000);
    const element = createPreviewVideo(source);
    return { stop, handoff, element, accepted: handoff.hand({ itemId, source, element, from: rect }, [itemId, 'movie'], 1500) };
}

describe('clip comparison', () => {
    it('matches the variants of one server clip whatever the ticket', () => expect(sameClip(media('compact', '1'), media('full', '2'))).toBe(true));
    it('does not match another clip', () => expect(sameClip(media('full', '1'), media('full', '1').replace('abc', 'def'))).toBe(false));
    it('does not match unrelated files of one folder', () => expect(sameClip('https://server/clips/a.mp4', 'https://server/clips/b.mp4')).toBe(false));
    it('recognises one file under a new ticket', () => expect(sameFile(media('full', '1'), media('full', '2'))).toBe(true));
    it('tells two variants apart', () => expect(sameFile(media('compact', '1'), media('full', '1'))).toBe(false));
});

describe('PreviewHandoff', () => {
    it('keeps a clip only when its page was asked for', () => {
        const handoff = new PreviewHandoff(vi.fn());
        const element = createPreviewVideo(media('compact', '1'));
        expect(handoff.hand({ itemId: 'movie', source: 'x', element, from: rect }, ['movie'], 1000)).toBe(false);
        handoff.intend('other', 1000);
        expect(handoff.hand({ itemId: 'movie', source: 'x', element, from: rect }, ['movie'], 1000)).toBe(false);
        handoff.intend('movie', 1000);
        expect(handoff.hand({ itemId: 'movie', source: 'x', element, from: rect }, ['movie'], 5000)).toBe(false);
    });

    it('moves the element to a stage at the same place', () => {
        const { accepted, element, handoff } = handed();
        expect(accepted).toBe(true);
        const stage = element.parentElement;
        expect(stage?.classList.contains('client-preview-stage')).toBe(true);
        expect(stage?.style.left).toBe('10px');
        handoff.discard();
    });

    it('gives the same element to the same title, once', () => {
        const { element, handoff, stop } = handed();
        expect(handoff.adopt('movie', media('full', '2'))?.element).toBe(element);
        expect(handoff.adopt('movie', media('full', '2'))).toBeUndefined();
        expect(stop).not.toHaveBeenCalled();
    });

    it('gives it to another title showing the same clip', () => {
        const { element, handoff } = handed('episode');
        expect(handoff.adopt('series', media('full', '2'))?.element).toBe(element);
    });

    it('stops the clip when the page plays something else', () => {
        const { element, handoff, stop } = handed();
        expect(handoff.adopt('other', 'https://server/other.mp4')).toBeUndefined();
        expect(stop).toHaveBeenCalledTimes(1);
        expect(element.isConnected).toBe(false);
    });

    it('stops the clip when no page takes it in time', () => {
        vi.useFakeTimers();
        const { element, stop } = handed();
        vi.advanceTimersByTime(2600);
        expect(stop).toHaveBeenCalledTimes(1);
        expect(element.isConnected).toBe(false);
        vi.useRealTimers();
    });

    it('waits for a clip it is about to receive', () => {
        const handoff = new PreviewHandoff(vi.fn());
        expect(handoff.pending(1000)).toBe(false);
        handoff.intend('movie', 1000);
        expect(handoff.pending(1500)).toBe(true);
        expect(handoff.pending(5000)).toBe(false);
    });
});
