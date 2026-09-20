# Catalogue snapshots

Praetorium consumes verified, content-addressed catalogue snapshots. This directory contains only the snapshot pinned to an application release and explicitly accepted coverage changes. Source configuration, revocation policy, fetched data, generated records, and publication history live outside this repository.

No game data is committed to this repository.

## Commands

- `pnpm catalogue:sync` activates the release-pinned snapshot from a cache shared by every worktree.
- `pnpm catalogue:sync --latest` follows the remote `current.json` pointer.
- `pnpm catalogue:compile` reconciles an installed snapshot into the canonical datasheet and rule-document structure. Set `CATALOGUE_CANONICAL_FILE` to write outside the active catalogue directory.
- `pnpm catalogue:ledger` writes that canonical file as deterministic records under `CATALOGUE_LEDGER_DIR`.
- `pnpm catalogue:audit` reports missing records, field fallbacks, source conflicts, and unknown UI semantics. Add `-- --details` for every finding.
- `pnpm catalogue:snapshot download` writes the release-pinned archive for an offline installation.
- `pnpm catalogue:snapshot install` installs that archive into `CATALOGUE_DIR` without a network request.
- `pnpm catalogue:points` compares generated unit costs with an independent points source.

Publication commands require source and revocation files through `CATALOGUE_SOURCES_FILE` and `CATALOGUE_REVOCATIONS_FILE`. `pnpm catalogue:check` validates the supplied source configuration, `pnpm catalogue:update` fetches it, and `pnpm catalogue:snapshot pack` produces an immutable archive.

## Snapshot revisions

Snapshot manifests contain source revisions, source inventory, provenance, and file checksums. The publisher records an opaque catalogue revision in provenance before atomically replacing `current.json`. Saved rosters continue to record the definitions revision used for validation.

`lock.json` is the catalogue tested with a released application. Instances fetch the current revocation policy from their configured snapshot service. `CATALOGUE_DISABLED_SOURCES` provides an additional fail-closed source switch to an operator or publisher.
