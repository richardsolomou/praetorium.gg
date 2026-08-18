# Catalogue sources

Praetorium packages community Warhammer 40,000 data into verified snapshots. This directory defines the upstream locations checked by the hourly publisher. Active revisions and file checksums live in each immutable snapshot manifest. Fetched data lives in the gitignored `catalogue-data/` directory and the snapshot store, never in Git.

No game data is committed to this repository.

## Sources

- `definitions` uses [BSData/wh40k-11e](https://github.com/BSData/wh40k-11e) for faction entries, constraints, modifiers, and costs.
- `points` uses [BSData/wh40k-11e-mfm](https://github.com/BSData/wh40k-11e-mfm) as an independent points reference.
- `rules` uses [40kdc-data](https://github.com/tabletop-developer-consortium/40kdc-data) for stratagems, missions, and scoring data under CC BY 4.0.
- `datacards` uses the 11th-edition export from [game-datacards/datasources](https://github.com/game-datacards/datasources) for factions, core rules, missions, and layouts.

The points source checks the evaluator. It is not loaded by the product. When a comparison fails, inspect the generated selection, the definitions, and the points source before changing evaluation logic.

## Commands

- `pnpm catalogue:check` validates the source definitions. It runs as part of `pnpm check`.
- `pnpm catalogue:sync` fetches and verifies the snapshot named by the remote `current.json` pointer.
- `pnpm catalogue:update` resolves and downloads the latest upstream revisions for snapshot publication.
- `pnpm catalogue:snapshot pack` creates an immutable snapshot and checksummed pointer from the downloaded data.
- `pnpm catalogue:points` compares generated unit costs with the points source.

## Snapshot revisions

The publisher records every upstream revision and file checksum in the snapshot manifest before atomically replacing `current.json`. Saved rosters continue to record the definitions revision used for validation.
