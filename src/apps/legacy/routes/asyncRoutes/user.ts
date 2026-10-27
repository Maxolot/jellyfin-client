import { AppType } from 'constants/appType';

import { AsyncRoute } from '../../../../components/router/AsyncRoute';

export const ASYNC_USER_ROUTES: AsyncRoute[] = [
    { path: 'client', page: 'client', type: AppType.Modern },
    { path: 'home', page: 'client', type: AppType.Modern },
    { path: 'mypreferencesmenu', page: 'user/settings' },
    { path: 'quickconnect', page: 'quickConnect' },
    { path: 'search', page: 'search' },
    { path: 'userprofile', page: 'user/userprofile' }
];
