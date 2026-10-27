# First implementation

## M0 — Maintainable baseline

Preserve upstream Git history and license. Establish protected main, topic branches,
issues/PRs, a quality/build pipeline, traceable packages, and documented release/rollback.
Acceptance: a fresh checkout builds the same source version with documented commands;
CI passes and every artifact identifies its source commit.

## M1 — Real connection and playback

Validate server selection, authentication/session/expiry/logout, actual film/episode
playback, audio/subtitle selection, seeking, direct play/remux/transcoding as applicable,
and progress after closing and reopening. Keep the upstream implementation.
Use a test account and selected media; CI has no access to a personal Jellyfin server.
Record browser/codec limitations instead of promising universal direct playback.

## M2 — Validated design with real data

Adapt navigation, cards, home (resume/next episodes/recent additions), libraries,
search and film/series details. Keep episode rows low on the detail background,
season selection and the S1:E1 play label. Provide the three detail layouts and
independent header presentation settings. Preserve routes, back navigation and focus.
Acceptance: login -> home -> film/episode -> playback -> back, with actual updated data;
keyboard and desktop/tablet/mobile checks, empty and larger libraries, missing artwork.

## M3 — Everyday alpha

Favorites, watched state, next episode, preferences, useful loading/error states,
installation documentation, versioned packages and regression tests across users.
Acceptance: the client is usable without the prototype or homelab-specific settings;
server-side state survives browser restart. Test a second server where available.

## Later

Seerr integration, release calendar, personal five-star ratings, custom collections,
previews, offline downloads, native desktop playback and TV. These require explicit
API/persistence designs; prototype simulations do not count as implementations.
