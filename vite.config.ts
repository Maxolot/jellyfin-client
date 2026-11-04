/// <reference types="vitest" />
/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [ tsconfigPaths() ],
    test: {
        include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
        coverage: {
            include: [ 'src' ]
        },
        environment: 'jsdom',
        restoreMocks: true
    }
});
