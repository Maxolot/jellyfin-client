# Shared Catalog for Jellyfin 12

The client can keep a film or series in a shared catalog independently of its Jellyfin item and files. Entries are identified by TMDb media type and ID. Adding an entry does not initiate a request. Every authenticated Jellyfin user can see and add entries. Only administrators can remove entries.

Build with the .NET 10 SDK:

```sh
dotnet build plugins/shared-catalog -c Release
```

For a test instance, place the resulting `Jellyfin.Plugin.SharedCatalog.dll` in the Jellyfin plugin directory under `SharedCatalog_0.4.0` before starting the test server. The plugin stores `catalog.json` in its Jellyfin data directory. Include that file in backups.

In the client, use **Garder dans le catalogue** on a discovery or in the menu of a movie or series with a TMDb ID. In **Films** or **Séries**, use **Explorer toute la bibliothèque → Disponibilité**. The client reconciles tracked entries against Jellyfin items visible to the current user. If the matching Jellyfin item disappears, the tracked entry remains, using the saved metadata and the existing request flow when available. Full series and season availability use the existing Jellyfin and request screens.

## Personal folders (0.4.0)

Folders keep ordered references to whole films and series. The API derives the Jellyfin ID,
media type and TMDb ID from the item visible to the caller. Titles without a TMDb ID keep
their Jellyfin ID and have `tmdbId: null`. A title can belong to several folders.

Each folder starts private. A recipient with read access can view the folder. A recipient
with edit access can also rename it and add, remove or reorder titles. Sharing, revoking
access and deleting the folder require ownership, including when the caller is an
administrator. Reading a shared folder only returns titles the caller can already see in
Jellyfin. Only the owner sees the recipient list. Deleting a folder or removing a title
updates references only.

All paths start at `/SharedCatalog/Folders` and require Jellyfin authentication.

| Method and path | Request and result |
| --- | --- |
| `GET /` | Visible summaries `{id,name,ownerId,access}`, where access is `owner`, `editor` or `viewer`. Use the role to distinguish owned folders and folders shared with the caller. |
| `GET /{folderId}` | `{folder,items,shares}`. Items are ordered `{itemId,type,tmdbId}` references. Shares are `null` for recipients. |
| `GET /ShareTargets` | Available accounts `{userId,name}`, excluding the caller and disabled or hidden accounts. |
| `POST /` | `{name}` creates a private folder. Returns 201, its summary and a Location header. |
| `PATCH /{folderId}` | `{name}` renames the folder. |
| `DELETE /{folderId}` | Deletes the folder and its grants. |
| `PUT /{folderId}/Items/{itemId}` | Adds the visible film or series at the end. Repeat requests are idempotent. |
| `DELETE /{folderId}/Items/{itemId}` | Removes the visible item reference. |
| `PUT /{folderId}/Order` | `{itemIds:[…]}` in the chosen order, containing every visible item exactly once. Invisible references keep their positions. |
| `PUT /{folderId}/Shares` | `{shares:[{userId,canEdit}]}` replaces the grant list. Omitted recipients lose access immediately. |

Successful changes other than creation return 204. Unknown folders and folders private to
someone else return the same 404. A caller with insufficient rights inside a known shared
folder receives 403. Names have at most 120 characters. Each account can own 100 folders,
with a server limit of 1,000 folders, 500 items per folder and 50 grants per folder.

`folders.json` is stored alongside `catalog.json` in the plugin data directory. Writes are
serialized and replace the file atomically. Include it in backups and restrict access to
the plugin's data directory.

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

Run the folder persistence and authorization checks, the in-process folder API tests, and the isolated Arr simulation:

```sh
dotnet run --project plugins/shared-catalog/tests -c Release
```
