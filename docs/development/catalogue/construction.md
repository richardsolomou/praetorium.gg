# Catalogue data: Units and pricing

## Books and datasheets

Books offer root-linked datasheets, not every entry of a type. Library books are not player factions. Separate an entry's defining book, offering books and reference home (`isReferenceDatasheet`); conditional granted keywords do not create homes. Do not adopt another faction's detachments merely because its catalogue is imported; parent copies redirect to the parent's page. Saved retired faction/detachment IDs stay present and illegal until replaced, never dropped or priced as free. Legends are excluded from legal picker choices.

Descriptions and ability definitions require exact, unambiguous joins within the correct faction/section; an empty named section is not permission to borrow prose. Missing enhancement/stratagem details load as unavailable. Unit upgrades and enhancements stay distinct. `Twin Linked` and `Twin-linked` are the same ability, keeping the source's spelling; server, client and combat share one weapon-ability splitting rule.

`GAME_SIZES` is a stable saved-roster/command protocol, not replaced by mission-pack size records.

Answers memoized by `memoUntilSnapshotChanges` (`src/server/snapshotMemo.ts`) are shared and must not be mutated.

### Custom points budgets

A saved roster's `limit` is its battle size; an optional `pointsBudget` replaces only that size's points total, and a budget equal to the standard total is stored as none. Per core rules 25.03 and the pinned game system, the battle size alone drives detachment points, enhancement, datasheet and allied limits; only the points-limit check (`rosterUseProblem`) and the strategic reserve limit (rule 20.01) read the budget. King of the Colosseum takes no budget, a 3000-point Onslaught keeps unlimited detachment points despite the data's 4 DP, and league events refuse custom budgets.

An unstated budget is not a cleared one: saves from clients that predate budgets keep the stored value, while `null` restores the standard total. Every save, copy, variant, conversion, lock comparison and setup-review path carries the field.

Setup disables a detachment sharing a one-per-army limit with a chosen one; `exclusiveDetachments` uses the pricing evaluator so setup never disagrees with legality.

## Building units

- Required models come from the datasheet; excess weapon counts cannot invent them. A selection under an entry stores one model's share unless `collective.ts` says it stores the unit's total; pricing, per-model limits, wargear lists and imports all read counts through it, never independent multiplication. A spread giving models different options splits the model into separate selections rather than storing a squad total under one.
- Defaults fill required group counts within caps, preferring declared defaults then cheapest choices; a subgroup without its own minimum reserves what its occupants require (Indomitor Kill Team). `refit` fills only required equipment after resizing.
- The size control resizes a required group before a wider optional sibling (Wolf Guard Headtakers), and a specialist replaces a model of the kind its group is sized by (Cthonian Beserks). Growing a squad adds its group's default model before another kind (`withOptionalModels`), because the MFM adjustment in `unitPoints.ts` is measured against that default build. A specialist group inside a full group of fixed size takes its bodies from the models around it (Pathfinder rail rifles). A group of models whose own minimum and maximum are equal fixes the unit's size, whatever range its occupants state (Wyches' "9 Wyches" holds 6–9 Wyches); a fixed group of composition upgrades counts the choice, not the models (Cadian Shock Troops). A specialist whose selection lowers a squadmate's limits takes that squadmate's place rather than adding a body (`replacesSquadmate`): a Sanctifier with the simulacrum imperialis replaces a hand-flamer Sanctifier, and is offered even where the datasheet holds it outside any group (Agents of the Imperium).
- A choice is offered when the data shows it to a fresh candidate or to the built unit it sits in (`hiddenByRulesAt`), so a root-entry condition sees what the unit already holds: the Trygon's enhancements open once it takes its Character upgrade. The built unit never closes a choice the fresh candidate shows, because what hides it there is the player's to change: Death Company Intercessors hide the alternate-pistol model while any squadmate keeps the default bolt rifle, and the Yaegir Theyn's weapons follow the squad's.
- A Warlord the player removes stays removed, so a doubles roster can leave it to its teammate.
- Apply loadout choices before nested spreads, then model allocations after specialists. Removed loadouts suppress nested equipment, but restoring them keeps saved choices.
- Saved counts must match the built unit, because later presses fold against them: `withSquadBodies`, `resizedSpreads` and `builtPickSelections` keep them aligned, and a group is saved as a choice or counts, never both. A composition group with no model bounds preserves its nested groups' limits (Skorpekh and Ophydian Destroyers); non-model tokens do not change squad size. Verify grow, shrink, another edit, putting a weapon down, and reload.
- Equipment counts multiply ordinary ancestors once; empty containers are not weapons and linked profiles do not merge distinct carriers. Fixed model equipment retains copies per member; roster cards and loadouts read their total through `modelFixedCount` in `src/core/modelKinds.ts`. Verify doubled equipment through edits, reload and read-only view (`e2e/doubled-wargear.spec.ts`).
- Match weapon profiles by name and catalogue equipment ownership, never hardcoded names or suffixes; group a bundle's profiles only when a sibling explicitly matches the owner's weapon name (Melta Rifles, Multi-meltas; `e2e/reference-roster.spec.ts`). Squad-size choices are not weapon choices.
- Reminder timing is a prose-derived suggestion the player confirms; unknown wording stays blank. `remindersForDetachments` drops a detachment's alerts when setup removes it and when a battle freezes the roster.

## Pricing and legality

`evaluate.ts` reports unsupported semantics in `unhandled`; unreadable conditions fail closed. Pass the full force, book, detachment, battle size, bearer and attachment context, preserve selection order for escalating costs, and evaluate detachments before units. Never apply already-projected ability or stat changes again in combat.

Keyword grants use written links so traversal order cannot change results; conflicts use source order and hidden categories never display. `keywordsIn`, `restrictedBy` and the evaluator are shared by visibility and legality.

A datasheet's maximum on its own selections in `parent` caps the force, as BattleScribe reads it. Optional equipment competes only under a group cap. Force-wide limits stay enforced even where unit composition problems are tolerated. Enhancement limits use force cost/constraint semantics, not a manual counter.

Authored ability prose does not apply benefits; encode them through catalogue evaluation. Keep conditional, aura and once-per-battle effects conditional; a ranged-only invulnerable save must not replace the unconditional save.

Waivers (`formatRules`) stay visible through library, chooser, league confirmation and battle snapshot; `optionalRules` apply only by explicit selection.

King of the Colosseum construction follows [the publisher](https://playontabletop.com/kotc/). Keep its source restrictions separate from the optional borrowed-disposition homebrew: borrowing contributes only a disposition, and an unaffordable or unpriced borrow grants nothing. Do not assume a Toughness-sensitive roster is valid when enhancement/attachment effects cannot be verified.

## Points ratchet

`just points` compares raw evaluator output with the pinned MFM reference; product overrides must not hide upstream disagreements. CI compares two revisions against the same snapshot; do not lower the established match rate, and explain a changed snapshot's baseline rather than comparing ratios across reference sets. Keep active and Legends results separate. `scripts/checkJoins.ts --details` reports unresolved names.

## Picker and attachments

Catalogue root imports follow every transitive `importRootEntries` link once, including allies inherited through a parent army; rules-only links grant no datasheets. Picker prices and limits use the same build inputs as saved rosters; reference pages keep unconditional prices. Before and after changing roster bootstrap pricing, compare every production roster with `pnpm benchmark:pricing data-dev/production-rosters.json <output.json>`. Do not gate edits from empty-roster limits cached with faction summaries, and no cap may hide legal units. Global search, the roster picker and faction datasheet filters match a datasheet through one authority (`matchDatasheet` and `searchDatasheetEntries` in `src/core/datasheetSearch.ts`): unit-specific ability effects included, and close name matches only when nothing matches directly. Search keeps generic core and faction rules prose out, and keeps different CP amounts distinct.

The destination roster is the pricing authority for reference-to-roster adds. Keep picker rows stable as points change (base price, no conditional budget warning). Add stays clickable during repricing; queued clicks run one at a time against completed limits and are discarded if setup changed.

Roster cards discover attachments; the picker does not. `src/core/attachmentOptions.ts` uses the card unit's current rules, and new datasheets go through the picker's queued Add with the attachment in the same edit. Options breaking a slot, category or required-Leader rule are hidden; copy-limited ones stay visible and disabled with a reason. Missing attachment rules mean no attachment. A Leader may stand alone, but the core rules require every Support unit (a `Support` ability or `supporting` association) to be attached to a Bodyguard unit, so `attachmentErrors` reports an unattached one and the simulator refuses its attacks until it joins one. Cover changes in `e2e/builder-guidance.spec.ts`.
