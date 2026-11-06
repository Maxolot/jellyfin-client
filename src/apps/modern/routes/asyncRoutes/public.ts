import { AsyncRoute } from 'components/router/AsyncRoute';
import { AppType } from 'constants/appType';

export const ASYNC_PUBLIC_ROUTES: AsyncRoute[] = [
    { path: 'login', page: 'session/login', type: AppType.Modern },
    { path: 'selectserver', page: 'session/selectServer', type: AppType.Modern },
    { path: 'addserver', page: 'session/addServer', type: AppType.Modern },
    { path: 'forgotpassword', page: 'session/forgotPassword', type: AppType.Modern },
    { path: 'forgotpasswordpin', page: 'session/forgotPasswordPin', type: AppType.Modern }
];
