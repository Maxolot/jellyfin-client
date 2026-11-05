import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import SourceBadge from './SourceBadge';
import type { SourceLanguage, SourceStatus } from './sources';

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
async function render(status?: SourceStatus, languages?: SourceLanguage[]) {
    await act(async () => root.render(status ? <SourceBadge status={status} languages={languages} /> : <SourceBadge />));
    return container.querySelector('.client-source-badge');
}

describe('SourceBadge', () => {
    it('lists the French flavours next to a found source', async () => {
        const badge = await render('found', ['multi', 'vostfr']);
        expect([...badge?.querySelectorAll('.client-source-lang') || []].map(tag => tag.textContent)).toEqual(['MULTI', 'VOSTFR']);
    });

    it('shows no language when nothing was found', async () => {
        expect((await render('empty', ['vf']))?.querySelectorAll('.client-source-lang').length).toBe(0);
    });

    it('says a source was found', async () => {
        const badge = await render('found');
        expect(badge?.textContent).toBe('Source trouvée');
        expect(badge?.classList.contains('is-found')).toBe(true);
    });

    it('says nothing was found without claiming unavailability', async () => {
        const badge = await render('empty');
        expect(badge?.textContent).toBe('Aucune source');
        expect(badge?.getAttribute('title')).toContain('une demande reste possible');
    });

    it('shows progress while searching', async () => {
        expect((await render('pending'))?.textContent).toBe('Recherche…');
    });

    it('is hidden when unknown or absent', async () => {
        expect(await render('unknown')).toBeNull();
        expect(await render()).toBeNull();
    });
});
