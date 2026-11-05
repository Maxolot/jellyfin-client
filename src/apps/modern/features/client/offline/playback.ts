import { playbackManager } from 'components/playback/playbackmanager';
import Events from 'utils/events';

import { downloader, readSmallFile, subtitleName, videoPath } from './downloader';
import { stoppedAt, TICKS_PER_SECOND, type OfflineEntry } from './model';
import { readVideo } from './storage';
import { offlineIdentity } from './identity';

/** Set while a downloaded title plays, so that the player page opens without a server. */
let current: { key: string; urls: string[]; untrack?: () => void } | undefined;
export const isPlayingOffline = () => !!current;

const SAVE_EVERY = 5000;

/**
 * Plays a downloaded title in the client's own player. The title is handed over without a server
 * identifier, so the engine neither reports it nor asks the server for anything.
 */
export async function playOffline(entry: OfflineEntry) {
    if (entry.state !== 'done' || entry.account !== offlineIdentity()?.account) throw new Error('Connectez-vous avec le compte de ce téléchargement.');
    const video = await readVideo(videoPath(entry), 'video/mp4');
    if (!video || !video.size) throw new Error('missing');
    const subtitles = entry.hasSubtitles ? await readSmallFile(subtitleName(entry)) : undefined;
    const videoUrl = URL.createObjectURL(video);
    const subtitleUrl = subtitles ? URL.createObjectURL(subtitles) : undefined;
    const streams: Record<string, unknown>[] = [
        { Index: 0, Type: 'Video', Codec: entry.quality === 'original' ? entry.videoCodec || 'h264' : 'h264', IsDefault: true },
        { Index: 1, Type: 'Audio', Codec: entry.quality === 'original' ? entry.audioCodec || 'aac' : 'aac', IsDefault: true, DisplayTitle: 'Audio' }
    ];
    if (subtitleUrl) {
        streams.push({ Index: 2, Type: 'Subtitle', Codec: 'webvtt', DisplayTitle: entry.subtitleLabel || 'Sous-titres', Language: entry.subtitleLabel,
            DeliveryMethod: 'External', DeliveryUrl: subtitleUrl, IsExternal: true, IsExternalUrl: true, IsTextSubtitleStream: true, SupportsExternalStream: true });
    }
    const resume = entry.position.played ? 0 : entry.position.ticks;
    const item = {
        Name: entry.name, Type: entry.type, MediaType: 'Video', SeriesName: entry.seriesName, ParentIndexNumber: entry.seasonNumber, IndexNumber: entry.episodeNumber,
        ProductionYear: entry.year, Overview: entry.overview, RunTimeTicks: entry.runTimeTicks, OfflineKey: entry.key, Url: videoUrl,
        LocalStreamInfo: {
            playerStartPositionTicks: resume,
            mediaSource: { Id: 'offline', Protocol: 'File', Container: 'mp4', RunTimeTicks: entry.runTimeTicks, SupportsDirectPlay: true, MediaStreams: streams,
                DefaultAudioStreamIndex: 1, DefaultSubtitleStreamIndex: subtitleUrl ? 2 : -1 }
        }
    };
    if (current) release();
    current = { key: entry.key, urls: [videoUrl, subtitleUrl].filter((url): url is string => !!url) };
    current.untrack = track(entry);
    try {
        playbackManager.setActivePlayer('localplayer');
        await playbackManager.play({ items: [item], fullscreen: true });
    } catch (error) {
        release();
        throw error;
    }
}

function release() {
    current?.untrack?.();
    current?.urls.forEach(url => {
        URL.revokeObjectURL(url);
    });
    current = undefined;
}

function track(entry: OfflineEntry) {
    let last = entry.position;
    const key = entry.key;
    const save = () => {
        const player = playbackManager.getCurrentPlayer();
        const playing = player && (playbackManager.currentItem(player) as { OfflineKey?: string } | undefined)?.OfflineKey === key;
        if (!playing) return;
        const ticks = playbackManager.currentTime(player) * 10000;
        if (!Number.isFinite(ticks) || ticks <= 0) return;
        last = stoppedAt(ticks, entry.runTimeTicks, Date.now(), last);
        void downloader.savePosition(key, last);
    };
    const timer = window.setInterval(save, SAVE_EVERY);
    const stop = (_event: unknown, info?: { state?: { PlayState?: { PositionTicks?: number | null } } }) => {
        if (current?.key !== key) return;
        const ticks = info?.state?.PlayState?.PositionTicks;
        if (ticks && ticks > TICKS_PER_SECOND) last = stoppedAt(ticks, entry.runTimeTicks, Date.now(), last);
        void downloader.savePosition(key, last).then(() => downloader.syncPositions());
        release();
    };
    Events.on(playbackManager, 'playbackstop', stop);
    return () => {
        window.clearInterval(timer);
        Events.off(playbackManager, 'playbackstop', stop);
    };
}
