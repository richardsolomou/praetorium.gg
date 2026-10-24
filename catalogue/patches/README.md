# Local corrections

- Paths start at the materialized root (`definitions/`, `points/`, `datacards/`, `battlemaster/`); edition patches under `editions/<id>/<source>/`. Applied in filename order.
- Create: `git diff --no-index -- .output/catalogue-sources/definitions/definitions/<file> <edited-file>`, then fix its paths to start with `definitions/`.
- Check: `pnpm catalogue:materialize --source definitions` (fails if upstream changes a patched area).
- Keep patches minimal with verified provenance.
- A correction that adds rules text beyond a single quoted sentence is a commit on a fork branch of its source, pinned in `composition.json`.
- Leave edition copies of root patches unchanged when advancing sources.

## Provenance

- `insane-bravery-phase`: [core rules 15.04](https://github.com/game-datacards/datasources/blob/9c0762c8311db122c0faa9a3a09ef891c3c2d782/11th/gdc/core/core_rules.json); mirrored in `src/core/stratagemCorrections.ts`.
- `new-orders-battle`: [Event Companion v1.2](https://assets.warhammer-community.com/eng_wh40k_event_companion-pl87i44rzn-a7ieny8i9x.pdf), p. 2; mirrored in `stratagemCorrections.ts`.
- `003-restrict-ceramite-sentinels`: [GDC Space Marines](https://github.com/game-datacards/datasources/blob/9c0762c8311db122c0faa9a3a09ef891c3c2d782/11th/gdc/space_marines.json); fixed upstream in [BSData/wh40k-11e#2363](https://github.com/BSData/wh40k-11e/issues/2363); only for the pinned 3 October codex.
- `crucible-tacticus-leaders-exclude-characters`: printed Leader ability, core rules 02.05.01.
- `canis-rex-embarked-hekhtur-not-infantry`: [GDC Imperial Knights](https://github.com/game-datacards/datasources/blob/ebcd0cbedb197fd8246b7cff580fde3625c6f3f1/11th/gdc/imperialknights.json).
- `terrain-labels`, `terrain-areas`: diagrams linked from [GDC layouts](https://github.com/game-datacards/datasources/blob/9c0762c8311db122c0faa9a3a09ef891c3c2d782/11th/gdc/layouts/layouts.json) and 40kdc `link_group`.
- `kotc-2`: publisher links inside the patch.
