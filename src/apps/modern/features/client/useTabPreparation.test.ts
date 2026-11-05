import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { describe, expect, it, vi } from 'vitest';

import { firstPictures } from './useTabPreparation';

vi.mock('hooks/useApi', () => ({ useApi: () => ({}) }));
vi.mock('./session', () => ({ clientRequest: (run: () => unknown) => run() }));
vi.mock('./seerr/SeerrContext', () => ({ useSeerr: () => ({}) }));
vi.mock('scripts/settings/userSettings', () => ({}));

const title = (id: string) => ({ Id: id, ImageTags: { Primary: `p${id}` }, BackdropImageTags: [`b${id}`] }) as BaseItemDto;
const empty = { items: [], movies: [], series: [], picks: [] };

describe('firstPictures', () => {
    it('warms the lead picture, then the first posters only', () => {
        const items = Array.from({ length: 40 }, (_, index) => title(String(index)));
        const pictures = firstPictures('https://server', { ...empty, items });
        expect(pictures).toHaveLength(13);
        expect(pictures[0]).toContain('/Items/0/Images/Backdrop/0');
        expect(pictures[1]).toContain('/Items/0/Images/Primary');
        expect(pictures.at(-1)).toContain('/Items/11/Images/Primary');
    });
    it('covers the home page, whose titles live in other lists', () => expect(firstPictures('https://server', { ...empty, picks: [title('a')], movies: [title('b')] }).length).toBe(3));
    it('asks for nothing when a tab is empty', () => expect(firstPictures('https://server', empty)).toEqual([]));
});
