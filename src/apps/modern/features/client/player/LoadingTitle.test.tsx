import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import LoadingTitle from './LoadingTitle';

const basePath = 'https://media.example.test';
let root: Root;
let container: HTMLDivElement;
const status = () => container.querySelector('[role="status"]')!;

describe('LoadingTitle', () => {
    beforeEach(() => {
        Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('shows the title logo of a film when the library has one', () => {
        act(() => root.render(<LoadingTitle basePath={basePath} label='Chargement de la vidéo…' item={{ Id: 'film', Name: 'Dune', Type: 'Movie', ImageTags: { Logo: 'tag' } }} />));
        expect(status().querySelector('img')?.getAttribute('src')).toContain('/Items/film/Images/Logo');
        expect(status().getAttribute('aria-label')).toBe('Chargement de la vidéo… Dune');
    });

    it('falls back to the written title without a logo or when the logo fails', () => {
        act(() => root.render(<LoadingTitle basePath={basePath} label='Préparation de la lecture…' item={{ Id: 'film', Name: 'Dune', Type: 'Movie' }} />));
        expect(status().querySelector('strong')?.textContent).toBe('Dune');
        act(() => root.render(<LoadingTitle basePath={basePath} label='Préparation de la lecture…' item={{ Id: 'film', Name: 'Dune', Type: 'Movie', ImageTags: { Logo: 'tag' } }} />));
        act(() => {
            status().querySelector('img')!.dispatchEvent(new Event('error'));
        });
        expect(status().querySelector('img')).toBeNull();
        expect(status().querySelector('strong')?.textContent).toBe('Dune');
    });

    it('names the series and the episode', () => {
        act(() => root.render(<LoadingTitle basePath={basePath} label='Préparation de la lecture…' item={{ Id: 'ep', Name: 'Pilote', SeriesName: 'Severance', SeriesId: 'sev', Type: 'Episode', ParentIndexNumber: 1, IndexNumber: 1 }} />));
        expect(status().querySelector('.client-player-loading-episode')?.textContent).toBe('S1:E1 · Pilote');
        expect(status().getAttribute('aria-label')).toContain('Severance');
    });

    it('still says what happens before the title is known', () => {
        act(() => root.render(<LoadingTitle basePath={basePath} label='Préparation de la lecture…' />));
        expect(status().querySelector('strong')?.textContent).toBe('Préparation de la lecture…');
    });
});
