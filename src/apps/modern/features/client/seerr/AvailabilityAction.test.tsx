import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AvailabilityAction } from './SeerrViews';

vi.mock('./SeerrContext', () => ({ useSeerr: () => ({ connected: true }) }));
vi.mock('./SeerrSetup', () => ({ default: () => null }));
vi.mock('../DetailExtras', () => ({ default: () => null }));
vi.mock('../HeroArtwork', () => ({ default: () => null }));
vi.mock('./queries', () => ({ useLocalIdentities: vi.fn(), useLocalSeasons: vi.fn(), useSeerrDetail: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
});
async function render(item: BaseItemDto) {
    await act(async () => root.render(<AvailabilityAction localItem={item} />));
}

describe('AvailabilityAction', () => {
    it('is hidden for a movie already in the library', async () => {
        await render({ Id: 'm', Type: 'Movie', Name: 'Film', ProviderIds: { Tmdb: '10' } });
        expect(container.querySelector('button')).toBeNull();
    });

    it('stays available for a series that may lack seasons', async () => {
        await render({ Id: 's', Type: 'Series', Name: 'Série', ProviderIds: { Tmdb: '20' } });
        expect(container.querySelector('button')?.textContent).toBe('Disponibilité');
    });
});
