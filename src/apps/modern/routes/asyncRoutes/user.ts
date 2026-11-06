import { AsyncRoute } from 'components/router/AsyncRoute';
import { AppType } from 'constants/appType';

export const ASYNC_USER_ROUTES: AsyncRoute[] = [
    { path: 'client', page: 'client', type: AppType.Modern },
    { path: 'home', page: 'client', type: AppType.Modern }
];
