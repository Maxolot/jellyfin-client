/** Pure helpers of the remote control and « Regarder ensemble », kept apart from the engine for tests. */

export type PlayTarget = {
    id: string;
    name: string;
    deviceName?: string;
    deviceType?: string;
    appName?: string;
    playerName: string;
    isLocalPlayer: boolean;
    playableMediaTypes?: string[];
    supportedCommands?: string[];
    user?: { Id?: string; Name?: string } | null;
};

/** Only devices that can show a video, never this browser itself (it has its own entry). */
export function videoTargets(targets: PlayTarget[]) {
    return targets.filter(target => !target.isLocalPlayer && (!target.playableMediaTypes || target.playableMediaTypes.includes('Video')));
}

export function targetLabel(target: Pick<PlayTarget, 'name' | 'appName'>) {
    return target.appName && target.appName !== target.name ? `${target.name} · ${target.appName}` : target.name;
}

export function targetKind(target: Pick<PlayTarget, 'deviceType' | 'appName' | 'name'>): 'tv' | 'phone' | 'computer' {
    const text = `${target.deviceType || ''} ${target.appName || ''} ${target.name || ''}`.toLowerCase();
    if (/\btv\b|android ?tv|webos|tizen|roku|kodi|chromecast|fire ?tv|firestick/.test(text)) return 'tv';
    if (/iphone|ipad|android|mobile|phone|swiftfin|findroid/.test(text)) return 'phone';
    return 'computer';
}

const TICKS_PER_SECOND = 10000000;

/** Where a remote device is now, moving on by itself between two reports from the server. */
export function livePosition(positionTicks: number | undefined, reportedAt: number, paused: boolean, now = Date.now(), durationTicks?: number) {
    const base = positionTicks || 0;
    const moved = paused ? 0 : Math.max(0, now - reportedAt) * TICKS_PER_SECOND / 1000;
    return durationTicks ? Math.min(durationTicks, base + moved) : base + moved;
}

export type SyncPlayAccess = 'CreateAndJoinGroups' | 'JoinGroups' | 'None';

export function syncPlayRights(access: string | null | undefined) {
    const value = (access || 'None') as SyncPlayAccess;
    return { join: value === 'CreateAndJoinGroups' || value === 'JoinGroups', create: value === 'CreateAndJoinGroups' };
}

export function groupStateLabel(state: string | undefined) {
    switch (state) {
        case 'Playing': return 'En lecture pour tout le monde';
        case 'Paused': return 'En pause pour tout le monde';
        case 'Waiting': return 'Attente des autres participants…';
        default: return 'Rien en cours : lancez un titre, il démarre pour tout le groupe';
    }
}

export function participantsLabel(participants: string[] | undefined) {
    const people = participants || [];
    if (!people.length) return 'Personne pour l’instant';
    if (people.length <= 3) return people.join(', ');
    return `${people.slice(0, 3).join(', ')} et ${people.length - 3} autre${people.length > 4 ? 's' : ''}`;
}
