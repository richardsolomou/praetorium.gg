# Catalogue sources

Praetorium packages community Warhammer 40,000 data into verified snapshots. This directory carries the public development defaults and release pin. The private `richardsolomou/praetorium-catalogue` repository owns publication source configuration, emergency revocations, catalogue verification, and the sharded canonical history. Snapshot manifests contain revisions, source inventory, provenance, and checksums. Fetched data stays in `catalogue-data/`, the shared development cache, and the snapshot store.

No game data is committed to this repository.

## Sources

- `definitions` uses [BSData/wh40k-11e](https://github.com/BSData/wh40k-11e) for faction entries, constraints, modifiers, and costs. The repository does not include a licence file.
- `points` uses [BSData/wh40k-11e-mfm](https://github.com/BSData/wh40k-11e-mfm) under the MIT licence as an independent points reference.
- `rules` uses [40kdc-data](https://github.com/wn-mitch/40kdc-data) for stratagems, missions, and scoring data under [CC BY 4.0](https://github.com/wn-mitch/40kdc-data/blob/main/LICENSE-DATA).
- `datacards` uses the 11th-edition export from [game-datacards/datasources](https://github.com/game-datacards/datasources) for factions, core rules, missions, and layouts. The repository does not include a licence file.

The points source tests the evaluator and is not loaded by the product. Evaluator changes are assessed against all three inputs: the generated selection, definitions, and points source.

## Commands

- `pnpm catalogue:check` validates the source definitions. It runs as part of `pnpm check`.
- `pnpm catalogue:sync` activates the release-pinned snapshot from a cache shared by every worktree.
- `pnpm catalogue:sync --latest` follows the remote `current.json` pointer.
- `pnpm catalogue:update` resolves and downloads the latest upstream revisions for snapshot publication.
- `pnpm catalogue:compile` reconciles the upstream records into the canonical datasheet and rule-document structure included in snapshots. Set `CATALOGUE_CANONICAL_FILE` to write outside the active catalogue directory.
- `pnpm catalogue:ledger` writes that canonical file as deterministic, reviewable records under `CATALOGUE_LEDGER_DIR`.
- `pnpm catalogue:audit` reports missing records, field fallbacks, source conflicts, and unknown UI semantics. Add `-- --details` for every finding.
- `pnpm catalogue:snapshot pack` creates an immutable snapshot and checksummed pointer from the downloaded data.
- `pnpm catalogue:snapshot download` writes the release-pinned archive for an offline installation.
- `pnpm catalogue:snapshot install` installs that archive into `CATALOGUE_DIR` without a network request.
- `pnpm catalogue:snapshot lock` updates `lock.json` to the publisher's current verified snapshot.
- `pnpm catalogue:points` compares generated unit costs with the points source.

## Snapshot revisions

The publisher checks out the private catalogue repository, reads its source and revocation configuration, runs its verification, and records every included upstream revision, source, licence declaration, attribution, modification notice, and file checksum before atomically replacing `current.json`. It first commits the sharded canonical records, records that commit and the public compiler commit in provenance, and tags the catalogue commit with the published snapshot ID. It omits repository metadata, reports, examples, Combat Patrol exports, and layout exports that neither the product nor its verification checks read. Saved rosters continue to record the definitions revision used for validation.

`lock.json` is the catalogue tested with a released application. `revocations.json` blocks named snapshots or every snapshot containing a named source. The publisher uploads revocations before moving `current.json` and removes revoked archives after the pointer has moved. `CATALOGUE_DISABLED_SOURCES` provides the same fail-closed source switch to an operator or publisher.
