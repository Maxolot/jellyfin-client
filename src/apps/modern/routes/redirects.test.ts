import { describe, expect, it, vi } from 'vitest';

import { redirectTarget } from './redirects';

vi.mock('apps/modern/features/client/session/ServerInterfacePage', () => ({ default: () => null }));

describe('addresses of the former interface', () => {
    it('opens a title in the client', () => expect(redirectTarget('details', '?id=abc&serverId=x')).toBe('/client?id=abc'));
    it('survives a detail link without title', () => expect(redirectTarget('details', '')).toBe('/client'));
    it('carries a search over', () => expect(redirectTarget('search', '?query=dune%202')).toBe('/client?view=search&q=dune%202'));
    it('maps the libraries', () => {
        expect(redirectTarget('movies', '')).toBe('/client?view=films');
        expect(redirectTarget('tv', '')).toBe('/client?view=series');
    });
    it('sends preferences to the settings', () => expect(redirectTarget('mypreferencesplayback', '')).toBe('/client?view=settings'));
    it('sends the rest home', () => expect(redirectTarget('music', '')).toBe('/client'));
});
