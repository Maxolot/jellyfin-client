# Development

Use Node **24.22.1** and its bundled npm (npm >=11). The upstream .nvmrc specifies
Node 24. The package-lock.json and upstream engine requirements are preserved.

```sh
npm ci --no-audit
npm run build:check
npm test -- --maxWorkers=2
npm run lint
npm run stylelint
npm run build:production
npm run escheck
```

Dependencies' lifecycle scripts remain disabled by upstream .npmrc.
Run commands from the repository root. Compilation needs several GiB of memory;
resource limits and the CI build configuration are described by the pipeline.

For local development, `npm start` starts the upstream development server.
For production, serve `dist/` with a static web server; see `packaging/fork`.
Runtime server addresses belong in an external config.json, never in source code.
The shipped configuration intentionally contains no personal server address.

Authentication and tokens are handled by the existing client session logic.
Never commit browser profiles, storage exports, request headers, media files,
server credentials or real watch-history fixtures. Use synthetic fixtures in CI.

The HTTP preview is for controlled local testing; choose HTTPS for a public deployment
and validate browser/server mixed-content, CORS and deployment base-path behavior.

CI uses `packaging/fork/webpack.ci.cjs`, extending the original production configuration
with in-process minification and no concurrent TypeScript worker. The separate
`build:check` step remains mandatory. This avoids exhausting small CI workers;
it does not disable compilation, minification or JavaScript compatibility checks.

After validation, `scripts/fork/package.sh` creates frontend and source archives,
a build manifest (commit, upstream and lockfile hash) and SHA256SUMS under artifacts/.
A clean committed checkout is required for a release (`dirty` must be false).
Sources remain available independently of the 30-day CI artifact retention.

## Standalone container

After a validated build and packaging:

```sh
docker compose -f packaging/fork/compose.yml config
docker compose -f packaging/fork/compose.yml up -d --build
```

Default access is http://127.0.0.1:8592. The server address is entered in the
application. To configure server suggestions, copy config.example.json outside
the tracked tree and set CLIENT_CONFIG_PATH to its absolute path. The config file
is public to browsers: never put credentials or API tokens in it.
CLIENT_BIND_ADDRESS and CLIENT_PORT configure the listener; these values are
local deployment settings, not required application source changes.

The runtime image is unprivileged and read-only, with a small writable /tmp.
It serves only frontend files; playback goes through the configured Jellyfin server.
Build a released image with CLIENT_IMAGE set to a versioned image name, and keep
the previous version for rollback with the same runtime configuration.

CI runs on pull requests, main updates and release tags. Feature-branch pushes do not
run a second identical job alongside their pull request. Main requires the PR quality check.
