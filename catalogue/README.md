# Catalogue sources

Praetorium packages community Warhammer 40,000 data into verified snapshots. This directory owns upstream revision pins and attribution in `sources.json`, authored corrections in `patches/`, the release snapshot pin in `lock.json`, and emergency revocations in `revocations.json`. Materialization, compilation, validation, and publication run from this repository. Snapshot manifests contain revisions, source inventory, provenance, and checksums. Fetched data stays in `catalogue-data/`, the shared development cache, and the snapshot store.

Fetched upstream catalogues, copied rules prose, generated catalogues, and snapshots stay outside Git. Authored correction patches retain their source provenance and only the upstream context needed to apply them.

## Sources

- `definitions` uses [BSData/wh40k-11e](https://github.com/BSData/wh40k-11e) for faction entries, constraints, modifiers, and costs. The repository does not include a licence file.
- `marineCodex` pins the seven provisional `(11e)` Space Marines files from [richardsolomou/wh40k-11e](https://github.com/richardsolomou/wh40k-11e) while BSData's codex branch lacks them. Their saved roster IDs are preserved. The fork does not include a licence file.
- `points` uses [BSData/wh40k-11e-mfm](https://github.com/BSData/wh40k-11e-mfm) under the MIT licence for current unit, wargear, detachment, enhancement, and upgrade prices.
- `datacards` uses the 11th-edition export from [game-datacards/datasources](https://github.com/game-datacards/datasources) for factions, core rules, stratagems, missions, scoring, and layouts. The repository does not include a licence file.
- `battlemaster` supplies exact terrain outlines for Chapter Approved layouts.

The product reads the points source from each verified snapshot. The points audit also compares the raw BSData evaluator against it so source disagreements remain visible.

## Commands

- `pnpm catalogue:check` validates the source definitions and full upstream revision pins. It runs as part of `pnpm check`.
- `pnpm catalogue:upstream` reports which upstream revisions moved since the published snapshot without changing the active catalogue. A moved revision may contain non-game changes; follow its comparison link to inspect the data before publishing.
- `pnpm catalogue:sync` activates the release-pinned snapshot from a cache shared by every worktree.
- `pnpm catalogue:sync --latest` follows the remote `current.json` pointer.
- `pnpm catalogue:materialize` fetches the committed upstream revisions, selects faction icons, overlays the provisional Marine files, and applies every local correction. It writes `.output/catalogue-data/` by default; `CATALOGUE_DIR` selects another build directory. It refuses to replace an activated shared snapshot symlink. `pnpm catalogue:update` uses the same pinned build.
- `pnpm catalogue:materialize --source definitions` materializes one source for patch verification into `.output/catalogue-sources/definitions/`. This partial build cannot be published as a complete snapshot.
- The manually dispatched catalogue update workflow materializes these sources and publishes their verified result. Updating an upstream source requires changing its `revision` in `sources.json`; its `branch` is used only by the read-only upstream check and historical reconstruction. A stale correction fails the build and leaves its previous output intact.
- `pnpm catalogue:supplemental` adds the supplemental faction icons to a materialized source directory.
- `pnpm catalogue:compile` reconciles the upstream records into the canonical datasheet and rule-document structure included in snapshots. Set `CATALOGUE_CANONICAL_FILE` to write outside the active catalogue directory.
- `pnpm catalogue:audit` reports missing records, field fallbacks, source conflicts, and unknown UI semantics. Add `-- --details` for every finding.
- `pnpm catalogue:snapshot pack` creates an immutable snapshot and checksummed pointer from the downloaded data.
- `pnpm catalogue:snapshot download` writes the release-pinned archive for an offline installation.
- `pnpm catalogue:snapshot install` installs that archive into `CATALOGUE_DIR` without a network request.
- `pnpm catalogue:snapshot lock` updates `lock.json` to the publisher's current verified snapshot.
- `pnpm catalogue:points` compares generated unit costs with the points source.

## Snapshot revisions

The publisher records every included upstream revision, source, licence declaration, attribution, modification notice, and file checksum before atomically replacing `current.json`. It omits repository metadata, reports, examples, Combat Patrol exports, and layout exports that neither the product nor its verification checks read. Roster validation uses a revision fingerprint of all source revisions, so an MFM or Marine codex update also invalidates cached prices.

`lock.json` is the catalogue tested with a released application. The publisher runs only when `catalogue-update.yml` is dispatched manually; review upstream changes before running it. `revocations.json` blocks named snapshots or every snapshot containing a named source. The publisher uploads revocations before moving `current.json` and removes revoked archives after the pointer has moved. `CATALOGUE_DISABLED_SOURCES` provides the same fail-closed source switch to an operator or publisher.
