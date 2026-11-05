import React from 'react';

/** Line icons drawn for this application (no third-party artwork). */
const paths = {
    appearance: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.3-1.7-.4-1.1.3-2.3 1.5-2.3H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10ZM7.5 11.5h.01M10 7.5h.01M15 7.5h.01',
    player: 'M3 5h18v14H3ZM10 9v6l5-3Z',
    languages: 'M3 6h18v11H8l-4 3V6ZM7 10h4M7 13h7M14 10h3',
    quality: 'M4 15a8 8 0 1 1 16 0M12 15l4-5M3 19h18',
    library: 'M4 4h4v16H4ZM10 4h4v16h-4ZM16.5 4.5l3.5 1-4 14.5-3.5-1',
    requests: 'M4 13h4l2 3h4l2-3h4M4 13l2.5-8h11l2.5 8v6H4Z',
    account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
    server: 'M4 4h16v6H4ZM4 14h16v6H4ZM8 7h.01M8 17h.01',
    previews: 'M3 6h18v12H3ZM3 10h18M7 6v4M12 6v4M17 6v4M10.5 12.5v4l3.5-2Z',
    sources: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3M8 11h6M11 8v6',
    plugin: 'M9 4h6v3a2 2 0 1 0 0 4v0h3v9H6v-9h3a2 2 0 1 0 0-4V4Z',
    external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    restart: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
    check: 'm5 12 4 4L19 6',
    lock: 'M6 11h12v9H6ZM8.5 11V8a3.5 3.5 0 0 1 7 0v3'
} as const;

export type SettingsIconName = keyof typeof paths;

export default function SettingsIcon({ name, className }: Readonly<{ name: SettingsIconName; className?: string }>) {
    return <svg className={className} viewBox='0 0 24 24' aria-hidden='true' focusable='false' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round'>
        <path d={paths[name]} />
    </svg>;
}
