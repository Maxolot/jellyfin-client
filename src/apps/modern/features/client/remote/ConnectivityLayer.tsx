/* eslint-disable react/jsx-no-bind -- Actions are local to these small panels. */
import React, { useCallback, useEffect, useState } from 'react';
import { useApi } from 'hooks/useApi';

import ClientDialog from '../ClientDialog';
import ClientIcon from '../ClientIcon';
import { formatClock } from '../mediaInfo';
import { languageLabel, normalizeLanguage } from '../trackChoice';
import RangeControl from './RangeControl';
import RemoteIcon from './RemoteIcon';
import { groupStateLabel, participantsLabel, targetKind, targetLabel, type PlayTarget } from './remoteModel';
import { chooseTarget, loadTargets, playHere, useRemoteCommands, useActiveTarget, useRemoteState } from './useRemote';
import { useSyncPlay, type SyncGroup } from './useSyncPlay';
import './remote.scss';

type Panel = 'targets' | 'remote' | 'together';
const OPEN_EVENT = 'client:connectivity';

/** Opens « Lire sur… » or « Regarder ensemble » from anywhere in the client (profile menu, player). */
export function openConnectivity(panel: 'targets' | 'together') {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: panel }));
}

const TEN_SECONDS = 100000000;

function streamName(stream: { Language?: string | null; DisplayTitle?: string | null; Title?: string | null; Codec?: string | null }) {
    const code = normalizeLanguage(stream.Language);
    return code && code !== 'und' ? languageLabel(code) : stream.Title || stream.DisplayTitle || stream.Codec?.toUpperCase() || 'Piste';
}

function TargetsPanel({ open, onClose, openRemote }: Readonly<{ open: boolean; onClose: () => void; openRemote: () => void }>) {
    const { info, remote: isRemote } = useActiveTarget();
    const [targets, setTargets] = useState<PlayTarget[]>();
    const [failed, setFailed] = useState(false);
    const [selecting, setSelecting] = useState(false);
    const [selectionError, setSelectionError] = useState('');
    const sync = useSyncPlay();
    const select = async (target: PlayTarget) => {
        setSelecting(true);
        setSelectionError('');
        try {
            await chooseTarget(target);
            openRemote();
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            setSelectionError('Impossible de joindre cet appareil. Actualisez la liste et réessayez.');
        } finally {
            setSelecting(false);
        }
    };
    const refresh = useCallback(() => {
        setFailed(false);
        setTargets(undefined);
        loadTargets().then(setTargets).catch(() => {
            setFailed(true);
            setTargets([]);
        });
    }, []);
    useEffect(() => {
        if (open) refresh();
    }, [open, refresh]);
    return <ClientDialog controlled={{ open, onClose }} label='Lire sur…' title='Lire sur…' subtitle='Choisissez l’appareil qui lancera les titres'>
        <div className='client-remote-panel'>
            <ul className='client-remote-list'>
                <li><button type='button' className='client-remote-row' aria-pressed={!isRemote} onClick={() => {
                    playHere();
                    onClose();
                }}><RemoteIcon name='here' /><span><strong>Ce navigateur</strong><small>Lecture ici</small></span></button></li>
                {targets?.map(target => <li key={target.id}><button type='button' className='client-remote-row' data-target-id={target.id} disabled={selecting || !!sync.group} aria-pressed={isRemote && info?.id === target.id} onClick={() => { void select(target); }}><RemoteIcon name={targetKind(target)} /><span><strong>{targetLabel(target)}</strong><small>{target.user?.Name ? `Session de ${target.user.Name}` : 'Disponible'}</small></span></button></li>)}
            </ul>
            {sync.group && <p className='client-remote-note'>Quittez le groupe avant de choisir un autre appareil.</p>}
            {selectionError && <p role='alert' className='client-remote-note is-error'>{selectionError}</p>}
            {selecting && <p role='status' className='client-remote-note'>Connexion à l’appareil…</p>}
            {!targets && <p role='status' className='client-remote-note'>Recherche des appareils…</p>}
            {failed && <p role='alert' className='client-remote-note'>Impossible de lister les appareils pour le moment.</p>}
            {targets && !targets.length && !failed && <p className='client-remote-note'>Aucun autre appareil disponible. Ouvrez l’application sur votre TV, votre téléphone ou un autre navigateur avec ce compte, puis actualisez.</p>}
            <div className='client-remote-actions'>
                <button type='button' className='client-remote-pill' onClick={refresh}>Actualiser</button>
                {isRemote && <button type='button' className='client-remote-pill is-primary' onClick={() => {
                    onClose();
                    openRemote();
                }}><RemoteIcon name='remote' />Télécommande</button>}
            </div>
        </div>
    </ClientDialog>;
}

function RemotePanel({ open, onClose }: Readonly<{ open: boolean; onClose: () => void }>) {
    const { info, remote: isRemote } = useActiveTarget();
    const state = useRemoteState(open && isRemote);
    const remote = useRemoteCommands();
    const device = info?.deviceName || 'l’autre appareil';
    useEffect(() => {
        // The device left: nothing is left to control.
        if (open && !isRemote) onClose();
    }, [open, isRemote, onClose]);
    const item = state.item;
    const title = item ? [item.SeriesName, item.Name].filter(Boolean).join(' · ') : '';
    return <ClientDialog controlled={{ open, onClose }} label='Télécommande' title='Télécommande' subtitle={`Sur ${device}`}>
        <div className='client-remote-panel client-remote-control'>
            {state.unreachable && <p role='status' className='client-remote-note'>Connexion interrompue. Les informations peuvent dater ; nouvelle tentative en cours…</p>}
            {remote.error && <p role='alert' className='client-remote-note is-error'>{remote.error}</p>}
            {item ? <>
                <p className='client-remote-title'>{title}</p>
                <RangeControl className='client-remote-progress' label='Position' value={state.position} max={state.duration || 1} step={TEN_SECONDS} text={`${formatClock(state.position)} sur ${formatClock(state.duration)}`} onChange={remote.seek} />
                <div className='client-remote-times'><span>{formatClock(state.position)}</span><span>{formatClock(state.duration)}</span></div>
                <div className='client-remote-transport'>
                    <button type='button' aria-label='Précédent' onClick={remote.previous}><RemoteIcon name='previous' /></button>
                    <button type='button' aria-label='Reculer de 10 secondes' onClick={() => remote.seek(state.position - TEN_SECONDS)}><RemoteIcon name='rewind' /></button>
                    <button type='button' className='is-main' aria-label={state.paused ? 'Lecture' : 'Pause'} onClick={remote.playPause}><RemoteIcon name={state.paused ? 'play' : 'pause'} /></button>
                    <button type='button' aria-label='Avancer de 30 secondes' onClick={() => remote.seek(state.position + 3 * TEN_SECONDS)}><RemoteIcon name='forward' /></button>
                    <button type='button' aria-label='Suivant' onClick={remote.next}><RemoteIcon name='next' /></button>
                </div>
                <div className='client-remote-volume'>
                    <button type='button' aria-label={state.muted ? 'Rétablir le son' : 'Couper le son'} aria-pressed={state.muted} onClick={remote.mute}><ClientIcon name={state.muted ? 'muted' : 'volume'} /></button>
                    <RangeControl label='Volume' value={state.muted ? 0 : state.volume} max={100} step={5} text={`${Math.round(state.volume)} %`} onChange={remote.volume} />
                </div>
                {state.audio.length > 1 && <section><h3>Audio</h3><div className='client-remote-choices'>{state.audio.map(stream => <button type='button' key={stream.Index} aria-pressed={state.audioIndex === stream.Index} onClick={() => remote.audio(stream.Index ?? 0)}>{streamName(stream)}</button>)}</div></section>}
                {state.subtitles.length > 0 && <section><h3>Sous-titres</h3><div className='client-remote-choices'>
                    <button type='button' aria-pressed={state.subtitleIndex === -1} onClick={() => remote.subtitles(-1)}>Aucun</button>
                    {state.subtitles.map(stream => <button type='button' key={stream.Index} aria-pressed={state.subtitleIndex === stream.Index} onClick={() => remote.subtitles(stream.Index ?? -1)}>{streamName(stream)}</button>)}
                </div></section>}
                <button type='button' className='client-remote-pill' onClick={remote.stop}><RemoteIcon name='stop' />Arrêter la lecture</button>
            </> : <p className='client-remote-note'>Rien en cours sur {device}. Lancez un titre depuis une fiche : il démarrera là-bas.</p>}
            <button type='button' className='client-remote-pill' onClick={() => {
                playHere();
                onClose();
            }}><RemoteIcon name='here' />Revenir sur ce navigateur</button>
        </div>
    </ClientDialog>;
}

function TogetherPanel({ open, onClose }: Readonly<{ open: boolean; onClose: () => void }>) {
    const sync = useSyncPlay();
    const { remote: isRemote } = useActiveTarget();
    const [groups, setGroups] = useState<SyncGroup[]>();
    const [problem, setProblem] = useState('');
    const [pending, setPending] = useState(false);
    const { listGroups } = sync;
    const refresh = useCallback(() => {
        setProblem('');
        setGroups(undefined);
        listGroups().then(setGroups).catch(() => {
            setGroups([]);
            setProblem('Impossible de lister les groupes pour le moment.');
        });
    }, [listGroups]);
    useEffect(() => {
        if (open && !sync.group && sync.available) refresh();
    }, [open, sync.group, sync.available, refresh]);
    const act = (action: () => Promise<void> | void | undefined) => {
        if (pending) return;
        setProblem('');
        setPending(true);
        Promise.resolve().then(action).catch(() => setProblem('Cette action n’a pas abouti. Vérifiez la connexion et l’autorisation de lecture du navigateur.')).finally(() => setPending(false));
    };
    let content;
    if (isRemote) {
        content = <p className='client-remote-note'>Revenez sur ce navigateur avant de rejoindre un groupe.</p>;
    } else if (!sync.available) {
        content = <p className='client-remote-note'>Regarder ensemble n’est pas activé pour votre compte. L’administrateur du serveur peut l’autoriser.</p>;
    } else if (sync.group) {
        content = <>
            <div className='client-together-group'>
                <RemoteIcon name='people' />
                <span><strong>{sync.group.GroupName || 'Votre groupe'}</strong><small>{participantsLabel(sync.group.Participants)}</small></span>
            </div>
            <p className='client-remote-note' role='status'>{sync.syncing ? 'Synchronisation en cours…' : groupStateLabel(sync.state)}</p>
            <div className='client-remote-actions'>
                {sync.playing && <button type='button' disabled={pending} className='client-remote-pill' onClick={() => act(sync.pauseAll)}><RemoteIcon name='pause' />Pause pour tous</button>}
                {!sync.playing && sync.hasQueue && <button type='button' disabled={pending} className='client-remote-pill is-primary' onClick={() => act(sync.resumeAll)}><RemoteIcon name='play' />Reprendre pour tous</button>}
                <button type='button' disabled={pending} className='client-remote-pill' onClick={() => act(sync.leave)}>Quitter le groupe</button>
            </div>
        </>;
    } else {
        content = <>
            <p className='client-remote-note'>Lancez un titre en même temps que vos proches, chacun sur son écran : lecture, pause et position restent communes.</p>
            <ul className='client-remote-list'>
                {groups?.map(entry => <li key={entry.GroupId}><button type='button' disabled={pending} className='client-remote-row' onClick={() => act(() => entry.GroupId ? sync.join(entry.GroupId) : undefined)}>
                    <RemoteIcon name='people' /><span><strong>{entry.GroupName || 'Groupe'}</strong><small>{participantsLabel(entry.Participants)}</small></span>
                </button></li>)}
            </ul>
            {!groups && <p role='status' className='client-remote-note'>Recherche des groupes…</p>}
            {groups && !groups.length && <p className='client-remote-note'>{sync.rights.create ? 'Aucun groupe en cours : créez le vôtre.' : 'Aucun groupe en cours. Votre compte peut seulement rejoindre un groupe créé par quelqu’un d’autre.'}</p>}
            <div className='client-remote-actions'>
                <button type='button' disabled={pending} className='client-remote-pill' onClick={refresh}>Actualiser</button>
                {sync.rights.create && <button type='button' disabled={pending} className='client-remote-pill is-primary' onClick={() => act(sync.create)}><RemoteIcon name='people' />Créer un groupe</button>}
            </div>
        </>;
    }
    return <ClientDialog controlled={{ open, onClose }} label='Regarder ensemble' title='Regarder ensemble' subtitle={sync.group ? 'Vous êtes dans un groupe' : undefined}>
        <div className='client-remote-panel'>
            {content}
            {pending && <p role='status' className='client-remote-note'>Mise à jour du groupe…</p>}
            {problem && <p role='alert' className='client-remote-note is-error'>{problem}</p>}
        </div>
    </ClientDialog>;
}

/** Small pill telling that this account watches with others; also placed in the player. */
export function TogetherBadge({ className = '' }: Readonly<{ className?: string }>) {
    const sync = useSyncPlay();
    if (!sync.group) return null;
    const count = sync.group.Participants?.length || 1;
    return <button type='button' className={`client-together-badge ${className}`} aria-label={`Regarder ensemble : ${participantsLabel(sync.group.Participants)}. Ouvrir le groupe`} onClick={() => openConnectivity('together')}>
        <RemoteIcon name='people' /><span>Ensemble · {count}</span>{sync.syncing && <i className='client-together-sync' aria-hidden='true' />}
    </button>;
}

/** Mounted once in the client: the two panels, the remote bar and the group pill. */
function ConnectivitySession() {
    const [panel, setPanel] = useState<Panel | null>(null);
    const { info, remote: isRemote } = useActiveTarget();
    const state = useRemoteState(isRemote && panel !== 'remote');
    const remote = useRemoteCommands();
    useEffect(() => {
        document.documentElement.classList.add('client-connectivity-active');
        return () => document.documentElement.classList.remove('client-connectivity-active');
    }, []);
    useEffect(() => {
        const open = (event: Event) => setPanel((event as CustomEvent<Panel>).detail);
        window.addEventListener(OPEN_EVENT, open);
        return () => window.removeEventListener(OPEN_EVENT, open);
    }, []);
    const openRemote = useCallback(() => setPanel('remote'), []);
    const closeTargets = useCallback(() => setPanel(current => current === 'targets' ? null : current), []);
    const closeRemote = useCallback(() => setPanel(current => current === 'remote' ? null : current), []);
    const closeTogether = useCallback(() => setPanel(current => current === 'together' ? null : current), []);
    const title = state.item ? state.item.SeriesName || state.item.Name : undefined;
    return <>
        {isRemote && <div className='client-remote-bar' role='region' aria-label='Lecture sur un autre appareil'>
            <RemoteIcon name='cast' />
            <span className='client-remote-bar-text'><small>Sur {info?.deviceName || 'un autre appareil'}</small><strong>{title || 'Prêt à lancer un titre'}</strong></span>
            {title && <button type='button' className='client-remote-bar-button' aria-label={state.paused ? 'Lecture' : 'Pause'} onClick={remote.playPause}><RemoteIcon name={state.paused ? 'play' : 'pause'} /></button>}
            <button type='button' className='client-remote-bar-button' aria-label='Ouvrir la télécommande' onClick={openRemote}><RemoteIcon name='remote' /></button>
            <button type='button' className='client-remote-bar-button' aria-label='Revenir sur ce navigateur' onClick={playHere}><RemoteIcon name='here' /></button>
        </div>}
        {remote.error && <div className='client-remote-command-error' role='alert'>{remote.error}</div>}
        <TogetherBadge className='is-floating' />
        <TargetsPanel open={panel === 'targets'} onClose={closeTargets} openRemote={openRemote} />
        <RemotePanel open={panel === 'remote'} onClose={closeRemote} />
        <TogetherPanel open={panel === 'together'} onClose={closeTogether} />
    </>;
}
/** Keep controls alive when navigating from the library into the player, and isolate accounts. */
export default function ConnectivityLayer() {
    const { user, api } = useApi();
    return user?.Id ? <ConnectivitySession key={`${api?.basePath}:${user.Id}`} /> : null;
}
/* eslint-enable react/jsx-no-bind */
