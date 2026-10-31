# Catalogue data

Pins live in `catalogue/composition.json`, `catalogue/sources.json`, and `catalogue.json`; corrections in [`catalogue/patches/`](../../catalogue/patches/README.md). [Running locally](running-locally.md#catalogue) covers setup.

## Rules text

- Never serve Game Datacards rules text from the server in any form. Read source strings through `SourceTexts` (`src/shared/sourceText.ts`) and record rule facts in `textFacts`; `scripts/clientText.integration.test.ts` enforces this.
- Snapshots contain rules text: publish them only to the private `praetorium-private` bucket.

## Data

- Bump `CANONICAL_CATALOGUE_COMPILER_VERSION` when canonical records change, then republish via `catalogue.yml` with `force`.
- Parsed sources from `src/server/sharedJson.ts` are shared: copy before changing.
- Construction reads go in `constructionReads.ts` so the worker and server agree.
- Points come from the [MFM fork](https://github.com/richardsolomou/wh40k-11e-mfm); never duplicate prices in definitions.
- `changes/history.json` is immutable; never compare frozen battle or sealed event snapshots with current data.

## Rules versions

- Saved lists carry `<edition-id>~<book-id>` and keep their version when the default changes. Never replace a retained edition with current rules or move its pinned commits.
- Promote a preview by keeping its ID and files and switching `status`/`default`; never rename or copy it.
- New MFM version: freeze the current base to explicit pins, add a new `base: true` default, and fold the outgoing base in `catalogue/edition-migrations.json`.
- Retired sources and IDs stay resolvable so old snapshots and rosters verify; retired IDs are illegal, never dropped or free.
- `scripts/retainRosterCatalogue.ts` is a manual release tool: it rebuilds a historical snapshot's profile construction with the compiler, transform, and icons pinned in `catalogue/retained-profile-build.json`, and packs the result as a new snapshot.

## Pricing and legality

- `evaluate.ts` reports unsupported semantics in `unhandled` and fails closed on unreadable conditions. Ability prose never applies benefits.
- `pointsBudget` changes only the points limit and strategic reserve limit.
- Points caps on keywords are measured with the list's prices (`pointCapErrors`), never the definitions' own costs.
- Never hide upstream disagreements from `just points` or lower its match rate.

## Roster migration

Before changing sources or saved-selection construction, baseline production rosters:

```sh
just rosters-fetch
just rosters-audit
cp data-dev/production-rosters.audit.json data-dev/production-rosters.baseline.json
just rosters-audit data-dev/production-rosters.json catalogue-data data-dev/production-rosters.baseline.json
```

Author replacements in `catalogue/roster-migrations.json` with a reason. Never fuzzy-match, substitute, or drop a selection, or suppress a legality error, to make the audit pass.

## Privacy

- Other readers never get a roster's picks, notes, or preparation; exports never carry notes.
- Imports never silently drop or substitute units, and never overwrite an existing draft.
- Collection photos stay in the private bucket with location metadata stripped; every path that drops a photo row records it in `collection_photo_deletion` in the same transaction.

Before a catalogue release, run `just catalogue-preflight` against the proposed `catalogue.json`.
