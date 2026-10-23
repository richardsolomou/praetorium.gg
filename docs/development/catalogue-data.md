# Catalogue data

Community data supplies roster construction and reference records. Deterministic evaluation lives in `src/core`; source loading and contextual projection live in `src/server`. [Running locally](running-locally.md#catalogue) owns activation commands; [Game rules](game-rules.md) owns play/scoring semantics.

## Area guides

Read the area guide for the task; this page keeps what applies to all of them.

| Working on                                                                                           | Read                                                              |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Source loading, published rules text, runtime updates, compiled runtime, snapshots, offline download | [Sources and runtime](catalogue/sources.md)                       |
| Composing sources, rules versions, roster migrations, canonical audits, data-update history          | [Rules versions, updates and audits](catalogue/rules-versions.md) |
| Books, custom points budgets, building units, pricing, legality, the picker                          | [Units and pricing](catalogue/construction.md)                    |
| Collection counts, CSV, wishlist, photos                                                             | [Collection](catalogue/collection.md)                             |
| Saved rosters, imports, exports, saved loadouts                                                      | [Saved lists and interchange](catalogue/saved-lists.md)           |

## Code map

| Question                                | Owner                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Book membership and imports             | `src/server/catalogueIndex.ts`                                             |
| Applied datasheet projection            | `src/shared/catalogue.ts`                                                  |
| Picker prices/limits and search         | `src/shared/cataloguePicker.ts`, `src/core/datasheetSearch.ts`             |
| Text resolution and joins               | `src/shared/catalogueDescriptions.ts`, `datasheetJoin.ts`, `datacards.ts`  |
| Army-rule fallback                      | `src/server/catalogueArmyRules.ts`                                         |
| Entry/link meaning                      | `src/core/definitions.ts`                                                  |
| Selection-tree edits                    | `src/core/selection.ts`                                                    |
| Defaults and choice swaps               | `src/core/expand.ts`                                                       |
| Model sizes, choices, spread, and kinds | `src/core/unitSize.ts`, `unitChoices.ts`, `unitSpread.ts`, `modelKinds.ts` |
| Unit assembly and equipment             | `src/core/roster.ts`, `wargear.ts`                                         |
| Evaluation and keyword conditions       | `src/core/evaluate.ts`                                                     |
| Shared count semantics                  | `src/core/collective.ts`                                                   |
| Custom points budget bounds             | `src/core/battle.ts`                                                       |
| Exclusive detachment pairs              | `src/shared/rosterDetachments.ts`                                          |

## Verification

Before pushing a catalogue release, run `just catalogue-preflight` against the proposed `catalogue.json`; it needs private release-snapshot access, activates that snapshot and runs the `@catalogue` browser journeys, so keep those tags on the owning tests when they move.

Loadout persistence fixtures choose their equipment and rules version explicitly rather than inherit upstream defaults. Optimizing preparation must not drop current or retained rules; compare complete outputs for the pinned snapshot.

After a source change, run adjacent evaluator/projection tests, `just points`, and roster/import browser flows, and check every affected surface: picker, unit card, loadout, roster total, saved-list assessment, reference and combat projection. Use each distinct conditional price-row shape. A same-named weapon on another datasheet is not proof that this one is wrong.
