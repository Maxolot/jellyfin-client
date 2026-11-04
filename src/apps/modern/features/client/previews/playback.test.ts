import { describe, expect, it, vi } from 'vitest';
import { PreviewPlayback } from './playback';

function video() {
    const element = document.createElement('video');
    element.src = '/clip.mp4';
    element.pause = vi.fn();
    element.load = vi.fn();
    return element;
}

describe('preview playback ownership', () => {
    it('pauses and hides the previous video before activating another', () => {
        const playback = new PreviewPlayback();
        const first = video();
        const second = video();
        const oldLease = playback.acquire(first);
        const nextLease = playback.acquire(second);
        expect(first.pause).toHaveBeenCalled();
        expect(first.style.visibility).toBe('hidden');
        expect(first.hasAttribute('src')).toBe(false);
        expect(playback.owns(first, oldLease)).toBe(false);
        expect(playback.owns(second, nextLease)).toBe(true);
        playback.release(first, oldLease);
        expect(playback.owns(second, nextLease)).toBe(true);
    });
    it('ignores a late result from an old lease on the same video', () => {
        const playback = new PreviewPlayback();
        const element = video();
        const oldLease = playback.acquire(element);
        const nextLease = playback.acquire(element);
        vi.mocked(element.pause).mockClear();
        playback.release(element, oldLease);
        expect(element.pause).not.toHaveBeenCalled();
        expect(playback.owns(element, nextLease)).toBe(true);
        playback.stop();
        expect(element.pause).toHaveBeenCalled();
        expect(playback.owns(element, nextLease)).toBe(false);
    });
});
