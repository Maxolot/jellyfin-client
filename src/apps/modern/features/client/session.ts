import { isAxiosError } from 'axios';

import Dashboard from 'utils/dashboard';

let recovery: Promise<void> | undefined;

/** Reuse the inherited sign-out/reconnect flow when a client query loses its session. */
export async function clientRequest<T>(request: () => Promise<T>): Promise<T> {
    try {
        return await request();
    } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) {
            recovery ??= Promise.resolve(Dashboard.logout()).finally(() => {
                recovery = undefined;
            });
            await recovery;
        }
        throw error;
    }
}
