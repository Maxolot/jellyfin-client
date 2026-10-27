# Upstream baseline

- Project: https://github.com/jellyfin/jellyfin-web
- Release: `v12.0`
- Commit: `0e83c6a724b31f3e9b5a499244331a288c060a4a`
- Upstream package version: `12.0.0` (kept unchanged).
- Fork versions: separate `client-v*` tags; upstream `v*` tags are never overwritten.
- Runtime: Node 24; exact build-tool version pinned separately from the upstream .nvmrc.
- Intended initial server: Jellyfin 12.0.0; playback compatibility must be verified,
  not inferred from matching version numbers.

## Update procedure

1. Fetch upstream releases and read their changes, especially security fixes.
2. Create an update branch from the current fork main branch.
3. Merge the selected upstream release, preserving authorship and history.
4. Resolve conflicts without rewriting shared history.
5. Run the quality pipeline and the authenticated playback acceptance matrix.
6. Record the new source commit, compatibility results and changes before releasing.

Current application changes: custom React routes/styles and SDK queries, home routing,
layout selection, a distinct web session name and awaitable upstream logout cleanup.
Playback and authentication mechanisms are retained; see INTERFACE.md.
Do not migrate bundlers or replace playback mechanisms as part of visual work.
