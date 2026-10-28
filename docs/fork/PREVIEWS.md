# Optional native short previews

Previews use ordinary MP4/WebM files supplied by the installation owner. They do not
start a Jellyfin playback session, transcode a library item or embed a third-party
player. No clips, private item IDs, server addresses or demonstration registry are
included in source/frontend archives.

In the local runtime config.json, associate a server ID and item ID with a short clip:

```json
{
  "clientPreviews": {
    "YOUR-SERVER-ID": {
      "YOUR-ITEM-ID": "./client-previews/your-clip.mp4"
    }
  }
}
```

Keep existing runtime configuration fields. IDs can be read from your own server's
public info and item URL. A series may have one clip; episode thumbnails require an
explicit episode entry. There is no automatic fallback to a full library stream.
Only configured items receive previews. HTTPS deployments should use relative or
HTTPS clip URLs. The static registry contains URLs intended for client access;
never put a Jellyfin administrator key or account password in it.

For the standalone Nginx container, an optional local Compose override can mount a
folder of approved clips read-only at /usr/share/nginx/html/client-previews. Nginx
serves normal Content-Length, HEAD and byte-range requests. Keep this override,
registry and personal media outside Git. The generic client needs no extra service.

Use H264/AAC MP4 with faststart for broad compatibility. A useful target is15–25s,
720p, and one continuous scene selected manually against spoilers. For series,
prefer first-season first-episode footage. Duration alone cannot guarantee an absence
of spoilers; the client rejects clips over30s and never chooses a random source scene.
Only distribute media you have the right to distribute.

Previews start after a short delay, muted by default. Hero/detail, expanded landscape
cards, an explicitly configured episode and the personal spotlight may play them.
Portrait grids never do. One visible surface owns playback; card/episode interaction
preempts a background hero. Navigation, full playback, hidden/offscreen views,
disabling previews or reduced-motion preferences release the video. A clip plays once
per surface/item during the current client visit, then fades image and volume toward
the poster over the last0.8s. Sound is shared across previews without restarting them.
If sound autoplay is blocked, the player retries muted. Preferences and completion
history are scoped to the signed-in server/account; completion history is in memory.

With no registry, the client makes no preview requests and retains ordinary artwork.
Missing, invalid, unsupported or blocked clips also retain the poster. The full Jellyfin
player keeps its independent audio/subtitle controls and persisted watch history.
