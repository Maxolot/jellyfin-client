import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

export type SourceStatus = 'pending' | 'found' | 'empty' | 'unknown';
/** Audio and subtitle flavours announced by the release titles: French dub, French subtitles, multi-audio. */
export type SourceLanguage = 'vf' | 'vostfr' | 'multi';
const LANGUAGES: SourceLanguage[] = ['multi', 'vf', 'vostfr'];
function cleanLanguages(value: unknown): SourceLanguage[] {
    return Array.isArray(value) ? LANGUAGES.filter(tag => value.includes(tag)) : [];
}
type Capability = { Enabled?: boolean; enabled?: boolean; Series?: boolean; series?: boolean };
type Retryable = { response?: { status?: number } };

const IMDB = /^tt\d{5,10}$/;
const retryLimited = (count: number, error: unknown) => count < 1 && (error as Retryable).response?.status === 429;

function useSourceRequest() {
    const { api, user } = useApi();
    const request = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
        if (!api) throw new Error('Service indisponible');
        const response = await api.axiosInstance.request<T>({ url: `${api.basePath.replace(/\/$/, '')}/MovieSources/${path}`,
            headers: { Authorization: `MediaBrowser Token="${api.accessToken}"`, Accept: 'application/json' }, signal, timeout: 60000 });
        return response.data;
    };
    return { api, user, request };
}

/** The optional Movie Sources server plugin: absent or disabled means no source badge anywhere. */
export function useSourceCapability() {
    const { api, user, request } = useSourceRequest();
    const capability = useQuery({ queryKey: ['MovieSources', api?.basePath, user?.Id], enabled: !!api && !!user?.Id,
        queryFn: ({ signal }) => request<Capability>('Capabilities', signal), staleTime: 300000, retry: false });
    return { movies: !!(capability.data?.Enabled ?? capability.data?.enabled), series: !!(capability.data?.Series ?? capability.data?.series) && !!(capability.data?.Enabled ?? capability.data?.enabled) };
}

export function statusOf(query: { isPending: boolean; isError: boolean }, found: boolean | undefined): SourceStatus {
    if (query.isError) return 'unknown';
    if (query.isPending) return 'pending';
    return found ? 'found' : 'empty';
}

/** Has the film been published on the configured torrent indexers? Indicative only. */
function useMovieSearch(imdbId: string | undefined, enabled: boolean): { status?: SourceStatus; languages: SourceLanguage[] } {
    const { api, user, request } = useSourceRequest();
    const capability = useSourceCapability();
    const active = capability.movies && enabled && !!imdbId && IMDB.test(imdbId);
    const search = useQuery({ queryKey: ['MovieSources', api?.basePath, user?.Id, 'MovieTags', imdbId], enabled: active,
        queryFn: async ({ signal }) => {
            const result = await request<{ Found?: boolean; found?: boolean; Languages?: unknown; languages?: unknown }>(`Movies/${imdbId}`, signal);
            if (typeof (result.Found ?? result.found) !== 'boolean') throw new Error('Réponse invalide');
            return { found: !!(result.Found ?? result.found), languages: cleanLanguages(result.Languages ?? result.languages) };
        }, staleTime: 300000, retry: retryLimited, retryDelay: 6000, refetchOnWindowFocus: false });
    return { status: active ? statusOf(search, search.data?.found) : undefined, languages: search.data?.languages || [] };
}

export function useMovieSource(imdbId: string | undefined, enabled: boolean): SourceStatus | undefined {
    return useMovieSearch(imdbId, enabled).status;
}

export function useMovieLanguages(imdbId: string | undefined, enabled: boolean): SourceLanguage[] {
    return useMovieSearch(imdbId, enabled).languages;
}

/** Same question per season of a series; a season missing from the answer stays unknown. */
function useSeasonSearch(imdbId: string | undefined, seasons: number[]): { statuses?: Record<number, SourceStatus>; languages: Record<number, SourceLanguage[]> } {
    const { api, user, request } = useSourceRequest();
    const capability = useSourceCapability();
    const wanted = seasons.slice(0, 12).sort((a, b) => a - b);
    const active = capability.series && !!imdbId && IMDB.test(imdbId) && wanted.length > 0;
    const search = useQuery({ queryKey: ['MovieSources', api?.basePath, user?.Id, 'SeriesTags', imdbId, wanted.join(',')], enabled: active,
        queryFn: async ({ signal }) => {
            const result = await request<{ Seasons?: Record<string, boolean>; seasons?: Record<string, boolean>; Languages?: Record<string, unknown>; languages?: Record<string, unknown> }>(`Series/${imdbId}?seasons=${wanted.join(',')}`, signal);
            const found = result.Seasons ?? result.seasons;
            if (!found || typeof found !== 'object') throw new Error('Réponse invalide');
            const tags = result.Languages ?? result.languages ?? {};
            return { found, languages: Object.fromEntries(Object.entries(tags).map(([key, value]) => [key, cleanLanguages(value)])) };
        }, staleTime: 300000, retry: retryLimited, retryDelay: 6000, refetchOnWindowFocus: false });
    if (!active) return { languages: {} };
    const statuses: Record<number, SourceStatus> = {};
    for (const season of wanted) {
        const known = search.data?.found[String(season)];
        if (search.isError || (search.data && typeof known !== 'boolean')) statuses[season] = 'unknown';
        else if (search.isPending) statuses[season] = 'pending';
        else statuses[season] = known ? 'found' : 'empty';
    }
    const languages: Record<number, SourceLanguage[]> = {};
    for (const season of wanted) languages[season] = search.data?.languages[String(season)] || [];
    return { statuses, languages };
}

export function useSeasonSources(imdbId: string | undefined, seasons: number[]): Record<number, SourceStatus> | undefined {
    return useSeasonSearch(imdbId, seasons).statuses;
}

export function useSeasonLanguages(imdbId: string | undefined, seasons: number[]): Record<number, SourceLanguage[]> {
    return useSeasonSearch(imdbId, seasons).languages;
}
