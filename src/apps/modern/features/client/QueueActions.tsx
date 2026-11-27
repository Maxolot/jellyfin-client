/* eslint-disable react/jsx-no-bind -- These controls launch the collection shown next to them. */
import React from 'react';

import type { PlayQueue, QueueSource } from './mediaQueue';
import './mediaQueue.scss';
import { ActionButton } from './ui';

type Props = { source: QueueSource; playQueue: PlayQueue; pending: boolean };
type ActionProps = Props & { shuffled?: boolean; label?: string };

export function QueueAction({ source, playQueue, pending, shuffled = false, label = shuffled ? 'Aléatoire' : 'Tout lire' }: Readonly<ActionProps>) {
    return <ActionButton className='client-queue-button' disabled={pending}
        onClick={() => { void playQueue(source, shuffled); }} icon={shuffled ? 'shuffle' : 'play'}>
        {label}
    </ActionButton>;
}

export function QueueActions(props: Readonly<Props>) {
    return <>
        <QueueAction {...props} />
        <QueueAction {...props} shuffled />
    </>;
}
/* eslint-enable react/jsx-no-bind */
