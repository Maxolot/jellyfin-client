import type { ExternalMedia, SeerrIdentity } from './seerr/model';

type Paths = Pick<ExternalMedia, 'posterPath' | 'backdropPath'>;
type Lookup = (identity: SeerrIdentity) => Promise<Paths>;

function validImage(path: string | null | undefined) {
    return path && /^\/[a-zA-Z0-9._-]{1,180}$/.test(path) ? path : undefined;
}

export function cataloguePaths(source?: Paths): Paths {
    return { posterPath: validImage(source?.posterPath), backdropPath: validImage(source?.backdropPath) };
}

export function hasCompleteArtwork(paths: Paths) {
    return !!(validImage(paths.posterPath) && validImage(paths.backdropPath));
}

/** Keep known artwork, including when Seerr is unreachable or returns only one image. */
export async function resolveCatalogueArtwork(identity: SeerrIdentity, existing?: Paths, lookup?: Lookup): Promise<Paths> {
    const current = cataloguePaths(existing);
    if (!lookup || hasCompleteArtwork(current)) return current;
    const found = cataloguePaths(await lookup(identity).catch(() => undefined));
    return { posterPath: current.posterPath || found.posterPath, backdropPath: current.backdropPath || found.backdropPath };
}
