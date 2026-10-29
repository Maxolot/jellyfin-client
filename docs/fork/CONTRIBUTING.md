# Contributing to this fork

Follow upstream CONTRIBUTING.md for application architecture and code conventions.
Fork-specific work is tracked in its own issue tracker; do not send fork feature
requests or generated changes automatically to the upstream project.

- Start from `develop`; one focused issue and topic branch per functional change.
- Feature/fix PRs target `develop`; release integration targets `main`.
- See [branch and integration workflow](BRANCHING.md); avoid permanent PR chains.
- Pull requests explain the problem, resulting behavior and relevant validation.
- Main must pass CI; preserve shared history and use normal merge commits.
- New application code uses TypeScript and existing React/SDK patterns.
- Retain copyright/license notices and track any additional assets' provenance.
- Do not copy private prototype data or resources without redistribution rights.
- Do not change the dependency lockfile for unrelated work.
- Record important design decisions and differences from upstream.

The fork is developed privately initially, with sources prepared for later public
availability. Publishing access and a final product name are separate decisions.
