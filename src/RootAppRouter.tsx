import { ThemeProvider } from '@mui/material/styles';
import React from 'react';
import {
    RouterProvider,
    createHashRouter,
    Outlet
} from 'react-router-dom';

import { APP_ROUTES } from 'apps/modern/routes/routes';
import AppHeader from 'components/AppHeader';
import Backdrop from 'components/Backdrop';
import BangRedirect from 'components/router/BangRedirect';
import { createRouterHistory } from 'components/router/routerHistory';
import appTheme from 'themes';
import { ThemeStorageManager } from 'themes/themeStorageManager';

const router = createHashRouter([
    {
        element: <RootAppLayout />,
        children: [
            ...APP_ROUTES,
            {
                path: '!/*',
                Component: BangRedirect
            }
        ]
    }
]);

export const history = createRouterHistory(router);

export default function RootAppRouter() {
    return <RouterProvider router={router} />;
}

/**
 * Layout component that renders legacy components required on all pages.
 * NOTE: The app will crash if these get removed from the DOM.
 */
function RootAppLayout() {
    return (
        <ThemeProvider
            theme={appTheme}
            defaultMode='dark'
            storageManager={ThemeStorageManager}
        >
            <Backdrop />
            <AppHeader isHidden />

            <Outlet />
        </ThemeProvider>
    );
}
