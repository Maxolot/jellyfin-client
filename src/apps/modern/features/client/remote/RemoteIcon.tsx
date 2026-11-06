import React from 'react';

const paths = {
    tv: 'M3 5h18v12H3zM8 21h8M12 17v4',
    phone: 'M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM11 18h2',
    computer: 'M4 4h16v11H4zM2 20h20M9 15l-1 5M15 15l1 5',
    cast: 'M3 18a3 3 0 0 1 3 3M3 14a7 7 0 0 1 7 7M3 10a11 11 0 0 1 11 11M3 7V5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4',
    people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3',
    pause: 'M8 5v14M16 5v14',
    play: 'M7 4v16l13-8Z',
    stop: 'M6 6h12v12H6z',
    previous: 'M6 5v14M19 5 9 12l10 7Z',
    next: 'M18 5v14M5 5l10 7-10 7Z',
    rewind: 'M11 19 3 12l8-7M21 19l-8-7 8-7',
    forward: 'M13 5l8 7-8 7M3 5l8 7-8 7',
    remote: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM12 7.5v.01M10 12h4M10 16h4',
    here: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'
};

export type RemoteIconName = keyof typeof paths;

/** Line icons of the remote control, drawn like the rest of the client. */
export default function RemoteIcon({ name }: Readonly<{ name: RemoteIconName }>) {
    return <svg className='client-icon client-remote-icon' viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
        <path d={paths[name]} fill={name === 'play' || name === 'previous' || name === 'next' || name === 'stop' ? 'currentColor' : 'none'} stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' />
    </svg>;
}
