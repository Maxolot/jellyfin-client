/* eslint-disable react/jsx-no-bind -- Local file actions do not cross memoized boundaries. */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';

import Page from 'components/Page';
import { useApi } from 'hooks/useApi';

import ClientDialog from '../ClientDialog';
import ClientIcon from '../ClientIcon';
import { downloader, posterName } from './downloader';
import { offlineIdentity, rememberOfflineIdentity } from './identity';
import { episodeLabel, formatBytes, progressOf, type OfflineEntry } from './model';
import { playOffline } from './playback';
import { prepareShell, shellReady } from './shell';
import { deviceSpace, keepDownloads, readSmallFile, type DeviceSpace } from './storage';
import './offline.scss';

const states = { queued: 'En attente', downloading: 'Téléchargement', paused: 'En pause', done: 'Prêt à lire', error: 'À reprendre' };

function Poster({ entry }: Readonly<{ entry: OfflineEntry }>) {
    const [url, setUrl] = useState<string>();
    const key = entry.key;
    const hasPoster = entry.hasPoster;
    useEffect(() => {
        let current: string | undefined;
        let active = true;
        if (!hasPoster) return;
        readSmallFile(posterName({ key })).then(blob => {
            if (!blob || !active) return;
            current = URL.createObjectURL(blob);
            setUrl(current);
        }).catch(() => undefined);
        return () => {
            active = false;
            if (current) URL.revokeObjectURL(current);
        };
    }, [key, hasPoster]);
    return url ? <img src={url} alt='' /> : <span className='client-offline-poster-placeholder'><ClientIcon name={entry.state === 'done' ? 'play' : 'download'} /></span>;
}

function LocalEntry({ entry, remove, action }: Readonly<{ entry: OfflineEntry; remove: (entry: OfflineEntry) => void; action: (run: () => Promise<unknown>) => void }>) {
    const percent = Math.round(progressOf(entry) * 100);
    return <article className='client-offline-entry'>
        <div className='client-offline-poster'><Poster entry={entry} /></div>
        <div className='client-offline-entry-copy'><small>{entry.seriesName ? `${entry.seriesName} · ${episodeLabel(entry)}` : entry.year || 'Film'}</small><h2>{entry.name}</h2>
            <p>{states[entry.state]}{entry.state === 'downloading' ? ` · ${percent} %` : ''} · {formatBytes(entry.bytes)}{entry.state !== 'done' && entry.estimatedBytes > entry.bytes ? ` / ≈ ${formatBytes(entry.estimatedBytes)}` : ''}</p>
            {entry.state !== 'done' && <progress aria-label={`Téléchargement de ${entry.name}`} max='100' value={percent} />}
            {entry.error && <p className='client-offline-note'>{entry.error}</p>}
            {entry.state === 'done' && entry.position.ticks > 0 && <p className='client-offline-note'>Reprendre à {Math.floor(entry.position.ticks / 600000000)} min</p>}
            <div className='client-offline-actions'>
                {entry.state === 'done' ? <button type='button' className='client-offline-button is-primary' onClick={() => action(() => playOffline(entry))}><ClientIcon name='play' />{entry.position.ticks > 0 ? 'Reprendre' : 'Lire'}</button> : <button type='button' className='client-offline-button' onClick={() => action(() => entry.state === 'queued' || entry.state === 'downloading' ? downloader.pause(entry.key) : downloader.resume(entry.key))}>{entry.state === 'queued' || entry.state === 'downloading' ? 'Mettre en pause' : 'Reprendre le téléchargement'}</button>}
                <button type='button' className='client-offline-button is-quiet' onClick={() => remove(entry)}>{entry.state === 'done' ? 'Retirer de cet appareil' : 'Annuler'}</button>
            </div>
        </div>
    </article>;
}

export default function OfflinePage() {
    const { user } = useApi();
    const entries = useSyncExternalStore(downloader.subscribe, downloader.list, downloader.list);
    const [identity, setIdentity] = useState(offlineIdentity);
    const [space, setSpace] = useState<DeviceSpace>();
    const [online, setOnline] = useState(navigator.onLine);
    const [ready, setReady] = useState(false);
    const [preparing, setPreparing] = useState<number>();
    const [error, setError] = useState('');
    const [removing, setRemoving] = useState<OfflineEntry>();
    useEffect(() => {
        if (user?.Id) rememberOfflineIdentity(user);
        setIdentity(offlineIdentity());
    }, [user]);
    useEffect(() => {
        downloader.load().catch(() => setError('Le stockage de ce navigateur n’est pas accessible.'));
        shellReady().then(setReady).catch(() => undefined);
        const network = () => setOnline(navigator.onLine);
        const updateSpace = () => {
            deviceSpace().then(setSpace).catch(() => undefined);
        };
        updateSpace();
        const timer = window.setInterval(updateSpace, 5000);
        window.addEventListener('online', network);
        window.addEventListener('offline', network);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('online', network);
            window.removeEventListener('offline', network);
        };
    }, []);
    const mine = entries.filter(entry => entry.account === identity?.account);
    const downloaded = mine.filter(entry => entry.state === 'done');
    const queue = mine.filter(entry => entry.state !== 'done');
    const action = (run: () => Promise<unknown>) => {
        setError('');
        run().catch(reason => setError(reason instanceof Error && reason.message !== 'missing' ? reason.message : 'Le fichier n’est plus accessible. Retirez-le puis téléchargez-le de nouveau.'));
    };
    const prepareLabel = ready ? 'Actualiser la copie hors ligne' : 'Préparer l’application hors ligne';
    const prepare = async () => {
        setPreparing(0);
        try {
            await prepareShell(setPreparing, true);
            await keepDownloads();
            setReady(true);
            setSpace(await deviceSpace());
        } finally { setPreparing(undefined); }
    };
    return <Page id='offlinePage' title='Hors ligne' className='client-offline-page' isBackButtonEnabled={false} isNowPlayingBarEnabled={false}>
        <section className='client-offline-shell'><header className='client-offline-header'><Link to='/client' className='client-offline-button'><ClientIcon name='back' />Médiathèque</Link><span>{online ? 'Connecté' : 'Sans connexion'}</span></header>
            <div className='client-offline-heading'><ClientIcon name='download' /><div><h1>À emporter</h1><p>{identity ? `Les téléchargements de ${identity.name}, sur cet appareil.` : 'Connectez-vous une fois pour retrouver vos téléchargements.'}</p></div></div>
            {identity && <><div className='client-offline-space'><div><strong>{formatBytes(mine.reduce((sum, entry) => sum + entry.bytes, 0))}</strong><span> de vidéos · {downloaded.length} titre{downloaded.length > 1 ? 's' : ''} prêt{downloaded.length > 1 ? 's' : ''}</span></div>
                {space && space.quota > 0 && <><progress aria-label='Espace de stockage utilisé par cette application' value={space.usage} max={space.quota} /><small>{formatBytes(Math.max(0, space.quota - space.usage))} disponibles pour ce navigateur</small></>}
                <small>{ready ? 'Application prête pour une ouverture sans réseau.' : 'Préparez l’application en ligne avant de partir.'} {space?.persisted ? 'Conservation du stockage accordée.' : 'Le navigateur peut libérer le stockage ; gardez aussi vos originaux sur le serveur.'}</small>
                {online && <button type='button' className='client-offline-button' disabled={preparing !== undefined} onClick={() => action(prepare)}>{preparing !== undefined ? `Préparation… ${Math.round(preparing * 100)} %` : prepareLabel}</button>}
            </div>
            {error && <p role='alert' className='client-offline-error'>{error}</p>}
            {queue.length > 0 && <section aria-label='File de téléchargement'><h2 className='client-offline-section-title'>En préparation <small>{queue.length}</small></h2><p className='client-offline-note'>Gardez l’application ouverte. Les téléchargements se font un par un et reprennent après une coupure.</p>{queue.map(entry => <LocalEntry key={entry.key} entry={entry} remove={setRemoving} action={action} />)}</section>}
            <section aria-label='Titres disponibles hors ligne'><h2 className='client-offline-section-title'>Prêts à regarder <small>{downloaded.length}</small></h2>{downloaded.map(entry => <LocalEntry key={entry.key} entry={entry} remove={setRemoving} action={action} />)}{!mine.length && <div className='client-offline-empty'><ClientIcon name='download' /><h2>Votre prochain voyage commence ici</h2><p>Ouvrez le menu ⋯ d’un film ou d’une série, puis choisissez Télécharger. Les vidéos complètes apparaîtront ici.</p><Link to='/client' className='client-offline-button'>Parcourir la médiathèque</Link></div>}</section>
            <p className='client-offline-note'>Les téléchargements appartiennent au compte actif. Se déconnecter ferme leur accès jusqu’à la prochaine connexion de ce compte. Sur iPad et Safari, gardez l’application au premier plan pendant le téléchargement ; le mode privé et le manque d’espace peuvent empêcher leur conservation. La progression sera synchronisée au retour du serveur.</p></>}
            {!identity && <Link className='client-offline-button is-primary' to='/login'>Se connecter</Link>}
            <ClientDialog controlled={{ open: !!removing, onClose: () => setRemoving(undefined) }} label='Retirer le téléchargement' title='Retirer de cet appareil ?' subtitle={removing?.name}>
                <p>Le fichier local et sa progression non synchronisée seront effacés. Le fichier du serveur reste disponible.</p><button type='button' className='client-offline-button is-primary' onClick={() => {
                    const entry = removing;
                    setRemoving(undefined);
                    if (entry) action(() => downloader.remove(entry.key));
                }}>Retirer le fichier local</button>
            </ClientDialog>
        </section>
    </Page>;
}
/* eslint-enable react/jsx-no-bind */
