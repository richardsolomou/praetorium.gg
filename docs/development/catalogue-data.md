# Catalogue data

Pins live in `catalogue/composition.json`, `catalogue/sources.json`, and `catalogue.json`; corrections in [`catalogue/patches/`](../../catalogue/patches/README.md). [Running locally](running-locally.md#catalogue) covers setup.

## Rules text

- Never serve either source's rules text from the server in any form, construction data and the offline download included. Read Game Datacards strings through `SourceTexts` (`src/core/sourceText.ts`); the catalogue reads BSData's rules texts as tokens from load (`src/server/definitionTexts.ts`). Whatever a rule reads from words is recorded in `TextFacts` (`src/core/textFacts.ts`) and read through `readText` or `statedIn`, so the server and a device answer alike; `scripts/clientText.integration.test.ts` enforces this.
- A catalogue text Game Datacards prints too is shown as the card's token, which carries the catalogue text's facts (`src/server/cardTwins.ts`). A token's loaded words can therefore be another source's printing of the rule: read its recorded facts, and re-read loaded words only where they read as recorded (`readsAsRecorded`).
- Only the server reads BSData tokens back into words (`definitions.words`), to search what abilities do; such fields never leave it.
- Snapshots contain rules text: publish them only to the private `praetorium-private` bucket.

## Data

- Bump `CANONICAL_CATALOGUE_COMPILER_VERSION` when canonical records change, then republish via `catalogue.yml` with `force`.
- Parsed sources from `src/server/sharedJson.ts` are shared: copy before changing.
- Construction reads go in `constructionReads.ts` so the worker and server agree.
- Points come from the [MFM fork](https://github.com/richardsolomou/wh40k-11e-mfm); never duplicate prices in definitions.
- Translated names come from [wh40k-11e-translations](https://github.com/richardsolomou/wh40k-11e-translations), a pinnable copy of nrdata.org, which serves only its live state; refresh it there with `bin/update` and a commit, never by fetching nrdata.org at build time.
- Definitions no longer update upstream. After a points update, dataslate or codex, run `just drift` and work its report (`data-dev/drift/drift.md`, JSON beside it): "likely edit" rows first, where Game Datacards and 40kdc-data agree against us, then "GDC differs" rows. Game Datacards is the authority; a 40kdc-only row is a lead to check against the cards, never an edit on its own. "New in GDC HEAD" shows what a Game Datacards bump would change.
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
- Never hide upstream disagreements from `just points` or lower its match rate.

## Winning lists

- The Winning tab's lists are fetched from 40k Stats into `DATA_DIR/winning-lists` and imported on the web process in the background, paced between lists; never import them while answering a request.
- Each list's import result is kept per catalogue revision, so changing what a result records must also change its stored shape, or old results are served.

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
