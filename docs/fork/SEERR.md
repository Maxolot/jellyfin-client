# Optional Seerr integration

This integration reuses the authenticated Moonbase `/Moonfin/Seerr` proxy on the
connected Jellyfin server. Jellyfin remains the only required service. No Seerr
administrator key, password, cookie, private hostname or media asset is bundled.
API contracts are independently implemented; upstream plugin code is not copied.

## Acceptance and delivery checklist

- [x] Missing/disabled/unreachable proxy leaves all local browsing and playback working.
- [x] Existing per-user proxy session works without another login; reconnect can use
  the plugin passwordless Quick Connect capability where supported.
- [x] Optional global configuration and per-server/user opt-out stop external queries.
- [x] Search/discovery combine local and external media, matching provider IDs and
  media type rather than display names; available matches retain real playback IDs.
- [x] Integrated external detail and local partial-series detail allow film/season
  requests, explicit confirmation, rights/quotas, duplicate and failure handling.
- [x] Personal request tracking shows pending/approved/partial/available/declined/failed,
  refreshes from server state and links back to the same media detail.
- [x] Session expiration affects Seerr alone; account changes isolate queries/state.
- [ ] Types/lint/tests/build and browser acceptance cover enabled/disabled cases,
  film and season requests, persisted server responses, failures and keyboard/mobile.
- [ ] Forgejo PR, exact archived build, review deployment and operational notes updated.

No dedicated Seerr navigation tab is decided. Request actions live in media details;
tracking lives in the personal area. Quality defaults remain server controlled;
advanced/4K options must only be exposed with the corresponding effective rights.

## Concurrent interface follow-ups

Preserve the requested softer ambient crossfade, unique expanded card and close on
pointer exit, restore the current three-card Tonight layout and collection previews.
Implemented and checked in Chromium/Firefox: 1.5s decoded-image ambient fade, one
expanded card and closure on exit/focus departure, prepared three-card Tonight draw
with re-roll/exclusion/keyboard/mobile and lazy member-artwork stacks for collections.

## Evidence and remaining acceptance

Live authenticated proxy GETs: status, identity/permissions, catalogue/search, film
and series details, quotas and personal requests. Browser confirmation stops before
any production POST. Controlled transport tests cover film and selected-season POSTs,
server response across reload, no duplicate, denied rights/quota, expired session,
missing proxy and disabled configuration. Context tests cover per-account opt-out,
late identity responses across accounts, one-shot passwordless linkage and unsupported
login fallback. These tests do not claim a new production request was submitted.

A fresh isolated Seerr engine is being prepared to verify actual request persistence
with no Radarr/Sonarr configured and no production configuration/database copied.
Exact CI archive and deployed-browser acceptance remain required before delivery.

`clientSeerr: false` in runtime config disables the integration globally. Otherwise
the checkbox in Settings stores an opt-out per Jellyfin server/user. Existing Moonbase
sessions are reused. When a configured proxy reports an unlinked session, one
passwordless Quick Connect attempt is made; older plugins may require linking the
account in Moonfin first. An unavailable or expired integration never signs out Jellyfin.
TMDb artwork is requested only for external discoveries; private clips remain separate.

Requests use the server's default quality profile/root folder. The 4K switch is shown
only with effective 4K rights. Seasons in active requests or already available/partial
are excluded, matching the Seerr engine. Deleted seasons can be requested again;
failed active requests stay visible and require server-side retry/administration. No iframe or dedicated Seerr tab.
