import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import React, { useEffect } from 'react';

import LoadingTitle from './LoadingTitle';

/**
 * Between « Lecture » and the player, Jellyfin prepares the stream behind its own spinner.
 * The title of what is starting takes its place, on the black screen the player then opens on.
 */
export default function PlaybackStarting({ item, basePath }: Readonly<{ item: BaseItemDto | null; basePath: string }>) {
    useEffect(() => {
        if (!item) return;
        document.body.classList.add('client-playback-starting-active');
        return () => document.body.classList.remove('client-playback-starting-active');
    }, [item]);
    if (!item) return null;
    return <div className='client-playback-starting'><LoadingTitle item={item} basePath={basePath} label='Préparation de la lecture…' /></div>;
}
