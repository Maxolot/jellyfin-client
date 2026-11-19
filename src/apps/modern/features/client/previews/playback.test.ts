import { describe, expect, it, vi } from 'vitest';
import { PreviewPlayback, startPreviewVideo } from './playback';

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

describe('preview start', () => {
    it('falls back once for a remote source rejected in CORS mode', async () => {
        const element = video();
        element.crossOrigin = 'anonymous';
        element.src = 'https://media.example.test/clip.mp4';
        Object.defineProperty(element, 'error', { value: { code: 4 } });
        element.play = vi.fn().mockRejectedValueOnce(new DOMException('Source failed', 'NotSupportedError')).mockResolvedValueOnce(undefined);
        const mute = vi.fn();
        expect(await startPreviewVideo(element, () => true, mute)).toBe(true);
        expect(element.crossOrigin).toBeNull();
        expect(element.src).toBe('https://media.example.test/clip.mp4');
        expect(element.play).toHaveBeenCalledTimes(2);
        expect(mute).not.toHaveBeenCalled();
    });

    it('keeps the same source and requests muted playback when autoplay is blocked', async () => {
        const element = video();
        element.crossOrigin = 'anonymous';
        element.play = vi.fn().mockRejectedValueOnce(new DOMException('Autoplay blocked', 'NotAllowedError')).mockResolvedValueOnce(undefined);
        const mute = vi.fn();
        expect(await startPreviewVideo(element, () => true, mute)).toBe(true);
        expect(element.crossOrigin).toBe('anonymous');
        expect(element.muted).toBe(true);
        expect(element.play).toHaveBeenCalledTimes(2);
        expect(mute).toHaveBeenCalledOnce();
    });

    it('does not restart a clip that lost ownership during startup', async () => {
        const element = video();
        element.crossOrigin = 'anonymous';
        element.src = 'https://media.example.test/clip.mp4';
        Object.defineProperty(element, 'error', { value: { code: 4 } });
        element.play = vi.fn().mockRejectedValue(new DOMException('Source failed', 'NotSupportedError'));
        expect(await startPreviewVideo(element, () => false, vi.fn())).toBe(false);
        expect(element.crossOrigin).toBe('anonymous');
        expect(element.play).toHaveBeenCalledOnce();
    });
});
