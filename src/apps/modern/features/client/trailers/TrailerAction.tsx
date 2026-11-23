/* eslint-disable react/jsx-no-bind -- The modal controls act on its current trailer. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useEffect, useRef, useState } from 'react';

import Artwork from '../Artwork';
import ClientDialog from '../ClientDialog';
import ClientIcon from '../ClientIcon';
import { usePreviews } from '../PreviewProvider';
import { remoteTrailer, trailerEmbedUrl } from './trailerSources';
import { useLocalTrailers } from './useLocalTrailers';
import { loadYouTube, type YouTubePlayer } from './youtubePlayer';
import './trailers.scss';

type Trailer = { local: BaseItemDto[] } | { youtube: string };
type Props = { item: BaseItemDto; backdrop?: string; play: (item: BaseItemDto, startTicks?: number) => unknown };

export default function TrailerAction({ item, backdrop, play }: Readonly<Props>) {
    const enabled = ['Movie', 'Series', 'Episode'].includes(item.Type || '');
    const local = useLocalTrailers(item, enabled);
    const previews = usePreviews();
    const [open, setOpen] = useState<Trailer | null>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const youtube = remoteTrailer(item.RemoteTrailers);
    let available: Trailer | undefined;
    if (item.LocalTrailerCount !== 0 && local.data?.length) available = { local: local.data };
    else if (youtube && (item.LocalTrailerCount === 0 || local.isFetched)) available = { youtube };
    if (!enabled || (!available && !open)) return null;
    const playable = available;
    return <>
        <button ref={trigger} type='button' className='client-button client-action-circle' aria-label='Bande-annonce' title='Bande-annonce' aria-haspopup='dialog'
            onClick={() => {
                if (!playable) return;
                previews?.playback.stop();
                setOpen(playable);
            }}><ClientIcon name='clapper' /></button>
        <ClientDialog label='Bande-annonce' title='Bande-annonce' subtitle={item.Name || undefined} className='client-trailer-dialog'
            controlled={{ open: !!open, onClose: () => {
                setOpen(null);
                trigger.current?.focus({ preventScroll: true });
            } }}>
            {close => open && ('local' in open ?
                <LocalTrailer entries={open.local} backdrop={backdrop} play={trailer => {
                    close();
                    play(trailer, 0);
                }} /> : <RemoteTrailer id={open.youtube} />)}
        </ClientDialog>
    </>;
}

function LocalTrailer({ entries, backdrop, play }: Readonly<{ entries: BaseItemDto[]; backdrop?: string; play: (item: BaseItemDto) => void }>) {
    return <div className='client-local-trailers'>
        {backdrop && <div className='client-trailer-preview' aria-hidden='true'><Artwork source={backdrop} eager /></div>}
        <ul>{entries.map((trailer, index) => <li key={trailer.Id}>
            <button type='button' className='client-play' onClick={() => play(trailer)}>
                <ClientIcon name='play' />{entries.length === 1 ? 'Lire la bande-annonce' : trailer.Name || `Lire la bande-annonce ${index + 1}`}
            </button>
        </li>)}</ul>
    </div>;
}

function RemoteTrailer({ id }: Readonly<{ id: string }>) {
    const video = useRef<HTMLDivElement>(null);
    const player = useRef<YouTubePlayer>();
    const [state, setState] = useState<'loading' | 'paused' | 'playing' | 'unavailable'>('loading');
    useEffect(() => {
        const container = video.current;
        if (!container) return;
        const frame = document.createElement('iframe');
        frame.title = 'Bande-annonce YouTube';
        frame.src = trailerEmbedUrl(id, window.location.origin);
        frame.allow = 'autoplay; encrypted-media';
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.tabIndex = -1;
        // Keep focus in the dialog so Escape works during playback as well as before it.
        frame.inert = true;
        frame.setAttribute('aria-hidden', 'true');
        container.appendChild(frame);
        let closed = false;
        const timeout = window.setTimeout(() => setState('unavailable'), 18000);
        function unavailable() {
            window.clearTimeout(timeout);
            if (!closed) setState('unavailable');
        }
        function changePlayback({ data }: { data: number }) {
            if (closed) return;
            const next = data === 1 || data === 3 ? 'playing' : 'paused';
            setState(previous => previous === 'unavailable' ? previous : next);
        }
        loadYouTube().then(({ Player }) => {
            if (closed) return;
            player.current = new Player(frame, { events: {
                onReady: () => {
                    window.clearTimeout(timeout);
                    if (!closed) setState('paused');
                },
                onStateChange: changePlayback,
                onError: unavailable,
                onAutoplayBlocked: unavailable
            } });
        }).catch(unavailable);
        return () => {
            closed = true;
            window.clearTimeout(timeout);
            player.current?.destroy();
            player.current = undefined;
            frame.remove();
        };
    }, [id]);
    const playing = state === 'playing';
    const available = state === 'paused' || playing;
    return <div className='client-remote-trailer'>
        <div className='client-trailer-frame' ref={video} />
        <div className='client-trailer-controls'>
            {available && <button type='button' className='client-play' onClick={() => {
                if (playing) player.current?.pauseVideo();
                else player.current?.playVideo();
            }}>{!playing && <ClientIcon name='play' />}{playing ? 'Mettre en pause' : 'Lire la bande-annonce'}</button>}
            {state === 'loading' && <p role='status'>Chargement de la bande-annonce…</p>}
            {state === 'unavailable' && <p role='status'>La lecture intégrée est indisponible.</p>}
            <a className='client-button' href={`https://www.youtube.com/watch?v=${id}`} target='_blank' rel='noopener noreferrer'>Voir sur YouTube</a>
        </div>
    </div>;
}
/* eslint-enable react/jsx-no-bind */
