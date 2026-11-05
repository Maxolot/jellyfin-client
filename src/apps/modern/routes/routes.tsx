import React from 'react';
import { Navigate, RouteObject } from 'react-router-dom';

import ConnectionRequired from 'components/ConnectionRequired';
import { toAsyncPageRoute } from 'components/router/AsyncRoute';
import ErrorBoundary from 'components/router/ErrorBoundary';
import FallbackRoute from 'components/router/FallbackRoute';

import { ASYNC_PUBLIC_ROUTES, ASYNC_USER_ROUTES } from './asyncRoutes';
import { SERVER_INTERFACE_ROUTES, USER_REDIRECTS } from './redirects';
import VideoPage from './video';

export const APP_ROUTES: RouteObject[] = [
    {
        path: '/*',
        lazy: () => import('../AppLayout'),
        children: [
            { index: true, element: <Navigate replace to='/home' /> },

            {
                /* User routes */
                Component: ConnectionRequired,
                children: [
                    ...ASYNC_USER_ROUTES.map(toAsyncPageRoute),
                    ...USER_REDIRECTS,

                    // Client video presentation reuses the retained playback engine.
                    {
                        path: 'video',
                        Component: VideoPage
                    }
                ],
                ErrorBoundary
            },

            {
                /* Public routes */
                element: <ConnectionRequired level='public' />,
                children: [
                    ...ASYNC_PUBLIC_ROUTES.map(toAsyncPageRoute),
                    ...SERVER_INTERFACE_ROUTES,

                    /* Fallback route for invalid paths */
                    {
                        path: '*',
                        Component: FallbackRoute
                    }
                ]
            }

        ]
    }
];
