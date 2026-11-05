/** Rules of the offline mode that do not depend on the browser: qualities, sizes, queue, storage and resume synchronisation. */
export type Quality = 'original' | 'high' | 'standard' | 'light';
export type EntryState = 'queued' | 'downloading' | 'paused' | 'done' | 'error';
export type Position = { ticks: number; played: boolean; updatedAt: number; syncedAt: number };

export type OfflineEntry = {
    key: string;
    account: string;
    serverId: string;
    userId: string;
    itemId: string;
    type: 'Movie' | 'Episode';
    name: string;
    seriesId?: string;
    seriesName?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    year?: number;
    overview?: string;
    officialRating?: string;
    quality: Quality;
    mediaSourceId: string;
    videoCodec?: string;
    audioCodec?: string;
    audioIndex?: number;
    subtitleIndex?: number;
    /** Picture-based subtitles cannot be kept as text: they are drawn into the picture. */
    burnSubtitle?: boolean;
    subtitleLabel?: string;
    runTimeTicks: number;
    estimatedBytes: number;
    bytes: number;
    segmentsDone: number;
    segmentsTotal: number;
    state: EntryState;
    error?: string;
    hasPoster: boolean;
    hasSubtitles: boolean;
    createdAt: number;
    completedAt?: number;
    position: Position;
};

export const TICKS_PER_SECOND = 10000000;
const AUDIO_BITRATE = 192000;

export const PRESETS: Record<Exclude<Quality, 'original'>, { label: string; maxWidth: number; videoBitrate: number }> = {
    high: { label: 'Haute', maxWidth: 1920, videoBitrate: 8000000 },
    standard: { label: 'Standard', maxWidth: 1280, videoBitrate: 4000000 },
    light: { label: 'Économie', maxWidth: 854, videoBitrate: 1500000 }
};

export const accountKey = (serverId: string, userId: string) => `${serverId.replace(/-/g, '').toLowerCase()}:${userId.replace(/-/g, '').toLowerCase()}`;
export const entryKey = (account: string, itemId: string) => `${account}:${itemId.replace(/-/g, '').toLowerCase()}`;

export function estimateBytes(quality: Quality, runTimeTicks: number, sourceSize?: number | null) {
    if (quality === 'original') return sourceSize || 0;
    const seconds = runTimeTicks / TICKS_PER_SECOND;
    return Math.round((PRESETS[quality].videoBitrate + AUDIO_BITRATE) * seconds / 8);
}

export function formatBytes(bytes: number) {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1).replace('.', ',')} Go`;
    if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} Mo`;
    return `${Math.max(1, Math.round(bytes / 1e3))} ko`;
}

type SourceStream = { Type?: string | null; Codec?: string | null; Width?: number | null };
type Source = { Container?: string | null; Size?: number | null; MediaStreams?: SourceStream[] | null };

const VIDEO_CODECS: Record<string, string> = { h264: 'avc1.640028', hevc: 'hvc1.1.6.L120.90', av1: 'av01.0.08M.08', vp9: 'vp09.00.40.08' };
const AUDIO_CODECS: Record<string, string> = { aac: 'mp4a.40.2', mp3: 'mp4a.69', opus: 'opus', flac: 'flac', ac3: 'ac-3', eac3: 'ec-3' };

/** Only a file the browser can open as it is may be kept in its original form. */
export function originalMime(source: Source) {
    const container = (source.Container || '').toLowerCase().split(',')[0];
    if (!['mp4', 'm4v', 'mov'].includes(container)) return undefined;
    const streams = source.MediaStreams || [];
    const video = streams.find(stream => stream.Type === 'Video');
    const audio = streams.find(stream => stream.Type === 'Audio');
    const videoCodec = VIDEO_CODECS[(video?.Codec || '').toLowerCase()];
    const audioCodec = audio ? AUDIO_CODECS[(audio.Codec || '').toLowerCase()] : undefined;
    if (!videoCodec || (audio && !audioCodec)) return undefined;
    return `video/mp4; codecs="${[videoCodec, audioCodec].filter(Boolean).join(', ')}"`;
}

export type QualityOption = { quality: Quality; label: string; detail: string; bytes: number };

/** The choices offered for one title, with their estimated size. */
export function qualityOptions(source: Source, runTimeTicks: number, rights: { download: boolean; transcode: boolean }, canPlay: (mime: string) => boolean): QualityOption[] {
    if (!rights.download) return [];
    const options: QualityOption[] = [];
    const mime = originalMime(source);
    if (mime && canPlay(mime) && source.Size) options.push({ quality: 'original', label: 'Originale', detail: 'Le fichier tel quel, sans perte', bytes: source.Size });
    if (rights.transcode) {
        const width = (source.MediaStreams || []).find(stream => stream.Type === 'Video')?.Width || 1920;
        // A setting above the picture itself would only waste space; the lightest one is always offered.
        const fitting = (['high', 'standard', 'light'] as const).filter(quality => quality === 'light' || PRESETS[quality].maxWidth <= width * 1.15);
        for (const quality of fitting) {
            const height = Math.round(Math.min(width, PRESETS[quality].maxWidth) * 9 / 16);
            options.push({ quality, label: PRESETS[quality].label, detail: `${height}p`, bytes: estimateBytes(quality, runTimeTicks) });
        }
    }
    return options;
}

export type StorageEstimate = { quota?: number; usage?: number };

/** Leaves a margin, so that a download never fills the device to the last byte. */
export function storageRoom(estimate: StorageEstimate, needed: number, alreadyCounted = 0) {
    const quota = estimate.quota || 0;
    const usage = estimate.usage || 0;
    const free = Math.max(0, quota - usage - quota * 0.05);
    return { free, fits: needed - alreadyCounted <= free };
}

/** Downloads run one after the other: the one already started, otherwise the oldest waiting. */
export function nextToDownload(entries: OfflineEntry[], account: string) {
    const mine = entries.filter(entry => entry.account === account);
    return mine.find(entry => entry.state === 'downloading')
        || mine.filter(entry => entry.state === 'queued').sort((a, b) => a.createdAt - b.createdAt)[0];
}

export function progressOf(entry: OfflineEntry) {
    if (entry.state === 'done') return 1;
    if (entry.segmentsTotal > 0) return Math.min(1, entry.segmentsDone / entry.segmentsTotal);
    return entry.estimatedBytes > 0 ? Math.min(1, entry.bytes / entry.estimatedBytes) : 0;
}

export type ServerUserData = { PlaybackPositionTicks?: number | null; Played?: boolean | null; LastPlayedDate?: string | null };

/**
 * What to do with a position watched offline once the server is reachable again:
 * send it, take the server's newer one, or nothing. A more recent position on the server always wins.
 */
export function decideSync(local: Position, server: ServerUserData): 'push' | 'pull' | 'none' {
    if (local.updatedAt <= local.syncedAt) return 'none';
    const serverTime = server.LastPlayedDate ? Date.parse(server.LastPlayedDate) : 0;
    if (Number.isFinite(serverTime) && serverTime > local.updatedAt) return 'pull';
    return 'push';
}

/** Where a viewer stopped: almost at the end counts as seen, and starts again from the beginning. */
export function stoppedAt(positionTicks: number, runTimeTicks: number, now: number, previous: Position): Position {
    const played = runTimeTicks > 0 && positionTicks >= runTimeTicks * 0.9;
    return { ticks: played ? 0 : Math.max(0, Math.round(positionTicks)), played: played || previous.played, updatedAt: now, syncedAt: previous.syncedAt };
}

export function episodeLabel(entry: Pick<OfflineEntry, 'seasonNumber' | 'episodeNumber'>) {
    return entry.seasonNumber != null && entry.episodeNumber != null ? `S${entry.seasonNumber}:E${entry.episodeNumber}` : '';
}
