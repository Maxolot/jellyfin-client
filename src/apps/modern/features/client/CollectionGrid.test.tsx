import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import CollectionGrid from './CollectionGrid';

const noop = () => undefined;
const noImage = () => '';

it('keeps media titles inside the poster and retains each accessible title', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    const root = createRoot(container);
    const item = { Id: 'film', Name: 'La ligne d’ombre', Type: 'Movie' as const, UserData: { Key: 'film', Played: true } };
    try {
        await act(async () => root.render(<MemoryRouter><CollectionGrid
            image={noImage} prepare={noop} release={noop} showWatched empty='Vide'
            items={[{ item, itemId: 'film', type: 'movie', tmdbId: null }]} /></MemoryRouter>));
        const card = container.querySelector('.client-shelf-item a')!;
        expect(card.getAttribute('aria-label')).toContain(item.Name);
        expect(card.getAttribute('aria-label')).toContain('Déjà vu');
        expect(card.querySelector('.client-shelf-reveal strong')?.textContent).toBe(item.Name);
        expect(card.parentElement?.textContent).toBe(card.textContent);
        expect(card.parentElement?.children).toHaveLength(1);
    } finally {
        await act(async () => root.unmount());
        vi.unstubAllGlobals();
    }
});
