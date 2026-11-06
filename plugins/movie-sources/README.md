# Movie Sources for Jellyfin

Optional Jellyfin 12 plugin providing a film-only, on-demand Prowlarr search for compatible clients. It returns only whether a search returned any results; it never returns indexers, download links, release names or credentials. A result is not a guarantee of language, quality, active peers, correctness or successful download. An empty result can also mean an indexer failed or does not support identifier searches.

## Setup

Build with .NET SDK 10.0.403: `dotnet build src/Jellyfin.Plugin.MovieSources.csproj -c Release`. Install the resulting DLL in a dedicated Jellyfin plugins directory and restart Jellyfin using the server's normal plugin installation procedure. In the Jellyfin administration dashboard, open Movie Sources, enter the Prowlarr URL reachable from Jellyfin and its API credential, and enable the plugin. Do not use a public endpoint for Prowlarr. Restarting a real server interrupts playback: choose a maintenance window.

The companion client integration lives on `feat/movie-source-availability`. Without the plugin, the client hides the control and existing Seerr requests continue normally.

## Install from a catalogue

Jellyfin installs third-party plugins from a repository manifest. To publish one:

1. `dotnet build src/Jellyfin.Plugin.MovieSources.csproj -c Release`
2. `python3 scripts/package.py --download-url https://<your-host>/movie-sources-0.1.0.zip`
3. Host `artifacts/movie-sources-0.1.0.zip` at that address and `artifacts/manifest.json` next to it.
4. In the client, open Settings › Server › Sources and enter the manifest address (or add it in Dashboard › Plugins › Repositories, then install Movie Sources from the catalogue and restart Jellyfin).

No public catalogue is published yet.

## Interface and limits

Authenticated Jellyfin users may call `GET MovieSources/Capabilities` and `GET MovieSources/Movies/{imdbId}`. Only IMDb identifiers of films are accepted. Searches use Prowlarr's `movie` search and standard film categories. Search is on demand, serialized, globally limited to one new search every five seconds, cached five minutes and capped in memory. Errors and rate limiting return an unavailable status. Prowlarr itself can silently return an empty list when indexers fail; a missing result cannot establish unavailability. No data is written to Prowlarr or to the request manager. Only an administrator can configure Jellyfin plugins; the credential is stored in Jellyfin's plugin configuration, not returned by these endpoints.

Development status: initial implementation; not yet verified against a real isolated Jellyfin and Prowlarr, and not released or deployed. No compatibility with Jellyfin versions other than 12 has been established.

## License

GPL-2.0, like Jellyfin Web and the client this plugin was written for. See [LICENSE](LICENSE).
