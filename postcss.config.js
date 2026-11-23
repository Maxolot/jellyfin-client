const path = require('path');
const packageConfig = require('./package.json');
const postcssPresetEnv = require('postcss-preset-env');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');

const DEV_MODE = process.env.NODE_ENV !== 'production';
const CLIENT_STYLES = path.resolve(__dirname, 'src/apps/modern/features/client') + path.sep;

/**
 * Client styles are written in px. They are rewritten as multiples of
 * --client-px so the whole interface follows the viewport and the account's
 * interface size. Hairlines (1px and below) and the scale itself stay as written.
 */
const clientScale = () => ({
    postcssPlugin: 'client-scale',
    // Once, not Declaration: preset-env rewrites var() fallbacks, which would revisit the
    // rewritten declarations and grow them forever.
    Once(root) {
        root.walkDecls(decl => {
            if (decl.prop === '--client-px' || decl.value.includes('--client-px')) return;
            decl.value = decl.value.replace(/(^|[^\w.#-])(-?)(\d+(?:\.\d+)?|\.\d+)px\b/g, (match, before, sign, size) => (
                Number(size) <= 1 ? match : `${before}calc(${sign}${size} * var(--client-px, 1px))`
            ));
        });
    }
});
clientScale.postcss = true;

const config = (api) => ({
    plugins: [
        api?.file?.startsWith(CLIENT_STYLES) ? clientScale() : null,
        // Explicitly specify browserslist to override ones from node_modules
        // For example, Swiper has it in its package.json
        postcssPresetEnv({ browsers: packageConfig.browserslist }),
        autoprefixer({ overrideBrowserslist: packageConfig.browserslist }),
        DEV_MODE ? null : cssnano()
    ]
});

module.exports = config;
module.exports.clientScale = clientScale;
