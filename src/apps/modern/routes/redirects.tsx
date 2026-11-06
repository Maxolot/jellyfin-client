import React from 'react';
import { Navigate, type RouteObject, useLocation } from 'react-router-dom';

import ServerInterfacePage from 'apps/modern/features/client/session/ServerInterfacePage';

const HOME = '/client';
const SETTINGS = '/client?view=settings';
const WHOLE_LIBRARY = ['homevideos', 'livetv', 'music', 'books', 'musicvideos', 'boxsets', 'playlists', 'mixed', 'original-home', 'list', 'lyrics', 'queue'];
const PREFERENCES = ['mypreferencesdisplay', 'mypreferencesmenu', 'mypreferencescontrols', 'mypreferenceshome', 'mypreferencesplayback', 'mypreferencessubtitles', 'userprofile', 'quickconnect'];

/** Where an address of the former interface now leads, so that an old link or bookmark keeps working. */
export function redirectTarget(path: string, search: string) {
    const params = new URLSearchParams(search);
    if (path === 'details') {
        const id = params.get('id');
        return id ? `${HOME}?id=${encodeURIComponent(id)}` : HOME;
    }
    if (path === 'search') {
        const query = params.get('query');
        return query ? `${HOME}?view=search&q=${encodeURIComponent(query)}` : `${HOME}?view=search`;
    }
    if (path === 'movies') return `${HOME}?view=films`;
    if (path === 'tv') return `${HOME}?view=series`;
    return PREFERENCES.includes(path) ? SETTINGS : HOME;
}

function Redirect({ path }: Readonly<{ path: string }>) {
    const { search } = useLocation();
    return <Navigate replace to={redirectTarget(path, search)} />;
}

export const USER_REDIRECTS: RouteObject[] = ['details', 'search', 'movies', 'tv', ...WHOLE_LIBRARY, ...PREFERENCES]
    .map(path => ({ path, element: <Redirect path={path} /> }));

/** Administration and first-time setup stay with the server's own interface: this application only points to it. */
export const SERVER_INTERFACE_ROUTES: RouteObject[] = [
    { path: 'dashboard/*', element: <ServerInterfacePage kind='admin' /> },
    { path: 'metadata/*', element: <ServerInterfacePage kind='admin' /> },
    { path: 'configurationpage', element: <ServerInterfacePage kind='admin' /> },
    { path: 'wizard/*', element: <ServerInterfacePage kind='setup' /> }
];
