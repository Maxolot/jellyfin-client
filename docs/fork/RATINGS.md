# Native personal ratings

Local Jellyfin films and series can be rated inline using five stars. Personal
ratings are distinct from public CommunityRating and are saved to the connected
user account on the Jellyfin server; no plugin, companion service or browser-only
score storage is required. The detail opens with the server-provided UserData.

## Native contract

Jellyfin12 stores UserData.Rating on0–10. Choosing1–5 stars sends only
`{Rating: stars * 2}` through SDK updateItemUserData (POST UserItems/{id}/UserData).
Clearing uses deleteUserItemRating (DELETE UserItems/{id}/Rating). It never calls
DELETE Items/{id}. Sending a null Rating to the update route does not clear it.
Favorites, watched state, play count and resume position are not sent or changed.
Existing zero/fractional scores are displayed; new choices use whole stars.

The endpoint named updateUserItemRating accepts a boolean Likes value; it must not
be used for five-star writes. Jellyfin derives Likes from the numeric score, so
other clients' thumbs controls may replace a score with their own native values.
CommunityRating is never changed. External discoveries without a local Jellyfin
item have no native rating record and do not receive this control.

## Personal area and failures

Mes notes in the personal area shows rated posters, highest scores first, with a
film/series filter and progressive display. Queries are scoped by server and user,
read the accessible library in200-item pages, filter valid numeric ratings and
cache results30s. Native Likes/Dislikes filters do not reliably exclude unrated
items on the tested Jellyfin12 server; they are not used as a complete rating index.
A repeated server page is an error rather than silently returning a partial list.

Only a confirmed response updates the displayed score. Pending controls are
disabled and writes are not retried automatically. Failure keeps the previous
score with an inline retry message. Account changes remount the control; late
responses update only their original account cache. Upstream session recovery
handles expired Jellyfin authentication.

## Validation

An isolated Jellyfin12.0.0 server persists all five values, film/series ratings
and different values for two synthetic accounts, including fresh login and deletion.
Favorite/watched/play-count/resume values remain unchanged. Original synthetic
scores are restored after tests; no production rating is created by acceptance.
Unit tests cover numeric validation, API payload/deletion, paging/deduplication,
server failures, rapid clicks and late responses across accounts. Browser release
acceptance covers the actual archived client, keyboard, touch, responsive layouts
and the personal overview. Deployment evidence is tied to the Forgejo PR commit.
