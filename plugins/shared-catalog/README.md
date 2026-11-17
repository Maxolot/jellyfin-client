# Shared Catalog for Jellyfin 12

The client can keep a film or series in a shared catalog independently of its Jellyfin item and files. Entries are identified by TMDb media type and ID. Adding an entry does not initiate a request. Every authenticated Jellyfin user can see and add entries. Only administrators can remove entries.

Build with the .NET 10 SDK:

```sh
dotnet build plugins/shared-catalog -c Release
```

For a test instance, place the resulting `Jellyfin.Plugin.SharedCatalog.dll` in the Jellyfin plugin directory under `SharedCatalog_0.1.0` before starting the test server. The plugin stores `catalog.json` in its Jellyfin data directory. Include that file in backups.

In the client, use **Garder dans le catalogue** on a discovery or in the menu of a movie or series with a TMDb ID. In **Films** or **Séries**, use **Explorer toute la bibliothèque → Disponibilité**. The client reconciles tracked entries against Jellyfin items visible to the current user. If the matching Jellyfin item disappears, the tracked entry remains, using the saved metadata and the existing request flow when available. Full series and season availability use the existing Jellyfin and request screens.

This plugin only manages catalog entries. Handling of physical files, protection from automatic re-downloads, and the Sonarr/Radarr/Seerr state needed after removing local copies are a separate implementation step.
