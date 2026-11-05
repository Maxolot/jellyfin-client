import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DetailMenu from './DetailMenu';

vi.mock('./seerr/SeerrContext', () => ({ useSeerr: () => ({ connected: true }) }));
vi.mock('./seerr/SeerrViews', () => ({
    canRequestSeasons: (item: BaseItemDto) => item.Type === 'Series',
    RequestDialog: () => null,
    useMissingSeasons: (item: BaseItemDto) => item.Type === 'Series' ? 2 : 0
}));
const fileTracks = { languages: [], audio: [{ key: 'eng', label: 'Anglais' }, { key: 'fra', label: 'Français' }], subtitles: [{ key: 'fra', label: 'Français' }] };
const noTracks = { languages: [], audio: [], subtitles: [] };
let tracks: typeof fileTracks | typeof noTracks = noTracks;
vi.mock('hooks/useApi', () => ({ useApi: () => ({ api: { basePath: 's' }, user: { Id: 'u' } }) }));
vi.mock('./languageTags', () => ({ useFileTracks: () => tracks }));
vi.mock('./DetailExtras', () => ({ CastDialog: () => null, hasCast: (item: BaseItemDto) => !!item.People?.length }));

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
async function open(item: BaseItemDto) {
    await act(async () => root.render(<MemoryRouter><DetailMenu item={item} basePath='' /></MemoryRouter>));
    await act(async () => container.querySelector('button')?.click());
    return Array.from(container.querySelectorAll('[role="menuitem"]')).map(entry => entry.textContent);
}

describe('DetailMenu tracks', () => {
    const openMenu = async () => {
        await act(async () => root.render(<MemoryRouter><DetailMenu item={{ Id: 'film', Type: 'Movie' }} basePath='' /></MemoryRouter>));
        await act(async () => container.querySelector<HTMLElement>('.client-action-circle')?.click());
    };
    const item = (text: string) => [...container.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(entry => entry.textContent?.includes(text));
    beforeEach(() => {
        localStorage.clear();
        tracks = fileTracks;
    });
    afterEach(() => {
        tracks = noTracks;
    });

    it('offers nothing when the file has no alternative', async () => {
        tracks = { languages: [], audio: [{ key: 'eng', label: 'Anglais' }], subtitles: [] };
        await openMenu();
        expect(item('Audio et sous-titres')).toBeUndefined();
    });

    it('remembers a language for this title and shows it', async () => {
        await openMenu();
        expect(item('Audio et sous-titres')?.textContent).toContain('Par défaut');
        await act(async () => item('Audio et sous-titres')?.click());
        const french = container.querySelector<HTMLElement>('[aria-label="Audio : Français"]');
        expect(french?.getAttribute('aria-checked')).toBe('false');
        await act(async () => french?.click());
        expect(container.querySelector('[aria-label="Audio : Français"]')?.getAttribute('aria-checked')).toBe('true');
        expect(JSON.parse(localStorage.getItem('client-track-choices-s-u') || '{}').film).toEqual({ audio: 'fra' });
        await act(async () => container.querySelector<HTMLElement>('.client-more-menu [role="menuitem"]')?.click());
        expect(item('Audio et sous-titres')?.textContent).toContain('Français');
    });

    it('goes back one level with Escape', async () => {
        await openMenu();
        await act(async () => item('Audio et sous-titres')?.click());
        await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
        expect(item('Distribution') || item('Options et fiche')).toBeDefined();
    });
});

describe('DetailMenu', () => {
    it('offers season requests for a series only', async () => {
        const entries = await open({ Id: 's', Type: 'Series', People: [{ Id: 'p' }] });
        expect(entries).toEqual(['Demander des saisons2', 'Distribution et réalisation', 'Options et fiche Jellyfin']);
    });

    it('does not offer requests for a movie already in the library', async () => {
        const entries = await open({ Id: 'm', Type: 'Movie', People: [{ Id: 'p' }] });
        expect(entries).toEqual(['Distribution et réalisation', 'Options et fiche Jellyfin']);
    });

    it('closes with Escape and restores focus', async () => {
        await open({ Id: 'm', Type: 'Movie' });
        await act(async () => {
            container.querySelector('[role="menu"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(container.querySelector('[role="menu"]')).toBeNull();
        expect(document.activeElement).toBe(container.querySelector('button'));
    });
});

describe('DetailMenu badge', () => {
    it('shows a badge on the button when seasons are missing, not for a movie', async () => {
        await act(async () => root.render(<MemoryRouter><DetailMenu item={{ Id: 's', Type: 'Series' }} basePath='' /></MemoryRouter>));
        expect(container.querySelector('.client-more-badge')).not.toBeNull();
        expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Plus d’actions : 2 saisons à demander');
        await act(async () => root.render(<MemoryRouter><DetailMenu item={{ Id: 'm', Type: 'Movie' }} basePath='' /></MemoryRouter>));
        expect(container.querySelector('.client-more-badge')).toBeNull();
    });
});
