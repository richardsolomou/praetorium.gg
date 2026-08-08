# Catalogue sources

Praetorium fetches community Warhammer 40,000 data at runtime. This directory stores source locations and pinned revisions in `sources.json`. The fetched data lives in the gitignored `catalogue-data/` directory.

No game data is committed to this repository.

## Sources

- `definitions` uses [BSData/wh40k-11e](https://github.com/BSData/wh40k-11e) for faction entries, constraints, modifiers, and costs.
- `points` uses [BSData/wh40k-11e-mfm](https://github.com/BSData/wh40k-11e-mfm) as an independent points reference.
- `rules` uses [40kdc-data](https://github.com/tabletop-developer-consortium/40kdc-data) for stratagems, missions, and scoring data under CC BY 4.0.

The points source checks the evaluator. It is not loaded by the product. When a comparison fails, inspect the generated selection, the definitions, and the points source before changing evaluation logic.

## Commands

- `pnpm catalogue:check` validates `sources.json` and its pinned commit revisions. It runs as part of `pnpm check`.
- `pnpm catalogue:sync` fetches all sources at their pinned revisions.
- `pnpm catalogue:update` updates each source to its configured branch head and rewrites `sources.json`.
- `pnpm catalogue:points` compares generated unit costs with the points source.

## Pinned revisions

Saved rosters record the definitions revision used for validation. Pinning keeps list results stable until the source revision changes deliberately.
