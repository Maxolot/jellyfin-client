import { describe, expect, it } from 'vitest';
import { sameItem, sceneProblem } from './sceneModel';

describe('preview scene limits', () => {
    it('matches server GUIDs to compact client identifiers', () => {
        expect(sameItem('ABCD-1234', 'abcd1234')).toBe(true);
        expect(sameItem()).toBe(false);
    });
    it('rejects invalid positions, duration and scenes outside the media', () => {
        expect(sceneProblem(Number.NaN, 20)).not.toBe('');
        expect(sceneProblem(-1, 20)).not.toBe('');
        expect(sceneProblem(0, 0)).not.toBe('');
        expect(sceneProblem(0, 31)).not.toBe('');
        expect(sceneProblem(90, 20, 100 * 10000000)).not.toBe('');
        expect(sceneProblem(80, 20, 100 * 10000000)).toBe('');
    });
});
