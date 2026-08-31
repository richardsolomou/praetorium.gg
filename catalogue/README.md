# Catalogue sources

Praetorium packages community Warhammer 40,000 data into verified snapshots. This directory defines the upstream sources. Snapshot manifests contain revisions and checksums. Fetched data stays in `catalogue-data/` and the snapshot store.

No game data is committed to this repository.

## Sources

- `definitions` uses [BSData/wh40k-11e](https://github.com/BSData/wh40k-11e) for faction entries, constraints, modifiers, and costs. The upstream repository does not publish a licence file. Record written permission or another applicable legal basis before public distribution.
- `points` uses [BSData/wh40k-11e-mfm](https://github.com/BSData/wh40k-11e-mfm) under the MIT licence as an independent points reference.
- `rules` uses [40kdc-data](https://github.com/wn-mitch/40kdc-data) for stratagems, missions, and scoring data under [CC BY 4.0](https://github.com/wn-mitch/40kdc-data/blob/main/LICENSE-DATA). Public use must credit Alpaca Software and the 40kdc community contributors, link the licence, and identify Praetorium's transformations.
- `datacards` uses the 11th-edition export from [game-datacards/datasources](https://github.com/game-datacards/datasources) for factions, core rules, missions, and layouts. The upstream repository does not publish a licence file. Record written permission or another applicable legal basis before public distribution.

The points source tests the evaluator. The product does not load it. Inspect all three inputs before you change evaluation logic: the generated selection, definitions, and points source.

Public repository access does not grant content rights. Do not publish a snapshot or make a store content-rights declaration until the release record contains evidence for every loaded source.

## Commands

- `pnpm catalogue:check` validates the source definitions. It runs as part of `pnpm check`.
- `pnpm catalogue:sync` fetches and verifies the snapshot named by the remote `current.json` pointer.
- `pnpm catalogue:update` resolves and downloads the latest upstream revisions for snapshot publication.
- `pnpm catalogue:snapshot pack` creates an immutable snapshot and checksummed pointer from the downloaded data.
- `pnpm catalogue:points` compares generated unit costs with the points source.

## Snapshot revisions

The publisher records every upstream revision and file checksum in the snapshot manifest before atomically replacing `current.json`. Saved rosters continue to record the definitions revision used for validation.
