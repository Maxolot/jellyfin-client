import type { ActivityLogEntry, BaseItemDto, FolderStorageDto, SessionInfoDto, SystemStorageDto, TaskInfo, TranscodingInfo, UserDto, UserPolicy } from '@jellyfin/sdk/lib/generated-client';
import { episodeCode } from '../labels';

/** Pure helpers of the Administration section, kept apart from the screens so that they can be tested. */

const TICKS_PER_SECOND = 10000000;

/** A count with its noun, plural from two on: "1 compte", "3 comptes". */
export function plural(count: number, noun: string) {
    return `${count} ${noun}${count > 1 ? 's' : ''}`;
}

function converted(direct: boolean | undefined, what: string, codec: string | null | undefined) {
    if (direct) return `${what} d’origine`;
    const ending = what === 'vidéo' ? 'convertie' : 'converti';
    return codec ? `${what} ${ending} en ${codec.toUpperCase()}` : `${what} ${ending}`;
}

export function playMethodLabel(method: string | null | undefined) {
    switch (method) {
        case 'DirectPlay': return 'Lecture directe';
        case 'DirectStream': return 'Flux direct';
        case 'Transcode': return 'Transcodage';
        default: return 'Mode inconnu';
    }
}

const REASONS: Record<string, string> = {
    ContainerNotSupported: 'conteneur non pris en charge',
    VideoCodecNotSupported: 'codec vidéo non pris en charge',
    AudioCodecNotSupported: 'codec audio non pris en charge',
    SubtitleCodecNotSupported: 'sous-titres à incruster',
    AudioIsExternal: 'piste audio externe',
    SecondaryAudioNotSupported: 'piste audio secondaire',
    VideoProfileNotSupported: 'profil vidéo non pris en charge',
    VideoLevelNotSupported: 'niveau vidéo non pris en charge',
    VideoResolutionNotSupported: 'résolution trop élevée',
    VideoBitDepthNotSupported: 'profondeur de couleur',
    VideoFramerateNotSupported: 'fréquence d’images',
    RefFramesNotSupported: 'images de référence',
    AnamorphicVideoNotSupported: 'vidéo anamorphique',
    InterlacedVideoNotSupported: 'vidéo entrelacée',
    AudioChannelsNotSupported: 'nombre de canaux audio',
    AudioProfileNotSupported: 'profil audio',
    AudioSampleRateNotSupported: 'fréquence audio',
    AudioBitDepthNotSupported: 'profondeur audio',
    ContainerBitrateExceedsLimit: 'débit au-dessus de la limite',
    VideoBitrateNotSupported: 'débit vidéo trop élevé',
    AudioBitrateNotSupported: 'débit audio trop élevé',
    UnknownVideoStreamInfo: 'vidéo non analysée',
    UnknownAudioStreamInfo: 'audio non analysé',
    DirectPlayError: 'échec de la lecture directe',
    VideoRangeTypeNotSupported: 'HDR non pris en charge',
    VideoCodecTagNotSupported: 'variante de codec',
    StreamCountExceedsLimit: 'trop de pistes',
    VideoRotationNotSupported: 'rotation de la vidéo'
};

export function transcodeReasons(info: TranscodingInfo | null | undefined) {
    return (info?.TranscodeReasons || []).map(reason => REASONS[reason] || reason);
}

/** What the server converts during a transcode, in one short line. */
export function transcodeSummary(info: TranscodingInfo | null | undefined) {
    if (!info) return undefined;
    const video = converted(info.IsVideoDirect, 'vidéo', info.VideoCodec);
    const audio = converted(info.IsAudioDirect, 'audio', info.AudioCodec);
    const hardware = info.HardwareAccelerationType && info.HardwareAccelerationType !== 'none' ? `accélération ${info.HardwareAccelerationType.toUpperCase()}` : undefined;
    return [video, audio, hardware].filter(Boolean).join(' · ');
}

/** Sessions that are playing something, most recent first. */
export function nowPlaying(sessions: SessionInfoDto[] | undefined) {
    return (sessions || []).filter(session => session.NowPlayingItem)
        .sort((a, b) => Date.parse(b.LastActivityDate || '') - Date.parse(a.LastActivityDate || ''));
}

export function itemTitle(item: BaseItemDto | null | undefined) {
    if (!item) return '';
    if (item.Type === 'Episode') {
        const number = item.ParentIndexNumber != null && item.IndexNumber != null ? episodeCode(item.ParentIndexNumber, item.IndexNumber) : undefined;
        return [item.SeriesName, number, item.Name].filter(Boolean).join(' · ');
    }
    return [item.Name, item.ProductionYear].filter(Boolean).join(' · ');
}

export function progressShare(position: number | null | undefined, runtime: number | null | undefined) {
    if (!position || !runtime) return 0;
    return Math.min(100, Math.max(0, (position / runtime) * 100));
}

export function formatDuration(ticks: number | null | undefined) {
    const total = Math.max(0, Math.round((ticks || 0) / TICKS_PER_SECOND));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours) return `${hours} h ${String(minutes).padStart(2, '0')}`;
    if (minutes) return `${minutes} min`;
    return `${total} s`;
}

export type Volume = { key: string; free: number; used: number; total: number; share: number; paths: string[]; uses: string[] };

const FOLDER_USES: [keyof SystemStorageDto, string][] = [
    ['ProgramDataFolder', 'Données'], ['CacheFolder', 'Cache'], ['ImageCacheFolder', 'Images'], ['InternalMetadataFolder', 'Métadonnées'],
    ['TranscodingTempFolder', 'Transcodage'], ['LogFolder', 'Journaux'], ['WebFolder', 'Interface']
];

/**
 * One entry per disk, so that its space is counted once. Containers give each mount its own device id, so folders
 * whose free and used space match to the byte are the same disk too. Folders the server could not measure are left out.
 */
export function storageVolumes(storage: SystemStorageDto | undefined): Volume[] {
    if (!storage) return [];
    const folders: [FolderStorageDto, string][] = [
        ...(storage.Libraries || []).flatMap(library => (library.Folders || []).map(folder => [folder, library.Name] as [FolderStorageDto, string])),
        ...FOLDER_USES.map(([key, use]) => [storage[key] as FolderStorageDto | undefined, use] as const)
            .filter((entry): entry is [FolderStorageDto, string] => !!entry[0])
    ];
    const volumes = new Map<string, Volume>();
    const devices = new Map<string, string>();
    for (const [folder, use] of folders) {
        const free = folder.FreeSpace ?? -1;
        const used = folder.UsedSpace ?? -1;
        if (free < 0 || used < 0 || free + used <= 0) continue;
        const size = `${free}:${used}`;
        const key = (folder.DeviceId && devices.get(folder.DeviceId)) || size;
        if (folder.DeviceId) devices.set(folder.DeviceId, key);
        const volume = volumes.get(key) || { key, free, used, total: free + used, share: 0, paths: [], uses: [] };
        if (!volume.paths.includes(folder.Path)) volume.paths.push(folder.Path);
        if (!volume.uses.includes(use)) volume.uses.push(use);
        volumes.set(key, volume);
    }
    return [...volumes.values()].map(volume => ({ ...volume, share: (volume.used / volume.total) * 100 }))
        .sort((a, b) => b.total - a.total);
}

export function volumeTone(volume: Pick<Volume, 'share' | 'free'>) {
    if (volume.share >= 95 || volume.free < 20 * 1024 ** 3) return 'error';
    if (volume.share >= 85) return 'warning';
    return 'ok';
}

export function isRunning(task: TaskInfo) {
    return task.State === 'Running' || task.State === 'Cancelling';
}

export function taskResult(task: TaskInfo): { tone: 'ok' | 'warning' | 'error' | 'off'; label: string } {
    switch (task.LastExecutionResult?.Status) {
        case 'Completed': return { tone: 'ok', label: 'Réussie' };
        case 'Failed': return { tone: 'error', label: 'Échec' };
        case 'Cancelled':
        case 'Aborted': return { tone: 'warning', label: 'Interrompue' };
        default: return { tone: 'off', label: 'Jamais lancée' };
    }
}

/** Tasks by category, the running ones first in each. */
export function taskGroups(tasks: TaskInfo[] | undefined) {
    const groups = new Map<string, TaskInfo[]>();
    for (const task of tasks || []) {
        if (task.IsHidden) continue;
        const category = task.Category || 'Autres';
        groups.set(category, [...(groups.get(category) || []), task]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'))
        .map(([category, entries]) => ({ category, tasks: [...entries].sort((a, b) => Number(isRunning(b)) - Number(isRunning(a)) || (a.Name || '').localeCompare(b.Name || '', 'fr')) }));
}

export function relativeTime(date: string | null | undefined, now = Date.now()) {
    const time = Date.parse(date || '');
    if (Number.isNaN(time)) return 'jamais';
    const seconds = Math.round((now - time) / 1000);
    if (seconds < 60) return 'à l’instant';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `il y a ${hours} h`;
    const days = Math.round(hours / 24);
    if (days < 31) return `il y a ${days} j`;
    return new Date(time).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function severityTone(severity: ActivityLogEntry['Severity']) {
    switch (severity) {
        case 'Error':
        case 'Critical': return 'error';
        case 'Warning': return 'warning';
        default: return 'off';
    }
}

/** Why an account cannot be disabled, if it cannot: not the account in use, and never the last active administrator. */
export function disableBlocker(target: UserDto, currentUserId: string | undefined, users: UserDto[] | undefined) {
    if (target.Id === currentUserId) return 'C’est le compte que vous utilisez.';
    const admins = (users || []).filter(user => user.Policy?.IsAdministrator && !user.Policy.IsDisabled);
    if (target.Policy?.IsAdministrator && !target.Policy.IsDisabled && admins.length <= 1) return 'C’est le dernier administrateur actif.';
    return undefined;
}

export type PolicyChanges = Partial<Pick<UserPolicy, 'IsDisabled' | 'EnableRemoteAccess' | 'EnableContentDownloading' | 'EnableCollectionManagement'
    | 'EnableContentDeletion' | 'EnableVideoPlaybackTranscoding' | 'EnableSubtitleManagement' | 'EnableAllFolders' | 'EnabledFolders' | 'RemoteClientBitrateLimit'>>;

/** The server's latest policy with the form's changes on top: fields the form does not show are kept as they are. */
export function withPolicy(server: UserPolicy, changes: PolicyChanges): UserPolicy {
    const next = { ...server, ...changes };
    if (next.EnableAllFolders) next.EnabledFolders = server.EnabledFolders || [];
    return next;
}

/** The changes made in the form compared with the policy it started from. */
export function policyChanges(start: UserPolicy, edited: UserPolicy): PolicyChanges {
    const keys: (keyof PolicyChanges)[] = ['IsDisabled', 'EnableRemoteAccess', 'EnableContentDownloading', 'EnableCollectionManagement', 'EnableContentDeletion',
        'EnableVideoPlaybackTranscoding', 'EnableSubtitleManagement', 'EnableAllFolders', 'EnabledFolders', 'RemoteClientBitrateLimit'];
    const changes: PolicyChanges = {};
    for (const key of keys) {
        if (JSON.stringify(start[key] ?? null) !== JSON.stringify(edited[key] ?? null)) (changes as Record<string, unknown>)[key] = edited[key];
    }
    return changes;
}
