// Keep the upstream production build while fitting smaller CI workers.
// TypeScript is checked explicitly by the quality job before this build.
const config = require('../../webpack.prod');
const MinimizerPlugin = require('minimizer-webpack-plugin');
config.plugins = config.plugins.filter(plugin => plugin.constructor.name !== 'ForkTsCheckerWebpackPlugin');
config.optimization.minimizer = [new MinimizerPlugin({ parallel: false })];
module.exports = config;
