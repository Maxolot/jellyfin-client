import React from 'react';

import ClientIcon from './ClientIcon';
import './watchedMarker.scss';

export const watchedLabel = 'Déjà vu';

/** The card's accessible name announces the state; the icon is decorative. */
export default function WatchedMarker() {
    return <span className='client-watched-marker' aria-hidden='true'><ClientIcon name='check' /></span>;
}
