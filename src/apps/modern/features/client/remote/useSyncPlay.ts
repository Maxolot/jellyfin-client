import { useCallback, useEffect, useState } from 'react';

import { pluginManager } from 'components/pluginManager';
import { PluginType } from 'constants/pluginType';
import { useApi } from 'hooks/useApi';
import Events from 'utils/events';
import playbackPermission from 'plugins/syncPlay/ui/playbackPermissionManager';

import { syncPlayRights } from './remoteModel';

export type SyncGroup = { GroupId?: string; GroupName?: string; Participants?: string[]; State?: string };

type Manager = {
    isSyncPlayEnabled: () => boolean;
    getGroupInfo: () => SyncGroup | null;
    isPlaybackActive: () => boolean;
    isPlaylistEmpty: () => boolean;
    isPlaying: () => boolean;
};

function manager(): Manager | undefined {
    return (pluginManager.firstOfType(PluginType.SyncPlay) as { instance?: { Manager?: Manager } } | undefined)?.instance?.Manager;
}

const MANAGER_EVENTS = ['enabled', 'group-update', 'group-state-update', 'group-state-change', 'playbackstart', 'playbackstop', 'pause', 'unpause'];

/** Watching together: the engine's SyncPlay, presented by the client. */
export function useSyncPlay() {
    const { user, __legacyApiClient__: client } = useApi();
    const rights = syncPlayRights((user?.Policy as { SyncPlayAccess?: string } | undefined)?.SyncPlayAccess);
    const [group, setGroup] = useState<SyncGroup | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [state, setState] = useState<string>();
    useEffect(() => {
        const current = manager();
        if (!current) return;
        const update = () => {
            const info = current.isSyncPlayEnabled() ? current.getGroupInfo() : null;
            setGroup(info ? { ...info, Participants: [...info.Participants || []] } : null);
            if (!info) setState(undefined);
        };
        const stateChange = (_event: unknown, next: string) => setState(next);
        const syncChange = (_event: unknown, active: boolean) => setSyncing(!!active);
        update();
        for (const name of MANAGER_EVENTS) Events.on(current, name, update);
        Events.on(current, 'group-state-update', stateChange);
        Events.on(current, 'group-state-change', stateChange);
        Events.on(current, 'syncing', syncChange);
        return () => {
            for (const name of MANAGER_EVENTS) Events.off(current, name, update);
            Events.off(current, 'group-state-update', stateChange);
            Events.off(current, 'group-state-change', stateChange);
            Events.off(current, 'syncing', syncChange);
        };
    }, [client]);
    const listGroups = useCallback(async (): Promise<SyncGroup[]> => {
        if (!client) return [];
        const answer = await client.getSyncPlayGroups() as unknown;
        // The legacy client returns the raw response here.
        const groups = answer && typeof (answer as Response).json === 'function' ? await (answer as Response).json() : answer;
        return Array.isArray(groups) ? groups as SyncGroup[] : [];
    }, [client]);
    const create = useCallback(async () => {
        await playbackPermission.check();
        await client?.createSyncPlayGroup({ GroupName: `Soirée de ${user?.Name || 'cinéma'}` });
    }, [client, user?.Name]);
    const join = useCallback(async (id: string) => {
        await playbackPermission.check();
        await client?.joinSyncPlayGroup({ GroupId: id });
    }, [client]);
    const leave = useCallback(() => client?.leaveSyncPlayGroup(), [client]);
    const pauseAll = useCallback(() => client?.requestSyncPlayPause(), [client]);
    const resumeAll = useCallback(() => client?.requestSyncPlayUnpause(), [client]);
    const current = manager();
    return {
        available: !!current && rights.join,
        rights,
        group,
        state: state || group?.State,
        syncing,
        playing: !!group && !!current?.isPlaying(),
        hasQueue: !!group && !current?.isPlaylistEmpty(),
        listGroups, create, join, leave, pauseAll, resumeAll
    };
}
