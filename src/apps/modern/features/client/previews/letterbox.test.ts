import { describe, expect, it } from 'vitest';
import { detectLetterbox, letterboxTransform } from './letterbox';

function frame(top: number, bottom: number, darkScene = false) {
    const width = 160;
    const height = 90;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = top; y < height - bottom; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            pixels[i] = darkScene ? 0 : 120;
            pixels[i + 1] = darkScene ? 0 : 80;
            pixels[i + 2] = darkScene ? 0 : 50;
            pixels[i + 3] = 255;
        }
    }
    return pixels;
}

describe('embedded cinema bars', () => {
    it('detects symmetrical bars without selecting content at the sides', () => {
        expect(detectLetterbox(frame(12, 12), 160, 90)).toEqual({ top: 12 / 90, bottom: 12 / 90 });
    });
    it('does not crop a normal image, an entirely dark image or an asymmetric scene', () => {
        expect(detectLetterbox(frame(0, 0), 160, 90)).toBeUndefined();
        expect(detectLetterbox(frame(12, 12, true), 160, 90)).toBeUndefined();
        expect(detectLetterbox(frame(12, 2), 160, 90)).toBeUndefined();
    });
    it('only enlarges as needed to fill the available area', () => {
        expect(letterboxTransform(1920, 1080, 1280, 840, { top: 12 / 90, bottom: 12 / 90 })).toBe('translateY(0.00px) scale(1.3636)');
        expect(letterboxTransform(1920, 1080, 0, 840, { top: 0.1, bottom: 0.1 })).toBe('');
    });
});
