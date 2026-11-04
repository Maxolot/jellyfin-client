import type { PluginInfo, RepositoryInfo } from '@jellyfin/sdk/lib/generated-client';

export const MOONBASE_ID = '8c5d0e91-4f2a-4b6d-9e3f-1a7c8d9e0f2b';
export const MOONBASE_NAME = 'Moonbase';
export const MOONBASE_REPOSITORY = 'https://raw.githubusercontent.com/Moonfin-Client/Plugin/refs/heads/master/manifest.json';

export type SetupStage = 'missing' | 'restart' | 'ready' | 'problem';

const plainId = (id?: string | null) => (id || '').replace(/-/g, '').toLowerCase();

export function findMoonbase(plugins: PluginInfo[]) {
    return plugins.find(plugin => plainId(plugin.Id) === plainId(MOONBASE_ID));
}

export function setupStage(plugin: PluginInfo | undefined): SetupStage {
    if (!plugin) return 'missing';
    if (plugin.Status === 'Active') return 'ready';
    return plugin.Status === 'Restart' ? 'restart' : 'problem';
}

/** Repositories the administrator already configured are kept; the server replaces the whole list. */
export function withMoonbaseRepository(repositories: RepositoryInfo[]): RepositoryInfo[] {
    const known = repositories.some(repository => repository.Url === MOONBASE_REPOSITORY);
    if (known) return repositories.map(repository => repository.Url === MOONBASE_REPOSITORY ? { ...repository, Enabled: true } : repository);
    return [...repositories, { Name: MOONBASE_NAME, Url: MOONBASE_REPOSITORY, Enabled: true }];
}

export function seerrUrlProblem(value: string) {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        return 'Saisissez une adresse complète, par exemple http://seerr:5055.';
    }
    if (!['http:', 'https:'].includes(url.protocol)) return 'L’adresse doit commencer par http:// ou https://.';
    if (url.username || url.password) return 'L’adresse ne doit pas contenir d’identifiant ni de mot de passe.';
    return '';
}

export function normalizeSeerrUrl(value: string) {
    let url = value.trim();
    while (url.endsWith('/')) url = url.slice(0, -1);
    return url;
}

/** Moonbase refuses Seerr while its settings sync is off; every other plugin setting is preserved. */
export function withSeerrUrl<T extends object>(configuration: T, url: string) {
    return { ...configuration, SeerrEnabled: true, SeerrUrl: normalizeSeerrUrl(url), EnableSettingsSync: true };
}
