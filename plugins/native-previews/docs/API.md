# API v1

All paths are relative to the configured Jellyfin server base path. Normal metadata
and administration use the existing authenticated Jellyfin connection. API keys
without a user identity are not a substitute for a user-scoped preview session.
The server uses its normal PascalCase JSON convention.

| Method and route | Access | Result |
| --- | --- | --- |
| GET NativePreviews/Capabilities | Signed-in user | Version, enabled state, variants and duration bound |
| GET NativePreviews/Items/{id}/Manifest | User with item/source access | Ready descriptor or204 with optional Retry-After |
| GET/HEAD NativePreviews/Media/{id}/{variant}.mp4?ticket=… | Valid scoped ticket, current library permissions | Seekable video/mp4,200/206/304/416 |
| GET NativePreviews/Admin/Scenes | Administrator | Scene metadata/state, no filesystem paths |
| POST NativePreviews/Admin/Scenes/{id} | Administrator | Validate/save scene and enqueue if approved |
| POST NativePreviews/Admin/Prepare | Administrator | Requeue up to64 approved item IDs |
| POST NativePreviews/Admin/Imports/{id}?approved=true | Administrator | Multipart file, maximum32MiB and30s |

`seriesFallback=true` on a manifest permits an episode's non-episode surface to use
an approved series scene. It is false by default. Episode thumbnail integration
keeps it false. Returned ItemId and media routes identify the actual approved scene.

Scene body:

```json
{"StartSeconds":60,"DurationSeconds":20,"Approved":true}
```

`SourceItemId` can explicitly choose the same movie/episode or an episode belonging
to the selected series. Otherwise a series chooses S1E1. Invalid paths, non-local
video sources, negative/non-finite timecodes or scenes longer than30s are rejected.
Unapproved entries are metadata only and are not served to ordinary users.

Manifest example (illustrative GUID/ticket only):

```json
{
  "ItemId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "DurationSeconds":20,
  "ExpiresAt":"2030-01-01T12:03:00Z",
  "Sources":{
    "compact":{"Url":"/NativePreviews/Media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/compact.mp4?ticket=SCOPED_TICKET","Width":854,"Height":480},
    "full":{"Url":"/NativePreviews/Media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/full.mp4?ticket=SCOPED_TICKET","Width":1920,"Height":1080}
  }
}
```

Tickets last3min and bind user, logical item, variant and content version. Altered,
expired, wrong-variant, superseded or currently unauthorized tickets return404.
They are not administrator credentials. Clients should not log or persist ticket
URLs and must reject provider URLs outside the selected server's preview route.
Manifest responses are no-store. Media responses use private max-age60 and ETag.

A204 without Retry-After means no approved scene is available. With Retry-After,
an approved scene is queued/generating or evicted; a client may poll while relevant.
It must not create full-playback sessions as a fallback. Admin responses include
states pending/queued/encoding/ready/failed/evicted/stale. Re-approval or explicit
preparation can repair a stale/failed scene. Work and queue limits can refuse a job
without interrupting ordinary playback.
