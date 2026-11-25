/* eslint-disable react/jsx-no-bind -- The page commands apply to the open folder. */
import React, { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import ActionLabel from '../ActionLabel';
import ClientDialog from '../ClientDialog';
import ClientIcon from '../ClientIcon';
import ClientSkeleton from '../ClientSkeleton';
import CollectionGrid, { type CollectionCardOptions } from '../CollectionGrid';
import CollectionHero from '../CollectionHero';
import type { PlayQueue } from '../mediaQueue';
import FolderSharing from './FolderSharing';
import { DeleteFolder, FolderError, FolderNameForm, ShareForm } from './FolderForms';
import { canEditFolder, type Folder, type FolderDetail, folderMemberKey, folderMemberPath, foldersPath, moveFolderItem, orderedFolderItems } from './model';
import { useFolderChange, useFolderDetail, useFolderTargets, useFolderTitles } from './queries';
import { ActionButton } from '../ui';
import { LABELS } from '../labels';

type Props = CollectionCardOptions & { id: string; full: boolean; playQueue: PlayQueue; queueBusy: boolean };
type Editor = 'rename' | 'share' | 'delete';
const editorTitles = { rename: 'Renommer le dossier', share: 'Partager le dossier', delete: 'Supprimer le dossier' };
const validId = /^[a-f\d]{8}-?[a-f\d]{4}-?[a-f\d]{4}-?[a-f\d]{4}-?[a-f\d]{12}$/i;

export default function FolderPage({ id, ...props }: Readonly<Props>) {
    const detail = useFolderDetail(validId.test(id) ? id : undefined);
    if (detail.data && !detail.isError) return <FolderContent detail={detail.data} {...props} />;
    return <section className='client-library client-folder-unavailable'>
        <Link className='client-shelf-back' to={foldersPath}><ClientIcon name='back' />Ma liste</Link>
        {validId.test(id) && detail.isPending ? <ClientSkeleton layout='hero' contained label='Chargement du dossier…' /> :
            <p role='alert'>Ce dossier est indisponible ou n’est plus partagé avec toi. {validId.test(id) && <ActionButton onClick={() => detail.refetch()}>{LABELS.retry}</ActionButton>}</p>}
    </section>;
}

function FolderContent({ detail, full, playQueue, queueBusy, ...card }: Readonly<Omit<Props, 'id'> & { detail: FolderDetail }>) {
    const { folder, items, shares } = detail;
    const { user } = useApi();
    const navigate = useNavigate();
    const targets = useFolderTargets(folder.access !== 'owner' || !!shares?.length);
    const titles = useFolderTitles(items);
    const change = useFolderChange();
    const entries = useMemo(() => orderedFolderItems(items, titles.data || []), [items, titles.data]);
    const queue = useMemo(() => entries.map(entry => entry.item), [entries]);
    const [editor, setEditor] = useState<Editor | null>(null);
    const [organizing, setOrganizing] = useState(false);
    const owner = folder.access === 'owner';
    const editable = canEditFolder(folder);
    const metadata = owner ? user?.Name || 'Personnel' : undefined;
    const actions = editable && <FolderActions folder={folder} hasTitles={entries.length > 0} organizing={organizing}
        toggle={() => setOrganizing(value => !value)} edit={setEditor} />;
    function move(key: string, direction: -1 | 1) {
        const order = moveFolderItem(items, key, direction);
        if (!order) return;
        if (items.some(item => item.followed)) change.mutate({ method: 'PUT', path: `/${folder.id}/MemberOrder`, data: { keys: order } });
        else change.mutate({ method: 'PUT', path: `/${folder.id}/Order`, data: { itemIds: order } });
    }

    const gridActions = editable ? (entry: typeof entries[number], manualOrder: boolean) => <FolderItemActions name={entry.item.Name || 'ce titre'}
        pending={change.isPending} move={organizing && manualOrder ? direction => move(entry.key, direction) : undefined}
        previous={entry.key !== folderMemberKey(items[0])} next={entry.key !== folderMemberKey(items[items.length - 1])}
        remove={() => change.mutate({ method: 'DELETE', path: `/${folder.id}${folderMemberPath(entry)}` })} /> : undefined;
    return <CollectionHero tinted title={folder.name} items={queue} count={items.length} metadata={metadata} metadataBadge={<FolderSharing folder={folder} shares={shares} targets={targets.data} />}
        backTo={foldersPath} backLabel='Ma liste' full={full} image={card.image} playQueue={playQueue} queueBusy={queueBusy} actions={actions}>
        {organizing && editable && <p className='client-shelf-organize' role='status'>Utilise les flèches dans l’ordre du dossier pour déplacer un titre. <ActionButton onClick={() => setOrganizing(false)}>Terminer</ActionButton></p>}
        {change.isError && <div className='client-shelf-organize'><FolderError /></div>}
        <CollectionGrid {...card} items={entries} pending={!!items.length && titles.isPending} error={titles.isError} retry={() => titles.refetch()}
            empty={editable ? 'Ajoute un titre à ce dossier depuis sa fiche ou la recherche.' : 'Ce dossier ne contient aucun titre disponible.'}
            actions={gridActions} />
        <ClientDialog className='client-folder-modal' label={editor ? editorTitles[editor] : folder.name} title={editor ? editorTitles[editor] : folder.name}
            subtitle={folder.name} controlled={{ open: !!editor && editable, onClose: () => setEditor(null) }}>
            {close => <>
                {editor === 'rename' && <FolderNameForm folder={folder} onSave={close} />}
                {editor === 'share' && owner && shares && <ShareForm folder={folder} shares={shares} onSave={close} />}
                {editor === 'delete' && owner && <DeleteFolder folder={folder} onDelete={() => {
                    close();
                    navigate(foldersPath, { replace: true });
                }} />}
            </>}
        </ClientDialog>
    </CollectionHero>;
}

type Actions = { folder: Folder; hasTitles: boolean; organizing: boolean; toggle: () => void; edit: (choice: Editor) => void };

function FolderActions(props: Readonly<Actions>) {
    const { folder, edit } = props;
    return <>
        {folder.access === 'owner' && <ActionButton aria-haspopup='dialog' onClick={() => edit('share')} icon='people'>Partager</ActionButton>}
        <FolderMenu {...props} />
    </>;
}

function FolderMenu({ folder, hasTitles, organizing, toggle, edit }: Readonly<Actions>) {
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    function choose(action: () => void) {
        setOpen(false);
        trigger.current?.focus();
        action();
    }
    function escape(event: KeyboardEvent) {
        if (event.key === 'Escape' && open) {
            event.preventDefault();
            setOpen(false);
            trigger.current?.focus();
        }
    }
    return <div className='client-shelf-menu' onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
        <ActionButton ref={trigger} aria-label='Options du dossier' aria-expanded={open}
            onKeyDown={escape} onClick={() => setOpen(value => !value)} icon='more'></ActionButton>
        {open && <div className='client-shelf-menu-list'>
            <button type='button' onKeyDown={escape} onClick={() => choose(() => edit('rename'))}><ActionLabel icon='edit'>Renommer</ActionLabel></button>
            {hasTitles && <button type='button' onKeyDown={escape} onClick={() => choose(toggle)}><ActionLabel icon={organizing ? 'check' : 'settings'}>{organizing ? 'Terminer l’organisation' : 'Organiser les titres'}</ActionLabel></button>}
            {folder.access === 'owner' && <button type='button' onKeyDown={escape} onClick={() => choose(() => edit('delete'))}><ActionLabel icon='trash'>Supprimer le dossier</ActionLabel></button>}
        </div>}
    </div>;
}

function FolderItemActions({ name, pending, move, previous, next, remove }: Readonly<{ name: string; pending: boolean; move?: (direction: -1 | 1) => void; previous: boolean; next: boolean; remove: () => void }>) {
    return <div className={`client-shelf-item-actions${move ? ' is-organizing' : ''}`}>
        {move && <>
            <ActionButton aria-label={`Avancer ${name}`} disabled={pending || !previous} onClick={() => move(-1)} icon='back'></ActionButton>
            <ActionButton aria-label={`Reculer ${name}`} disabled={pending || !next} onClick={() => move(1)} icon='next'></ActionButton>
        </>}
        <ActionButton aria-label={`Retirer ${name} du dossier`} title='Retirer du dossier' disabled={pending} onClick={remove} icon='close'></ActionButton>
    </div>;
}

/* eslint-enable react/jsx-no-bind */
