import { describe, expect, it } from 'vitest';

import { cancelStreamChanges, queueStreamChange } from './streamChangeQueue';

describe('stream replacement ordering', () => {
    it('does not replace a loading media element and coalesces pending selections', async () => {
        const player = {};
        const calls: number[] = [];
        let finish!: () => void;
        const first = queueStreamChange(player, async () => {
            calls.push(1);
            await new Promise<void>(resolve => {
                finish = resolve;
            });
        });
        const skipped = queueStreamChange(player, async () => {
            calls.push(2);
        });
        const last = queueStreamChange(player, async () => {
            calls.push(3);
        });
        expect(calls).toEqual([1]);
        finish();
        await Promise.all([first, skipped, last]);
        expect(calls).toEqual([1, 3]);
    });
    it('a rejected replacement does not poison the next choice or a different player', async () => {
        const player = {};
        const failure = queueStreamChange(player, () => Promise.reject(new Error('failed')));
        const success = queueStreamChange(player, () => Promise.resolve());
        await expect(failure).rejects.toThrow('failed');
        await expect(success).resolves.toBeUndefined();
        await expect(queueStreamChange({}, () => Promise.resolve())).resolves.toBeUndefined();
    });
    it('stopping releases pending choices and allows a new playback before the old load finishes', async () => {
        const player = {};
        const calls: number[] = [];
        let finishOld!: () => void;
        const old = queueStreamChange(player, () => new Promise<void>(resolve => {
            finishOld = resolve;
        }));
        const pending = queueStreamChange(player, async () => {
            calls.push(1);
        });
        cancelStreamChanges(player);
        await pending;
        await queueStreamChange(player, async () => {
            calls.push(2);
        });
        finishOld();
        await old;
        expect(calls).toEqual([2]);
        await queueStreamChange(player, async () => {
            calls.push(3);
        });
        expect(calls).toEqual([2, 3]);
    });
});
