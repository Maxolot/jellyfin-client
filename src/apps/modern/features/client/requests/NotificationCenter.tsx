/* eslint-disable react/jsx-no-bind -- Notification actions apply to the visible entries. */
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import ClientDialog from '../ClientDialog';
import ClientIcon from '../ClientIcon';
import { ProgressRing } from './RequestInline';
import { requestEta, requestReason, requestRing, type RequestProgress } from './model';
import { notificationLabel, useNotifications, type Notification } from './notifications';
import { usePlayRequest, useRequestProgress } from './queries';
import './notificationCenter.scss';
import { ActionButton, ActionLink } from '../ui';

function eventDetails(entry: Notification, current?: RequestProgress) {
    if (entry.event === 'downloading') return (current && requestEta(current)) || requestEta({ stage: 'downloading', etaFrom: entry.etaFrom, etaTo: entry.etaTo });
    if (entry.event === 'blocked') return requestReason(entry);
    return undefined;
}

function eventDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('fr-FR', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
}

type Play = (item: BaseItemDto) => void;

function NotificationRow({ entry, match, mark, close, play }: Readonly<{
    entry: Notification; match?: RequestProgress; mark: (id: string) => void; close: () => void; play: Play;
}>) {
    const action = usePlayRequest(item => {
        close();
        play(item);
    });
    const details = eventDetails(entry, match);
    const pending = !entry.readAt;
    const href = `/client?view=requests&request=${entry.requestId}`;
    function open() {
        if (pending) mark(entry.id);
        close();
    }
    return <li className={`client-notification${pending ? ' is-unread' : ''}`}>
        <Link to={href} onClick={open}>
            <span className='client-notification-event'>{notificationLabel(entry)}</span>
            <strong>{entry.title}</strong>
            {details && <span className='client-notification-detail'>{details}</span>}
            <time dateTime={entry.created}>{eventDate(entry.created)}</time>
        </Link>
        <div className='client-notification-actions'>
            {pending && <ActionButton round aria-label={`Marquer « ${entry.title} » comme lue`}
                onClick={() => mark(entry.id)} icon='check'></ActionButton>}
            {entry.event === 'available' && match?.stage === 'available' && match.itemId && <ActionButton disabled={action.isPending} onClick={() => {
                if (pending) mark(entry.id);
                action.mutate(match);
            }} icon='play'>Lecture</ActionButton>}
            {action.isError && <p role='alert'>La lecture n’a pas pu démarrer.</p>}
        </div>
    </li>;
}

export default function NotificationCenter({ play }: Readonly<{ play: Play }>) {
    const progress = useRequestProgress();
    const { query, mark } = useNotifications();
    const [open, setOpen] = useState(false);
    const requests = progress.data || [];
    const ring = requestRing(requests);
    const entries = query.data || [];
    const unread = entries.filter(entry => !entry.readAt).length;
    if (!query.data) {
        if (!ring) return null;
        const label = `Mes demandes, ${ring.count} en cours`;
        return <Link className='client-nav-tool client-request-bell' to='/client?view=requests' aria-label={label} title={label}>
            <ProgressRing progress={ring.percent} /><ClientIcon name='bell' />
        </Link>;
    }
    const unreadLabel = `${unread} non lue${unread > 1 ? 's' : ''}`;
    const label = unread ? `Notifications, ${unreadLabel}` : 'Notifications';
    const close = () => setOpen(false);
    return <>
        <button type='button' className='client-nav-tool client-request-bell' aria-label={label} title={label} aria-haspopup='dialog' onClick={() => setOpen(true)}>
            {ring && <ProgressRing progress={ring.percent} />}<ClientIcon name='bell' />
            {!!unread && <span className='client-notification-count' aria-hidden='true'>{unread > 9 ? '9+' : unread}</span>}
        </button>
        <ClientDialog label='Notifications' title='Notifications' className='client-notifications-panel' controlled={{ open, onClose: close }}>
            <div className='client-notifications-tools'>
                <ActionLink to='/client?view=requests' onClick={close}>Mes demandes</ActionLink>
                {!!unread && <ActionButton disabled={mark.isPending} onClick={() => mark.mutate(null)}>Tout marquer comme lu</ActionButton>}
            </div>
            {mark.isError && <p role='alert'>La lecture de la notification n’a pas pu être enregistrée.</p>}
            {!entries.length && <p>Aucune notification.</p>}
            <ul className='client-notifications-list'>{entries.map(entry => <NotificationRow key={entry.id} entry={entry}
                match={requests.find(item => item.id === entry.requestId)} mark={id => mark.mutate([id])} close={close} play={play} />)}</ul>
        </ClientDialog>
    </>;
}
/* eslint-enable react/jsx-no-bind */
