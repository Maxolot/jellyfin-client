import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DetailMenu from './DetailMenu';
import { useTitleTrackChoice } from './useTitleTrackChoice';

vi.mock('./seerr/SeerrContext', () => ({ useSeerr: () => ({ connected: true }) }));
vi.mock('./seerr/queries', () => ({
    canRequestSeasons: (item: BaseItemDto) => item.Type === 'Series',
    useMissingSeasons: (item: BaseItemDto) => item.Type === 'Series' ? 2 : 0
}));
const fileTracks = { languages: [], audio: [{ key: 'eng', label: 'Anglais' }, { key: 'fra', label: 'Français' }], subtitles: [{ key: 'fra', label: 'Français' }] };
const noTracks = { languages: [], audio: [], subtitles: [] };
let tracks: typeof fileTracks | typeof noTracks = noTracks;
let fullMenu = false;
const catalogue = { get: async () => ({ data: [] }) };
vi.mock('hooks/useApi', () => ({ useApi: () => ({
    api: { basePath: 's', axiosInstance: catalogue }, user: { Id: 'u', Policy: { EnableContentDownloading: fullMenu } }
}) }));
vi.mock('./languageTags', () => ({ useFileTracks: () => tracks }));
vi.mock('./StorageRemoval', () => ({ default: () => null, useStorageRemovalAvailable: () => fullMenu }));
vi.mock('./MediaInfoDialog', () => ({ default: () => null }));
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
function Menu({ item }: Readonly<{ item: BaseItemDto }>) {
    const tracksForTitle = useTitleTrackChoice('s', 'u', item.Id);
    return <DetailMenu item={item} basePath='' play={vi.fn()} {...tracksForTitle} />;
}
async function open(item: BaseItemDto) {
    await act(async () => root.render(<MemoryRouter><Menu item={item} /></MemoryRouter>));
    await act(async () => container.querySelector('button')?.click());
    return Array.from(container.querySelectorAll('[role="menuitem"]')).map(entry => entry.textContent);
}

describe('DetailMenu tracks', () => {
    const openMenu = async () => {
        await act(async () => root.render(<MemoryRouter><Menu item={{ Id: 'film', Type: 'Movie' }} /></MemoryRouter>));
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
        expect(item('Distribution') || item('Informations')).toBeDefined();
    });
});

describe('DetailMenu', () => {
    it('offers season requests for a series only', async () => {
        const entries = await open({ Id: 's', Type: 'Series', People: [{ Id: 'p' }] });
        expect(entries).toEqual(['Demander des saisons2', 'Distribution et réalisation', 'Informations']);
    });

    it('does not offer requests for a movie already in the library', async () => {
        const entries = await open({ Id: 'm', Type: 'Movie', People: [{ Id: 'p' }] });
        expect(entries).toEqual(['Distribution et réalisation', 'Informations']);
    });

    it('places a leading icon within every main action and track choice', async () => {
        const client = new QueryClient();
        client.setQueryData(['SharedCatalog', 's', 'u'], []);
        fullMenu = true;
        tracks = fileTracks;
        try {
            await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><Menu item={{
                Id: 'film', Name: 'Film de test', Type: 'Movie', ProviderIds: { Tmdb: '102' }, People: [{ Id: 'p' }]
            }} /></QueryClientProvider></MemoryRouter>));
            await act(async () => container.querySelector('button')?.click());
            const entries = () => Array.from(container.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
            expect(entries().map(entry => entry.textContent)).toContain('Garder dans le catalogue');
            expect(entries().map(entry => entry.textContent)).toContain('Retirer les fichiers du disque');
            expect(entries().every(entry => entry.querySelector('.client-menu-label > svg'))).toBe(true);
            await act(async () => entries().find(entry => entry.textContent?.startsWith('Audio et sous-titres'))?.click());
            expect(entries().length).toBeGreaterThan(3);
            expect(entries().every(entry => entry.querySelector('.client-menu-label > svg'))).toBe(true);
        } finally {
            fullMenu = false;
            tracks = noTracks;
            client.clear();
        }
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

describe('DetailMenu missing seasons', () => {
    it('announces missing seasons in the label without a visual badge', async () => {
        await act(async () => root.render(<MemoryRouter><Menu item={{ Id: 's', Type: 'Series' }} /></MemoryRouter>));
        expect(container.querySelector('.client-more-badge')).toBeNull();
        expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Plus d’actions : 2 saisons à demander');
    });
});
