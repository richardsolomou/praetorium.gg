# Combat simulation

The account-free `/simulator`, isolated roster experiments, and read-only battle matchups share one calculation flow. Simulation never saves roster edits, spends resources, or sends battle commands. [Catalogue data](catalogue-data.md) owns source evaluation; [Game rules](game-rules.md) owns publisher authority.

## Code map

| Question                                                | Owner                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Exact loss distributions and bounds                     | `src/core/combat.ts`                                                                    |
| Independent die-by-die reference                        | `src/core/combatReference.ts`                                                           |
| Carriers, weapon selection, survivors, and alternatives | `src/core/combatLoadout.ts`, `combatSurvivors.ts`, `combatLoadouts.ts`, `combatUnit.ts` |
| Source clauses and applied effects                      | `src/core/combatRuleCompiler.ts`, `combatRules.ts`, `combatMortalRules.ts`              |
| User overrides                                          | `src/core/combatAdjustments.ts`                                                         |
| Contextual projection and legal search                  | `src/server/combatUnits.ts`, `combatLoadouts.ts`                                        |
| Shared interface, workers, and URL state                | `src/client/features/simulator`                                                         |

## Interface and context

`CombatMatchup` consumes evaluated combatant snapshots without owning roster/battle fetching or mutation. Preserve the selected book, full roster, detachments, attachments, carriers, and source labels; do not rebuild an isolated pick. Key local adjustments by identity. Swapping preserves both units’ equipment, model counts, and selected weapon profiles, including optimized profiles. Store weapon preferences with the combatant’s identity and shared side so swapping twice, sharing while defending, and reloading retain them; reset situational modifiers and exclusions when the matchup changes.

Standalone sides add legal leaders and support with the unit card’s plus picker through the existing attachment authority; a standalone character can add a legal squad and keep its equipment. Shared links retain their loadouts. Show the squad and characters as equal member rows with one total model count and points cost. Use each member’s name as its picker, with its source faction icon, model controls, and an accessible Loadout gear button. Model controls sit immediately before Loadout. Keep each member’s picker and model/loadout controls on one line. Truncate the unit name and placeholder before shrinking controls in narrow cards. Member dropdowns retain a readable minimum width independent of their compact fields, bounded by the available viewport width. Imported leaders keep their own faction mark; do not substitute their host’s faction. Reference route faction slugs are presentation values; keep the host catalogue ID for imported equipment evaluation. Place the accessible Add icon beside the side’s heading and a fixed-width Optimize icon at the opposite end, with total models and points on the heading line when they fit. Keep the totals and Optimize together when the header needs to wrap. Explain Optimize in a tooltip; while running, show only its progress percentage and retain its cancellation action. Place the icon-only Swap control beside Attacker and Add with an accessible name and tooltip. Keep its position fixed while pressed. Every standalone member has a remove button, disabled only for the last remaining member or while busy. Removing the squad promotes a remaining character without losing equipment; retain the other members and report incompatible attachments through the existing authority. Add stays in place and disabled when no legal members remain. Replacing an attached member keeps the other slots occupied and uses the attachment authority. Replacing the squad preserves its companions and reports incompatible attachments. Frozen roster/battle companions cannot be replaced. Roster and battle matchups include active attached members. Each member retains its weapons, personal rules, health, and defensive protection; unit-wide abilities reach its attached companions. Defence allocation puts non-Characters before Characters and wounded groups before healthy groups within those categories. Use Bodyguard Toughness while Bodyguards survive, then the highest surviving leader/support Toughness.

Both phases calculate automatically. A pinned outcome leads with combined destruction probability; Breakdown shows phase-alone and combined losses/distributions. Keep weapons readable, rules/buffs and manual modifiers in their own expandable sections, and the selected calculation summary visible. Excluding a weapon changes attacks, not its loadout. Tooltips and positive-threshold charts support hover, focus, and touch.

Reserve the complete card layout before unit data arrives, including header actions, totals, model steppers, Loadout, and remove controls; show unknown counts as placeholders only while a selected unit loads, and keep control geometry through hydration and initial selection. With no selected unit, show Choose a unit and static dashes for counts and points; never show loading animations or busy counts for an empty side. Keep controls and prior estimates stable and muted during same-unit edits; cancel obsolete work. Adding or removing a member preserves the squad’s controls, weapon cards, expanded shelves, and prior estimates throughout repricing. Replacing a member keeps the rows and prior estimates visible with busy pickers until its data settles. Replacing the squad then resets matchup settings. Warm loadout data on gear hover/focus and preserve the editor during repricing. Failure has a retry action. Standalone URL state is bounded/schema-checked and replaces history; invalid links open empty. Roster/battle experiments keep no URL state.

Roster sessions copy the current draft and discard experiments on close; reopening starts from the current roster. Battle sessions use frozen picks and live surviving health. Keep the full roster for context, but destroyed/reserve/embarked units cannot provide selectable support. Ambiguous surviving weapons require explicit allocation, including unit equipment. Bearer-only defence is not assumed for an unidentified survivor. Legacy snapshots without picks cannot simulate.

## Rules and boundaries

Compile complete supported source clauses into typed effects, never rules selected by card name. Preserve recipients, target keywords, weapon names, phase, range, conditions, and exclusivity. Unknown additional mechanics keep the whole rule uncalculated; recognized non-damage clauses may coexist. Audit classifications never enable runtime support.

Do not apply evaluated profile changes twice or suppress other effects from the same rule. Passive supported effects may start active; targeted, conditional, resource-funded, and once-per-battle effects require explicit confirmation. The player decides board state, range, visibility, and activation; recording a stratagem in battle does not establish its target/duration.

Combine opposing modifiers before limits. Preserve source stacking rules, conditional defences, automatic versus successful-only critical thresholds, and explicit choices between incomparable repeated numeric abilities. Automatic hits/wounds are not critical. Manual grants use the supported better value, while additive modifiers combine before caps. A selected effect remains visibly selected even when it cannot change the result.

Unsupported bearer ownership, attack targeting, sacrifices, or additional mechanics must not produce a confident estimate. Keep current support in the compiler/keyword tests and `pnpm catalogue:combat`, rather than a duplicated prose inventory.

## Calculation

Compute exact phase distributions and a shooting-then-melee sequence. Combined results carry shooting's health distribution into melee; do not add phase probabilities or average unconstrained damage. Empty/excluded phases contribute zero attacks; unsupported phases block the combined result while leaving a valid individual phase available.

Attached abilities persist until the attacking unit finishes its attacks (core rules 19.04). Track the source of projected Feel No Pain grants: keep them through the current phase, then remove grants from destroyed sources before the next phase while retaining personal protection and surviving grants. A leader keeps its own leading abilities after its bodyguard is destroyed. Allow combined estimates and optimization when a shared defensive source is allocated last and cannot expire before the unit is destroyed. Retain phase-only estimates when other shared defensive effects can lose their source while recipients survive. Refuse shared Feel No Pain combined with separate mortal-wound abilities until their immediate source-expiry timing is represented.

Preserve no-spill weapon damage, current-model damage, allocation order, mixed defence groups, highest surviving Toughness, and the source save-pool order. Separate supported mortal-wound abilities have their own timing, spill, and prevention rules. Intrinsic/equipped profiles retain source identities and carrier counts. Unknown ownership, inconsistent counts, unsupported abilities, and expressions refuse calculation rather than approximate.

Use the fetched edition's attack and ability rules, not remembered rules from another edition. The reference roller and scripted/exhaustive tests establish sequence behavior; sampled larger matchups supplement them. Runtime input/work bounds, worker timeout, cancellation, and independent phase failure remain part of correctness.

## Loadout odds

Only standalone and roster experiments expose legal alternative-loadout odds and Optimize; battle loadouts stay frozen. Build alternatives through the evaluator in full context and score their real carriers through the same rules/adjustments as the matchup. Confirm the current carriers reproduce the main attack before comparing alternatives.

Rank by destruction probability, then models and wounds lost. Every member’s loadout editor shows alternative odds and best markers: vary that member’s equipment while retaining every other member’s attacks. Namespace companion profiles and carriers consistently, and match those identities back to the editor’s local profiles. Keep profile-alone odds distinct from whole-unit alternatives, preserve small positive probabilities, and leave prior odds in place while recalculating.

Optimization holds model counts and non-weapon choices fixed and searches legal equipment/profile combinations across the whole attached unit, including when opened from a leader. Evaluate every candidate in its full roster context and apply all winning member loadouts together; preserve attachment identities and unrelated picks. Deduplicate equivalent selections and projected combatants without pruning distinct selections that can reach different legal states. Cancel keeps the best result already found. Timeout, unsupported combinations, and memory/work limits must not claim an exact optimum. Read bounds and progress behavior in `src/server/combatLoadouts.ts` and the simulator worker flow.

## Coverage audit

`pnpm catalogue:combat` inventories source clauses and raw weapon keyword variants; `--faction` narrows it and `--json` preserves sources and support status. Reports remain outside Git. Compiler wording coverage does not prove matchup eligibility or include every already-projected effect.

TypeSafe Jev shortlists development candidates only. With `TYPESAFE_API_KEY`:

```sh
mkdir -p combat-reports
pnpm exec tsx scripts/auditCombatRules.ts --json > combat-reports/inventory.json
pnpm catalogue:combat:shortlist --input combat-reports/inventory.json
```

Bound classification, retries, and deadlines; cache by source/questions/model revision. Failed cache restoration stops inference, and incomplete runs report partial results with a nonzero exit. The application needs no TypeSafe credential. Recheck the inventory after parser changes and prove supported effects with source-backed probability tests.

## Verification

Use core/reference tests for mechanics, carrier ownership, contextual effects, negative branches, and limits. Clone cached projected weapon values before changing test scenarios so one fixture cannot alter another. Browser flows in `e2e/roster-simulator.spec.ts` and `e2e/battle-simulator.spec.ts` cover isolation, delayed edits, swaps, current casualties, explicit survivors, and frozen state. Check standalone URL reload/share, both phases and combined outcomes, cancellation, and previous-estimate stability.

At desktop and phone widths, inspect pinned-result alignment and final-control scroll space, nested loadout dialogs, charts/tooltips, selected/ineffective modifiers, and JavaScript-disabled first frames. Keep battle loadouts free of alternative odds and mutation controls.
