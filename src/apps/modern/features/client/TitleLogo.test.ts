import { describe, expect, it } from 'vitest';

import { visibleBounds } from './TitleLogo';

function pixels(width: number, height: number, opaque: [number, number][]) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (const [x, y] of opaque) data[(y * width + x) * 4 + 3] = 255;
    return data;
}

describe('visibleBounds', () => {
    it('finds the drawing inside transparent margins, in natural pixels', () => {
        expect(visibleBounds(pixels(10, 4, [[3, 1], [6, 2]]), 10, 4, 0.5)).toEqual({ x: 6, y: 2, width: 8, height: 4 });
    });

    it('reports a fully transparent image', () => {
        expect(visibleBounds(pixels(4, 4, []), 4, 4, 1)).toBeNull();
    });
});
