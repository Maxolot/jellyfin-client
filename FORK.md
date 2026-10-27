# Jellyfin Client (working name)

An independent fork of [Jellyfin Web](https://github.com/jellyfin/jellyfin-web),
with a custom interface in development. The public name has not been chosen.
This project is not an official Jellyfin release or affiliated with Netflix or Moonfin.

The original README, contributors, license and Git history are preserved.
Application code is licensed under the upstream GPL-2.0-or-later terms;
see [LICENSE](LICENSE). Third-party components retain their own licenses.

## Current state

The first alpha provides custom home, libraries/search, film and series details,
favorites, watched state and interface preferences using real Jellyfin data.
Authentication and playback retain the upstream implementations. Visual details
and optional integrations continue in separately reviewed changes.
See the [changelog](docs/fork/CHANGELOG.md).

- [Build and run](docs/fork/DEVELOPMENT.md)
- [Upstream baseline](docs/fork/UPSTREAM.md)
- [Roadmap and acceptance criteria](docs/fork/ROADMAP.md)
- [Contributing to this fork](docs/fork/CONTRIBUTING.md)
- [Release history](docs/fork/CHANGELOG.md)

Connect the application to your own Jellyfin server. No administrator API key,
additional application server, subscription or mandatory external provider is required.
Private demonstration media and third-party profile artwork are not distributed here.
