import { describe, expect, it } from 'vitest';

import { CLIENT_PLUGIN_CATALOGUE, EXTENSIONS, extensionStage, findPackage, findPlugin, repositoryProblem, withRepository, withSecret } from './extensions';

describe('server extensions', () => {
    it('finds a plugin whatever the GUID spelling', () => {
        expect(findPlugin([{ Id: '14d4d2e188014', Name: 'x' }, { Id: '14D4D2E1880144DFBD617BB2D8BA2C8E', Name: 'Native Previews' }], EXTENSIONS.previews)?.Name).toBe('Native Previews');
        expect(findPackage([{ guid: '894c6e88-9250-4627-9d43-f45da80f30eb', name: 'Movie Sources' }], EXTENSIONS.movieSources)?.name).toBe('Movie Sources');
    });

    it('turns a plugin status into a stage', () => {
        expect(extensionStage(undefined)).toBe('missing');
        expect(extensionStage({ Status: 'Active' })).toBe('ready');
        expect(extensionStage({ Status: 'Restart' })).toBe('restart');
        expect(extensionStage({ Status: 'Disabled' })).toBe('disabled');
        expect(extensionStage({ Status: 'Malfunctioned' })).toBe('problem');
    });

    it('adds a catalogue without losing the others', () => {
        const existing = [{ Name: 'Officiel', Url: 'https://repo.jellyfin.org/manifest.json', Enabled: true }];
        expect(withRepository(existing, 'Extraits', 'https://exemple.test/manifest.json')).toHaveLength(2);
        expect(withRepository([{ Name: 'Extraits', Url: 'https://exemple.test/manifest.json', Enabled: false }], 'Extraits', 'https://exemple.test/manifest.json')[0].Enabled).toBe(true);
    });

    it('checks a catalogue address', () => {
        expect(repositoryProblem('https://exemple.test/manifest.json')).toBe('');
        expect(repositoryProblem('exemple.test')).not.toBe('');
        expect(repositoryProblem('ftp://exemple.test/manifest.json')).not.toBe('');
        expect(repositoryProblem('https://moi:secret@exemple.test/manifest.json')).not.toBe('');
    });

    it('keeps a stored secret unless a new one is typed', () => {
        const stored = { Address: 'https://prowlarr.example.test', ApiKey: 'ancienne', Enabled: true };
        expect(withSecret(stored, 'ApiKey', '').ApiKey).toBe('ancienne');
        expect(withSecret(stored, 'ApiKey', 'nouvelle').ApiKey).toBe('nouvelle');
    });
});

describe('published plugin catalogue', () => {
    it('offers every plugin the client installs from it, under the same id and name', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        // Tests run from the repository root.
        const catalogue = JSON.parse(readFileSync(resolve(process.cwd(), 'plugins/catalog/manifest.json'), 'utf8')) as { guid: string; name: string; versions: { sourceUrl: string; targetAbi: string }[] }[];
        for (const extension of Object.values(EXTENSIONS).filter(entry => entry.repository === CLIENT_PLUGIN_CATALOGUE)) {
            const entry = catalogue.find(item => item.guid === extension.id);
            expect(entry?.name).toBe(extension.packageName);
            expect(entry?.versions[0].sourceUrl.startsWith(CLIENT_PLUGIN_CATALOGUE.replace('manifest.json', ''))).toBe(true);
            expect(entry?.versions[0].targetAbi).toBe('12.0.0.0');
        }
    });
});
