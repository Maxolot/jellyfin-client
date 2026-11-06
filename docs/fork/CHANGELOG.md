# Fork changelog

## client-v1.0.0

First complete version: every screen is the client's own, the Jellyfin engine, SDK and authentication are reused.

- Own screens for sign-in, servers, password, errors and loading; profile picker « Qui regarde ? » with an animated
  entrance, account switching without a password on this browser, Quick Connect and an avatar gallery hook.
- Custom player: animated ±15 s, episode panel, subtitle offset, technical details, sleep timer, keyboard help.
- Home, Films, Séries, Nouveautés, Ce soir and Mon espace: endless rows whose unfolded card stays at the start,
  full-screen hero that turns into a framed card while scrolling, a blurred page background at all times, native
  ratings, sagas, infinite library lists and fast tab switching.
- Settings redesigned per browser, device and account; server page to install and configure optional plugins.
- Play on another device (remote control) and watch together (SyncPlay); offline viewing on HTTPS deployments.
- Optional plugins published with the client in `plugins/`: Native Previews (clips) and Movie Sources (release
  sources through Prowlarr), installable from Settings → Server through the bundled catalogue.

### Optional Seerr integration

- Reuse Moonbase proxy sessions, with per-server/user opt-out and no client admin key.
- Mix external search/discovery with provider-matched Jellyfin titles; preserve playback.
- Integrate external details/recommendations, film and missing-season requests with
  confirmation, rights/quota checks and personal request tracking.
- Soften cached ambient artwork changes and close expanding cards on exit.
- Restore the three-card Tonight fan and lazy collection member previews.

### Visual parity

- Prepare nearby landscapes before expansion and synchronize the decoded-image
  crossfade; preserve rapid selection, failed-image fallback and second-tap navigation.
- Match the reference glass navbar surface and localized pointer reflection.

- Connect optional native short clips with shared mute, single ownership and a soft
  one-time return to artwork; keep private clips/registry outside distributable builds.
- Preserve keyboard selection under a stationary pointer during card expansion.
- Restore account-specific settings before enabling controls and compress static text.

- Decode artwork before reveal, size it per surface and version image cache URLs;
  warm the next hero/details and nearby collapsed-card landscapes.
- Restore slow drift, liquid carousel markers, glass pointer reflection, entry and
  hover motion, immersive background preference and reduced-motion/offscreen handling.
- Serialize rapid stream changes, preserve paused playback and cancel stale loads.

- Port the validated prototype navigation, inset carousel and expanding poster rows.
- Align detail/season/cast, discovery/library, search, recent/local-evening selection,
  personal area and interface previews with live Jellyfin data.
- Preserve row glow, keyboard/touch interaction and nested navigation; style the
  inherited player without replacing its playback mechanisms.
- Clearly prepare unavailable personal-rating/offline/collection-editing visuals without
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
