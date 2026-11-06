import type { PackageInfo, PluginInfo, RepositoryInfo } from '@jellyfin/sdk/lib/generated-client';

import { MOONBASE_ID, MOONBASE_NAME, MOONBASE_REPOSITORY } from '../../seerr/setup';

export type ExtensionKey = 'previews' | 'moonbase' | 'movieSources';

/** Catalogue published with the client (plugins/catalog in the repository); a deployment can point elsewhere in config.json. */
export const CLIENT_PLUGIN_CATALOGUE = 'https://raw.githubusercontent.com/Maxolot/jellyfin-client/main/plugins/catalog/manifest.json';

export type Extension = {
    key: ExtensionKey;
    /** Assembly GUID, as the server and the catalogues know it. */
    id: string;
    /** Package name in the catalogue, needed to install. */
    packageName: string;
    title: string;
    summary: string;
    /** Catalogue that ships it, when one is known for everyone. */
    repository?: string;
};

export const EXTENSIONS: Record<ExtensionKey, Extension> = {
    previews: { key: 'previews', id: '14d4d2e1-8801-44df-bd61-7bb2d8ba2c8e', packageName: 'Native Previews', title: 'Extraits vidéo',
        summary: 'Prépare de courts extraits des films et séries, joués au survol des cartes et sur les fiches.', repository: CLIENT_PLUGIN_CATALOGUE },
    moonbase: { key: 'moonbase', id: MOONBASE_ID, packageName: MOONBASE_NAME, title: 'Demandes avec Seerr',
        summary: 'Relie le serveur à Seerr : découvertes, demandes de films et de saisons, suivi.', repository: MOONBASE_REPOSITORY },
    movieSources: { key: 'movieSources', id: '894c6e88-9250-4627-9d43-f45da80f30eb', packageName: 'Movie Sources', title: 'Sources disponibles',
        summary: 'Indique avant une demande si un film ou une saison est déjà publié, et en quelles langues, grâce à Prowlarr.', repository: CLIENT_PLUGIN_CATALOGUE }
};

export type ExtensionStage = 'missing' | 'restart' | 'ready' | 'disabled' | 'problem';

const plainId = (id?: string | null) => (id || '').replace(/-/g, '').toLowerCase();

export function findPlugin(plugins: PluginInfo[] | undefined, extension: Extension) {
    return plugins?.find(plugin => plainId(plugin.Id) === plainId(extension.id));
}

export function findPackage(packages: PackageInfo[] | undefined, extension: Extension) {
    return packages?.find(entry => plainId(entry.guid) === plainId(extension.id));
}

export function extensionStage(plugin: PluginInfo | undefined): ExtensionStage {
    if (!plugin) return 'missing';
    if (plugin.Status === 'Active') return 'ready';
    if (plugin.Status === 'Restart') return 'restart';
    return plugin.Status === 'Disabled' ? 'disabled' : 'problem';
}

/** The server replaces the whole list: those already configured are kept, a known one is switched back on. */
export function withRepository(repositories: RepositoryInfo[], name: string, url: string): RepositoryInfo[] {
    const known = repositories.some(repository => repository.Url === url);
    if (known) return repositories.map(repository => repository.Url === url ? { ...repository, Enabled: true } : repository);
    return [...repositories, { Name: name, Url: url, Enabled: true }];
}

/** An address the server will call: complete, web, without credentials written in it. */
export function addressProblem(value: string, missing = 'Saisissez l’adresse complète, par exemple http://prowlarr:9696.') {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        return missing;
    }
    if (!['http:', 'https:'].includes(url.protocol)) return 'L’adresse doit commencer par http:// ou https://.';
    if (url.username || url.password) return 'L’adresse ne doit pas contenir d’identifiant ni de mot de passe.';
    if (url.search || url.hash) return 'Retirez ce qui suit « ? » ou « # » dans l’adresse.';
    return '';
}

export const repositoryProblem = (value: string) => addressProblem(value, 'Saisissez l’adresse complète du catalogue, se terminant en général par manifest.json.');

/** Secrets never come back to the screen: an empty field keeps the stored value. */
export function withSecret<T extends Record<string, unknown>>(stored: T, key: keyof T, typed: string): T {
    return typed ? { ...stored, [key]: typed } : stored;
}
