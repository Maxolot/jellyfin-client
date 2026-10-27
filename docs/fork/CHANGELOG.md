# Fork changelog

## Unreleased

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
