# Fork changelog

## Unreleased — visual parity PR

- Port the validated prototype navigation, inset carousel and expanding poster rows.
- Align detail/season/cast, discovery/library, search, recent/local-evening selection,
  personal area and interface previews with live Jellyfin data.
- Preserve row glow, keyboard/touch interaction and nested navigation; style the
  inherited player without replacing its playback mechanisms.
- Clearly prepare unavailable personal-rating/offline/preview visuals without
  simulated server state. No Seerr integration or private demo assets.

## client-v0.1.0-alpha.3

- Restore keyboard focus to the selected media card when returning from details.
- Preserve the parent return context across linked media details and season changes.

## client-v0.1.0-alpha.2

- Recover expired SDK sessions through inherited sign-out; share concurrent recovery.
- Keep permission errors distinct from expired authentication.
- Identify browser sessions as Jellyfin Client (working name).
- Restore scroll after returning from a detail page, once content is available.
- Respect reduced-motion preference for custom card transitions.

## client-v0.1.0-alpha.1

- Add real-data React home, libraries/search, genre/sort/pagination, film and series
  detail with season buttons, episode progress and S1:E1 playback labels.
- Persist favorites and watched state through Jellyfin; retain its player and session.
- Add per-user/server glass/classic, floating-header and detail-layout preferences.
- Keep account and playback settings accessible in the inherited interface.

## client-v0.0.1-baseline

- Start from Jellyfin Web v12.0, preserving history, authors and license.
- Add fork documentation, protected Forgejo workflow, traceable source/frontend
  archives and standalone deployment infrastructure.
