# Custom video player

The modern `/video` route renders the client's React player. It does not mount
Jellyfin's legacy OSD controller, toolbar, track dialogs or next-episode dialog.
The retained playback manager still owns source selection, direct play/remux/HLS,
audio/subtitle changes, playback progress, resume and session reporting.

## Controls and preferences

Return/title, play/pause, configurable seek jumps, timeline, chapter markers,
trickplay sprites when available, volume/mute, fullscreen and picture-in-picture.
Custom modal panels expose tracks, subtitles, chapters, bitrate limit, speed and
aspect ratio. The browser's modal dialog supplies focus containment and Escape.
Unsupported PiP/fullscreen controls are omitted. Seeking is disabled without a
seekable duration. The loading/error/finished states use client components.

Settings → Lecteur and the player appearance panel share the same preferences:
Glass/Classic/Minimal, accent, control size, hide delay, seek interval, clock
format, trickplay, intro policy, next-episode countdown and text caption style.
Browser storage is scoped by server URL and user ID; invalid values are bounded
or replaced with defaults. No server configuration is rewritten by these options.

Space/K play or pause; Left/Right seek; Up/Down adjust volume; M mutes; F toggles
fullscreen; C toggles the first available subtitle; Escape exits fullscreen or
returns. Text inputs, selects and modal dialogs keep their own keyboard behavior.
Touch double taps in the outer left/right thirds seek by the configured interval.
Controls remain visible while paused, in a panel, or when navigating them with
the keyboard, and otherwise hide after the chosen delay.

## Segments and next episode

Optional `MediaSegments` metadata supplies intro/recap/outro boundaries. Manual
skip and once-per-item automatic intro skip use ticks from the server. Missing
segment metadata leaves ordinary playback available. The modern player owns
segment presentation; legacy segment and skip subscribers remain unchanged for
other application modes.

The next-episode card appears within the last 30 seconds, using the retained
queue. The selected countdown is based on remaining media time, so pause also
pauses it. Playback advances at the end; users can advance immediately or cancel
for the current item. A zero countdown disables automatic advancement. Modern
presentation overrides the inherited auto-next setting only for its active
session. Legacy clients retain their original server preference.

## Boundaries

No synthetic media, personal endpoints, sessions or preview clips are shipped.
Trickplay requires server-generated sprites. Chapters and segments require server
metadata. Fullscreen and PiP depend on the browser and device. Caption appearance
applies to browser-rendered text cues; ASS, bitmap and burned-in subtitles retain
their own formatting. A bitrate limit may require server transcoding; it is not a
promise of a particular resolution. Browser/mobile emulation does not replace
physical-device validation on iOS, TV or a remote-control receiver.

The player samples engine state twice a second and cleans up listeners and timers.
Stopping playback invalidates account-scoped library data and discards the stopped
item detail cache so an immediate return/reload cannot resume from a stale position.
Leaving the route stops video playback; StrictMode's effect rehearsal does not.
The session presentation flag avoids duplicate legacy segment UI and keeps natural
end/queue handling in the playback engine.

## Player polish (2026-11-05)

Seek buttons display their configured interval (15 seconds by default). Rapid jumps
accumulate their destination and animate the pressed button, including keyboard and
touch jumps; no central seek popup is mounted. Previously saved intervals remain.

The episode panel loads seasons and episodes on demand for the current account.
Choosing an episode resumes its stored position and retains the remainder of the
series as the playback queue, including subsequent seasons when available. A local timer pauses playback after 15–90 minutes;
end-of-item mode disables automatic next for the current title. Leaving the player
ends this timer. Browser background suspension may delay timed actions.

Tools exposes keyboard help and a live technical panel. Source/server bitrates are
labelled separately from measured fragment transfer and decoded-video rates. The
latter depend on resource timing access and browser counters; unavailable values
are displayed explicitly. Server session polling runs only while this panel is
mounted. Buffer, resolution and dropped/total frame counters come from the video.

Timeline previews work on mouse hover and touch scrubbing. Server trickplay sprites
are loaded before display, sized to the viewport; chapter images are a labelled
fallback. Missing images keep time/chapter text. The client never enables server
extraction by itself. Subtitle offset uses custom ±0.1-second buttons and reset.
