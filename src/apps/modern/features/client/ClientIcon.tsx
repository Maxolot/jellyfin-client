import React from 'react';

const paths = {
    play: 'M8 5v14l11-7Z',
    volume: 'M11 5 6 9H2v6h4l5 4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14',
    muted: 'M11 5 6 9H2v6h4l5 4ZM16 9l6 6M16 15l6-6',
    star: 'm12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z',
    download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    collection: 'M8 3H3v13h5M8 7h13v14H8ZM14.5 11v6M11.5 14h6',
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    refresh: 'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13.5 3M4.5 15A8 8 0 0 0 18 18',
    plus: 'M12 5v14M5 12h14',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    check: 'm5 12 4 4L19 6',
    info: 'M12 11v6M12 7v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    back: 'm14 6-6 6 6 6',
    next: 'm9 6 6 6-6 6',
    down: 'm6 9 6 6 6-6',
    close: 'm6 6 12 12M6 18 18 6',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    clock: 'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'
};
export default function ClientIcon({ name }: { readonly name: keyof typeof paths }) {
    return <svg className='client-icon' viewBox='0 0 24 24' aria-hidden='true' focusable='false' fill={name === 'play' ? 'currentColor' : 'none'} stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round'><path d={paths[name]} /></svg>;
}
