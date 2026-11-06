/* eslint-disable react/jsx-no-bind -- Menu handlers are local to this component. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useEffect, useRef, useState } from 'react';

import { useApi } from 'hooks/useApi';

import { CastDialog, hasCast } from './DetailExtras';
import ClientIcon from './ClientIcon';
import DownloadDialog from './offline/DownloadDialog';
import { useFileTracks } from './languageTags';
import MediaInfoDialog from './MediaInfoDialog';
import { useSeerr } from './seerr/SeerrContext';
import { canRequestSeasons, RequestDialog, useMissingSeasons } from './seerr/SeerrViews';
import { choiceSummary, readTrackChoice, saveTrackChoice, type TrackChoice } from './trackChoice';
import TrackMenu from './TrackMenu';

/** Secondary actions of a media page, kept behind one "more" button so the main row stays minimal. */
export default function DetailMenu({ item, basePath, play }: Readonly<{ item: BaseItemDto; basePath: string; play: (item: BaseItemDto, startTicks?: number) => void }>) {
    const seerr = useSeerr();
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [dialog, setDialog] = useState<'cast' | 'request' | 'info' | 'download' | null>(null);
    const [tracksOpen, setTracksOpen] = useState(false);
    const { api, user } = useApi();
    const tracks = useFileTracks(item);
    const [choice, setChoice] = useState(() => readTrackChoice(api?.basePath, user?.Id, item.Id));
    const canChooseTracks = tracks.audio.length > 1 || tracks.subtitles.length > 0;
    const chooseTracks = (next: TrackChoice) => {
        setChoice(next);
        if (item.Id) saveTrackChoice(api?.basePath, user?.Id, item.Id, next);
    };
    const request = canRequestSeasons(item, seerr.connected);
    const missing = useMissingSeasons(item, request);
    let triggerLabel = 'Plus d’actions';
    if (missing > 0) {
        triggerLabel = `Plus d’actions : ${missing} saison${missing > 1 ? 's' : ''} à demander`;
    }
    useEffect(() => {
        if (!open) return;
        root.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus({ preventScroll: true });
        // A long list must fit on screen as soon as it opens.
        root.current?.querySelector('.client-more-menu')?.scrollIntoView?.({ block: 'nearest' });
    }, [open, tracksOpen]);
    useEffect(() => {
        if (!open) {
            return;
        }
        const dismiss = (event: PointerEvent) => {
            if (root.current?.contains(event.target as Node)) return;
            setOpen(false);
            setTracksOpen(false);
        };
        document.addEventListener('pointerdown', dismiss);
        return () => document.removeEventListener('pointerdown', dismiss);
    }, [open]);
    const closeMenu = (restoreFocus = true) => {
        setOpen(false);
        setTracksOpen(false);
        if (restoreFocus) trigger.current?.focus();
    };
    const openDialog = (name: 'cast' | 'request' | 'info' | 'download') => {
        setOpen(false);
        setDialog(name);
    };
    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            if (tracksOpen) setTracksOpen(false);
            else closeMenu();
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const entries = Array.from(root.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') || []);
        if (!entries.length) return;
        event.preventDefault();
        const current = entries.indexOf(document.activeElement as HTMLElement);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        entries[(current + step + entries.length) % entries.length].focus();
    };
    // Keyboard handling for the menu items; the wrapper itself is not interactive.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    return <div className='client-more' ref={root} onKeyDown={onKeyDown}>
        <button ref={trigger} type='button' className='client-button client-action-circle' aria-label={triggerLabel} title={missing ? 'Des saisons peuvent être demandées' : 'Plus d’actions'} aria-haspopup='menu' aria-expanded={open} onClick={() => setOpen(!open)}><ClientIcon name='more' />{missing > 0 && <span className='client-more-badge' aria-hidden='true' />}</button>
        {open && <div className='client-more-menu' role='menu' aria-label={tracksOpen ? 'Audio et sous-titres' : 'Plus d’actions'}>
            {tracksOpen ? <TrackMenu audio={tracks.audio} subtitles={tracks.subtitles} choice={choice} onChange={chooseTracks} onBack={() => setTracksOpen(false)} /> : <>
                {canChooseTracks && <button type='button' role='menuitem' onClick={() => setTracksOpen(true)}><ClientIcon name='volume' /><span className='client-more-text'>Audio et sous-titres<span>{choiceSummary(choice)}</span></span></button>}
                {request && <button type='button' role='menuitem' onClick={() => openDialog('request')}><ClientIcon name='plus' />Demander des saisons{missing > 0 && <small>{missing}</small>}</button>}
                {user?.Policy?.EnableContentDownloading && ['Movie', 'Series', 'Episode'].includes(item.Type || '') && <button type='button' role='menuitem' onClick={() => openDialog('download')}><ClientIcon name='download' />Télécharger</button>}
                {hasCast(item) && <button type='button' role='menuitem' onClick={() => openDialog('cast')}><ClientIcon name='collection' />Distribution et réalisation</button>}
                <button type='button' role='menuitem' onClick={() => openDialog('info')}><ClientIcon name='info' />Informations</button>
            </>}
        </div>}
        <DownloadDialog item={item} open={dialog === 'download'} onClose={() => setDialog(null)} />
        <MediaInfoDialog item={item} basePath={basePath} open={dialog === 'info'} onClose={() => setDialog(null)} play={play} choice={choice} chooseVersion={version => chooseTracks({ ...choice, version })} />
        <CastDialog item={item} basePath={basePath} open={dialog === 'cast'} onClose={() => setDialog(null)} />
        {request && <RequestDialog item={item} open={dialog === 'request'} onClose={() => setDialog(null)} />}
    </div>;
}

/* eslint-enable react/jsx-no-bind */
