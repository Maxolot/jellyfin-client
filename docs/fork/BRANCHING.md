# Branches and integration

## Long-lived branches

- `main`: stable integration baseline, protected; updated through reviewed release
  pull requests and normal merge commits. It is not a development scratch branch.
- `develop`: the complete client under active development. Start new work here.
  Its integration pull request into `main` is the single overview of pending work.
- `upstream/master`: official Jellyfin source reference; do not develop fork
  features here. Preserve upstream history and license.

The active branch name describes its purpose, not the latest visual adjustment.
A deployed instance is identified by its exact commit/build manifest, not by a
branch name. Creating or updating a branch does not deploy it automatically.

## Everyday workflow

1. Start from an up-to-date, clean `develop` checkout.
2. Create `feat/<short-purpose>`, `fix/<short-purpose>` or `chore/<short-purpose>`.
3. Link an issue and open a focused PR **targeting `develop`**. Describe behavior,
   relevant validation and limitations; keep credentials/media outside Git.
4. Pass CI and review before merging with a normal merge commit. Do not force-push
   published history. Subsequent features start from the updated `develop`, not
   from another unmerged feature branch.
5. Promote a chosen, tested `develop` revision through its integration PR into
   `main`. Record the exact source/frontend archives and deployment revision.
   A successful build does not itself authorize a production release.

If a feature genuinely depends on an unmerged PR, make that dependency explicit
and temporary; do not grow a permanent chain of feature branches.

## Migration on 2026-10-29

`develop` starts at `911bf56d8595f9e72a910eacc74c62becea4a6cd`, the already
validated client containing prototype fidelity, optional Seerr, clip variants,
native ratings, interface settings, compact details and readable backdrops.
No application history is rewritten and no feature PR is merged by this migration.

PRs #14, #15, #17, #19, #21, #23, #25 and #27 retain their existing bases and
branches as historical, focused reviews. Their commits are already ancestors of
`develop`. Do not merge this chain separately into `main`; use the canonical
integration PR after review. Do not continue new work on these superseded heads.
They remain open until an explicit decision about their closure/retention.

The review deployment remains at its verified application revision. Workflow-only
documentation on `develop` does not require rebuilding the deployed client.
