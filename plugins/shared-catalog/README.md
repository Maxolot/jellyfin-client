# Shared Catalog for Jellyfin 12

The client can keep a film or series in a shared catalog independently of its Jellyfin item and files. Entries are identified by TMDb media type and ID. Adding an entry does not initiate a request. Every authenticated Jellyfin user can see and add entries. Only administrators can remove entries.

Build with the .NET 10 SDK:

```sh
dotnet build plugins/shared-catalog -c Release
```

For a test instance, place the resulting `Jellyfin.Plugin.SharedCatalog.dll` in the Jellyfin plugin directory under `SharedCatalog_0.1.0` before starting the test server. The plugin stores `catalog.json` in its Jellyfin data directory. Include that file in backups.

In the client, use **Garder dans le catalogue** on a discovery or in the menu of a movie or series with a TMDb ID. In **Films** or **Séries**, use **Explorer toute la bibliothèque → Disponibilité**. The client reconciles tracked entries against Jellyfin items visible to the current user. If the matching Jellyfin item disappears, the tracked entry remains, using the saved metadata and the existing request flow when available. Full series and season availability use the existing Jellyfin and request screens.

## Who followed a title (0.3.0)

New entries record `addedBy` (Jellyfin user ID) and `addedAt` (UTC). Entries saved by
0.2.0 keep both fields empty; the client then shows them as the latest followed titles
instead of « followed by the other accounts ».

## Remove files and keep the catalog entry (0.2.0)

The optional storage integration is disabled until an administrator provides a server-side
`storage.json` next to `catalog.json` in the plugin data directory
(`/config/plugins/Jellyfin.Plugin.SharedCatalog/` in the Jellyfin container):

```json
{
  "radarr": { "url": "http://radarr:7878", "apiKey": "<server-side credential>" },
  "sonarr": { "url": "http://sonarr:8989", "apiKey": "<server-side credential>" }
}
```

Set file permissions to 0600 for the Jellyfin process. Configure only the relevant
instances. The browser receives file names and sizes, never credentials or absolute
paths. Film selection uses TMDb and series selection uses TVDb for Sonarr and TMDb
for the catalog.

From a film or series detail, open **⋯ → Retirer les fichiers du disque**. Choose
a season or the whole series and read the file list before confirming. The server
rejects a stale preview, a matching item in the Arr queue or a playback session
on the title. It saves the catalog entry, disables monitoring, verifies monitoring
from Arr, then removes only the approved movie/episode files through Arr. A season
operation keeps sibling seasons' monitoring. Title entries in Arr remain in place.
A failed deletion can be partial. Monitoring stays disabled for the prepared scope
so RSS will not grab a replacement, and a fresh preview shows the remaining files.

Jellyfin queues a library scan after success. The existing Seerr availability sync
must refresh the requestable status. When that status updates, the existing request
flow has the same permissions as before and can re-monitor the requested title
or seasons. Seerr's scan and a new real request must be validated on a safe title after
deployment. File sizes count the Arr library copies. Hardlinked download copies,
other editions and the Arr recycle bin affect actual space released.

Run the workflow checks against the isolated Arr API simulation:

```sh
dotnet run --project plugins/shared-catalog/tests -c Release
```
