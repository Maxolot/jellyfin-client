// The action context supplies the short-lived pipeline credentials.
// setup-node puts the pinned Node 24 interpreter first in PATH.
const { execFileSync } = require('node:child_process');
execFileSync('node', ['--experimental-strip-types', 'scripts/fork/upload-artifacts.mts'], {
    cwd: process.env.GITHUB_WORKSPACE,
    env: process.env,
    stdio: 'inherit'
});
