import { describe, expect, it } from 'vitest';

import { resolveSection } from './sections';

describe('settings sections', () => {
    it('opens the requested section', () => {
        expect(resolveSection('qualite', false).key).toBe('qualite');
        expect(resolveSection('serveur-sources', true).key).toBe('serveur-sources');
    });

    it('keeps the addresses used before the redesign', () => {
        expect(resolveSection('interface', false).key).toBe('apparence');
        expect(resolveSection('lecture', false).key).toBe('lecteur');
        expect(resolveSection('compte', false).key).toBe('compte');
    });

    it('never shows server pages to other users', () => {
        expect(resolveSection('serveur', false).key).toBe('apparence');
        expect(resolveSection(null, true).key).toBe('apparence');
        expect(resolveSection('inconnue', true).key).toBe('apparence');
    });
});
