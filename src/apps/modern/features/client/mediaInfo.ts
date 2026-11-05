import type { MediaStream } from '@jellyfin/sdk/lib/generated-client';

import { languageLabel, normalizeLanguage } from './trackChoice';

const TICKS_PER_SECOND = 10000000;
const BYTES_PER_GB = 1000000000;
const BYTES_PER_MB = 1000000;

export function formatSize(bytes: number | null | undefined) {
    if (!bytes) return undefined;
    return bytes >= BYTES_PER_GB ? `${(bytes / BYTES_PER_GB).toFixed(1)} Go` : `${Math.round(bytes / BYTES_PER_MB)} Mo`;
}

export function formatBitrate(bits: number | null | undefined) {
    if (!bits) return undefined;
    return bits >= 1000000 ? `${(bits / 1000000).toFixed(1)} Mb/s` : `${Math.round(bits / 1000)} kb/s`;
}

export function formatClock(ticks: number | null | undefined) {
    const total = Math.max(0, Math.floor((ticks || 0) / TICKS_PER_SECOND));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

const parts = (...values: (string | number | null | undefined | false)[]) => values.filter(Boolean).join(' · ');
const language = (stream: MediaStream) => {
    const code = normalizeLanguage(stream.Language);
    return code && code !== 'und' ? languageLabel(code) : 'Langue inconnue';
};

export function describeVideo(stream: MediaStream) {
    const range = stream.VideoRangeType && stream.VideoRangeType !== 'SDR' ? stream.VideoRangeType : undefined;
    return parts(stream.Width && stream.Height && `${stream.Width}×${stream.Height}`, stream.Codec?.toUpperCase(), range, stream.AverageFrameRate && `${Math.round(stream.AverageFrameRate * 100) / 100} i/s`, formatBitrate(stream.BitRate));
}

export function describeAudio(stream: MediaStream) {
    return parts(language(stream), stream.Codec?.toUpperCase(), stream.ChannelLayout || (stream.Channels && `${stream.Channels} canaux`), stream.Title);
}

export function describeSubtitle(stream: MediaStream) {
    return parts(language(stream), stream.Codec?.toUpperCase(), stream.IsForced && 'forcés', stream.IsExternal && 'externes');
}

/** Only ordinary web links are ever opened from metadata. */
export function safeLink(url: string | null | undefined) {
    return url && /^https?:\/\//i.test(url) ? url : undefined;
}
