import React from 'react';

const paths = {
    play: 'M8 5v14l11-7Z',
    shuffle: 'M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4',
    volume: 'M11 5 6 9H2v6h4l5 4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14',
    muted: 'M11 5 6 9H2v6h4l5 4ZM16 9l6 6M16 15l6-6',
    star: 'm12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z',
    download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    collection: 'M8 3H3v13h5M8 7h13v14H8ZM14.5 11v6M11.5 14h6',
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    refresh: 'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13.5 3M4.5 15A8 8 0 0 0 18 18',
    folder: 'M3 6h7l2 2h9v12H3Z',
    plus: 'M12 5v14M5 12h14',
    people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM22 21v-2a4 4 0 0 0-3-3.9M17 3.1a4 4 0 0 1 0 7.8',
    bookmark: 'M6 4h12v17l-6-4-6 4ZM12 7v6m-3-3h6',
    bookmarkOff: 'M6 4h12v17l-6-4-6 4Zm3 6h6',
    drive: 'M4 7h16l2 8H2Zm-2 8v4h20v-4m-5 2h2',
    trash: 'M3 6h18m-2 0-1 15H6L5 6m4 0V3h6v3m-5 4v7m4-7v7',
    settings: 'M6 3v18m6-18v18m6-18v18M3 8h6m0 8h6m0-5h6',
    profile: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 4 0 0 1 16 0v2',
    signOut: 'M10 4H4v16h6m4-12 4 4-4 4m-6-4h13',
    connect: 'M3 5h18v12H3Zm5 16h8m-4-4v4m-2-10 2 2 4-4',
    subtitles: 'M3 5h18v14H3Zm4 6h3m3 0h4m-10 4h6m3 0h1',
    chapter: 'M5 4h12a2 2 0 0 1 2 2v14H6a2 2 0 1 1 0-4h13M5 4v12m4-8h6',
    keyboard: 'M3 7h18v10H3Zm3 3h1m3 0h1m3 0h1m3 0h1m-11 4h8',
    lock: 'M6 11h12v10H6ZM8 11V7a4 4 0 0 1 8 0v4m-4 4v2',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    check: 'm5 12 4 4L19 6',
    info: 'M12 11v6M12 7v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    back: 'm14 6-6 6 6 6',
    next: 'm9 6 6 6-6 6',
    down: 'm6 9 6 6 6-6',
    close: 'm6 6 12 12M6 18 18 6',
    edit: 'M4 20h4L19 9l-4-4L4 16ZM13.5 6.5l4 4',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    bell: 'M18 8a6 6 0 0 0-12 0c0 6-2 7-3 9h18c-1-2-3-3-3-9ZM10 21h4',
    clock: 'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'
};
export type ClientIconName = keyof typeof paths;

export default function ClientIcon({ name }: { readonly name: ClientIconName }) {
    return <svg className='client-icon' viewBox='0 0 24 24' aria-hidden='true' focusable='false' fill={name === 'play' ? 'currentColor' : 'none'} stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round'><path d={paths[name]} /></svg>;
}
