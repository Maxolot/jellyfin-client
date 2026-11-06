# Optional server plugins

Two Jellyfin 12 plugins add features to this client. Neither is required: without them, browsing and playback work
as usual and the related screens simply stay hidden.

| Plugin | What it adds | Needs |
|---|---|---|
| [Native Previews](native-previews/README.md) | Short clips of films and episodes, played on cards and detail pages. Clips are cut by the server from your own files, with a bounded cache. | Jellyfin's FFmpeg |
| [Movie Sources](movie-sources/README.md) | Before a request, tells whether a film or season is already published, and in which languages. | A Prowlarr instance and its API key |

The Seerr requests feature uses the separate Moonbase plugin, installed the same way from its own catalogue
(`https://raw.githubusercontent.com/Moonfin-Client/Plugin/refs/heads/master/manifest.json`).

## Install from the client (recommended)

1. Sign in to the client with a Jellyfin administrator account and open **Settings → Server**.
2. Open the plugin's page and choose **Install**. The catalogue below is already filled in: confirm.
3. Confirm the Jellyfin restart when asked (the screen shows the playbacks in progress first).
4. Configure the plugin on the same page: Prowlarr address and API key for Movie Sources, encoder, cache and
   scene choice for Native Previews.

## Install from Jellyfin

Add this repository in **Dashboard → Plugins → Repositories**, then install from the catalogue:

```
https://raw.githubusercontent.com/Maxolot/jellyfin-client/main/plugins/catalog/manifest.json
```

## Contents

- `catalog/`: the Jellyfin catalogue (`manifest.json`) and the packaged plugins it points to, with their MD5 checksums.
- `native-previews/`, `movie-sources/`: the sources of each package, under GPL-2.0. Build with the .NET SDK set in
  each `global.json`: `dotnet build src/*.csproj -c Release`, tests with `dotnet run --project tests/Tests.csproj`.

Both plugins target Jellyfin 12.0 (`targetAbi` 12.0.0.0) and never bundle media, credentials or server addresses.
