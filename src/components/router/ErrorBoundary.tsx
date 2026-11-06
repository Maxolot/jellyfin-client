import React, { type FC, useEffect } from 'react';
import { useRouteError } from 'react-router-dom';

import SessionPage, { SessionNotice } from 'apps/modern/features/client/session/SessionPage';
import loading from 'components/loading/loading';

const reload = () => window.location.reload();

const ErrorBoundary: FC<{ pageClasses?: string[] }> = () => {
    const error = useRouteError() as Error;

    useEffect(() => {
        loading.hide();
    }, []);

    return (
        <SessionPage title='Une erreur est survenue'>
            <SessionNotice title='Une erreur est survenue' message='Rechargez la page. Si cela recommence, le détail ci-dessous aidera à trouver la cause.'>
                <button type='button' className='client-profile-primary' onClick={reload}>Recharger</button>
                <details className='client-session-details'><summary>Détail technique</summary><pre>{error?.name}: {error?.message}{'\n'}{error?.stack}</pre></details>
            </SessionNotice>
        </SessionPage>
    );
};

export default ErrorBoundary;
