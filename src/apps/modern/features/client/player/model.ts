import type { MediaSegmentDto, TrickplayInfoDto } from '@jellyfin/sdk/lib/generated-client';

export const SECOND = 10000000;
export function formatTime(seconds: number): string {
    const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const minutes = Math.floor(value / 60);
    const hours = minutes >= 60 ? String(Math.floor(minutes / 60)) + ':' : '';
    return `${hours}${String(minutes % 60).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
export function clampSeek(seconds: number, duration: number): number {
    return Math.max(0, Math.min(Math.max(0, duration - 0.1), seconds));
}
export function activeSegment(segments: MediaSegmentDto[], seconds: number) {
    return segments.find(segment => ['Intro', 'Outro', 'Recap'].includes(segment.Type || '')
        && typeof segment.StartTicks === 'number' && typeof segment.EndTicks === 'number'
        && segment.EndTicks > segment.StartTicks && seconds * SECOND >= segment.StartTicks && seconds * SECOND < segment.EndTicks);
}
export function trickplayTile(info: TrickplayInfoDto, seconds: number) {
    const { Width: width, Height: height, TileWidth: columns, TileHeight: rows, Interval: interval } = info;
    if (!width || !height || !columns || !rows || !interval) return undefined;
    const tile = Math.floor(Math.max(0, seconds) * 1000 / interval);
    const offset = tile % (columns * rows);
    return { index: Math.floor(tile / (columns * rows)), width, height, x: -(offset % columns) * width, y: -Math.floor(offset / columns) * height };
}
