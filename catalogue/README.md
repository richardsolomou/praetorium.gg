# Catalogue sources

Praetorium reads community catalogue data for Warhammer 40,000 and ships none of it. This directory records where the data comes from and which revision is in use; the data itself is fetched into a working directory that is never committed.

That is deliberate. The catalogues describe Games Workshop's game, and keeping them out of this repository is what lets the project be public without redistributing anyone's content. It is the same posture New Recruit takes.

## The two sources

`definitions` is [BSData/wh40k-11e](https://github.com/BSData/wh40k-11e): the entry trees, constraints, modifiers and costs that make a roster legal or illegal. It is JSON on `main` — one file per faction, plus `Warhammer 40,000.json` for the game system. There are no releases and no `catpkg` assets, so a revision is a commit sha rather than a tag.

`points` is [BSData/wh40k-11e-mfm](https://github.com/BSData/wh40k-11e-mfm): points scraped from Games Workshop's own Munitorum Field Manual into per-faction YAML. This is not product data — it is the independent oracle the evaluator is checked against. If our evaluator computes a unit's cost from the catalogue and it disagrees with what GW prints, the evaluator is wrong.

## Commands

- `pnpm catalogue:check` — offline. Validates `sources.json` and that both revisions are pinned to full commit shas. Runs as part of `pnpm check`.
- `pnpm catalogue:sync` — fetches both sources at the pinned revisions into `catalogue-data/`.
- `pnpm catalogue:update` — moves both sources to the head of their configured branch and rewrites `sources.json`.
- `pnpm catalogue:points` — evaluates real units at real model counts and compares against the Munitorum figures.

## Why the revision is pinned

Every roster must record the revision it was validated against, and every battle must pin one for both rosters. Two clients holding different revisions agree perfectly about the score and disagree about whether a list is legal, which is precisely the thing players argue over.
