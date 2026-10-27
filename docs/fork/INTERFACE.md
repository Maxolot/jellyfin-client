# First custom interface

The independent client surface lives under `src/apps/modern/features/client` and
`src/apps/modern/routes/client.tsx`. Both upstream app layouts expose `/client`;
the normal home route also opens this interface. Modern `/original-home` retains
the inherited home page as a reference. Inherited details and account/playback
preferences remain reachable while the custom pages mature.

## Data and behavior

- Existing API/session context and SDK only; no second login implementation.
- Home loads bounded resume, next-episode, recent-film and recent-series queries.
- Libraries and search request 48 items at a time, with title, genre and sort filters.
- Cards use server images sized for their display and text fallbacks when missing.
- Detail pages fetch real metadata, seasons, episodes and similar items.
- Play actions invoke the upstream playback manager with the actual item and
  saved position. Dynamic detail/home queries become stale immediately, so returning
  from playback retrieves updated progress rather than retaining an old cache.
- Favorite and watched actions use the SDK and invalidate the active user's client
  queries. The initial list is explicitly Jellyfin favorites, not a separate service.
- Interface settings are browser-local and keyed by server and user: glass/classic,
  grouped/floating navigation and continuous/faded/immersive detail backgrounds.
- Client data query keys include server and user; no personal fixtures or media
  are built into the application.

The first implementation uses French interface strings. Upstream playback and
account pages retain their existing localization. Expanded localization, custom
collections, ratings, external discovery/requests and preview videos are later work.
