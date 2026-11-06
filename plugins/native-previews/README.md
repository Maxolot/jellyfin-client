# Native Previews for Jellyfin

An optional Jellyfin 12 plugin that prepares short, approved scenes from local
films and episodes and exposes them to clients through a small authenticated API.
No frontend injection, external video service, administrator key in a client,
private library registry or additional application server is required.

The companion client discovers the plugin, resolves only the active surface and
selects compact or full clips. Clients without integration are unchanged. This is
an independent project, not an official Jellyfin plugin.

## What it does

- One scene, two H264/AAC faststart MP4s: up to480p for cards and up to1080p for
  larger surfaces; original aspect ratio retained and smaller media not upscaled.
- One decoded input, two outputs; one bounded background worker, limited CPU
  threads, configured NVENC/Intel QSV where available and CPU retry on encoder failure.
- Existing playback has priority. Starting/resuming playback interrupts and
  requeues a generation job; paused sessions do not block generation.
- A bounded LRU/idle cache, including imported and working files, with a free-space
  reserve. Eviction retains scene approvals for later regeneration.
- Short-lived, signed user/item/variant tickets. Library and account permissions
  are checked again when reading a clip. Delivery supports HEAD, ETag and Range.
- Optional automatic, on-demand scene selection for movies, series and episodes (off by default); it cannot identify spoilers.
- No playback sessions, watch-state mutations or full-media fallback for previews.

## Install and use

Build the plugin with .NET10, or use a released archive. Place the DLL in a dedicated
subdirectory of Jellyfin's plugins folder, then restart Jellyfin during an idle
window. Open **Dashboard → Plugins → Native Previews**. Confirm cache limits,
search for a title, choose a scene and approve it before generation. A series uses
S1E1; an explicit source episode can also be supplied by API.

A chosen timecode cannot guarantee an absence of spoilers. Manual selections must
be approved. The optional automatic mode instead selects a scene near 8% of the
source and can reveal plot details; it is disabled by default. Disabling it stops
serving its automatically selected scenes. Existing manually approved scenes remain. Existing approved clips can be imported through
the administrator API, avoiding private item mappings in the application build.
The plugin never modifies source media files.

The integration is optional: missing plugin, missing clips, disabled preferences,
unsupported media or failures retain normal artwork. See [installation and
operations](docs/OPERATIONS.md), [API](docs/API.md) and [architecture](docs/ARCHITECTURE.md).

## Develop

```sh
./scripts/install-dotnet.sh
$HOME/.dotnet/dotnet build src/Jellyfin.Plugin.NativePreviews.csproj -c Release
$HOME/.dotnet/dotnet run --project tests/Tests.csproj -c Release
```

Supply a generated video path as the test executable's argument to exercise real
FFmpeg/FFprobe output as well. Integration tests use a separate Jellyfin12 server
and synthetic users/media; personal endpoints, credentials and fixtures are never
included in source or release archives. No server is needed for the core tests.

[GPL-2.0-or-later](LICENSE). Sources, checksums and the installation archive are
provided together. The plugin uses Jellyfin's existing FFmpeg installation.
