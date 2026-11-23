import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('./SharedCatalogArtwork', () => ({ default: () => <span data-test='shared-art' /> }));

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
            items={[{ item, itemId: 'film', key: 'film', type: 'movie', tmdbId: null }]} /></MemoryRouter>));
        const card = container.querySelector('.client-shelf-item a')!;
        expect(card.getAttribute('aria-label')).toContain(item.Name);
        expect(card.getAttribute('aria-label')).toContain('Déjà vu');
        expect(card.querySelector('.client-shelf-reveal')).toBeNull();
        expect(card.parentElement?.textContent).toBe(card.textContent);
        expect(card.parentElement?.children).toHaveLength(1);
    } finally {
        await act(async () => root.unmount());
        vi.unstubAllGlobals();
    }
});

it('renders a followed title as a requestable poster with a link to its own detail', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    const root = createRoot(container);
    const item = { Id: 'seerr-movie-42', Name: 'Crépuscule', Type: 'Movie' as const };
    try {
        await act(async () => root.render(<MemoryRouter><CollectionGrid
            image={noImage} prepare={noop} release={noop} showWatched empty='Vide'
            items={[{ item, itemId: null, key: item.Id, type: 'movie', tmdbId: 42, followed: true }]} /></MemoryRouter>));
        const card = container.querySelector('.client-shelf-item a')!;
        expect(card.getAttribute('href')).toContain('id=seerr-movie-42');
        expect(card.getAttribute('aria-label')).toBe('Crépuscule · À demander');
        expect(card.querySelector('[data-test="shared-art"]')).not.toBeNull();
        expect(card.querySelector('.client-external-badge')?.textContent).toBe('À demander');
    } finally {
        await act(async () => root.unmount());
        vi.unstubAllGlobals();
    }
});
