# Combat simulation

The account-free `/simulator`, isolated roster experiments, and read-only battle matchups share one calculation flow. Simulation never saves roster edits, spends resources, or sends battle commands. [Catalogue data](catalogue-data.md) owns source evaluation; [Game rules](game-rules.md) owns publisher authority.

## Code map

| Question                               | Owner                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Exact distributions and bounds         | `src/core/combat.ts`, reference roller `combatReference.ts`                                 |
| Carriers, survivors, and alternatives  | `src/core/combatLoadout.ts`, `combatSurvivors.ts`, `combatLoadouts.ts`, `combatUnit.ts`     |
| Source clauses and applied effects     | `src/core/combatRuleCompiler.ts`, `combatRules.ts`, `combatMortalRules.ts`                  |
| User overrides                         | `src/core/combatAdjustments.ts`                                                             |
| Contextual projection and legal search | `src/server/combatUnits.ts`, `combatLoadouts.ts`                                            |
| Matchup assembly and phase resolution  | `src/core/combatMatchup.ts`                                                                 |
| Server pool and answer cache bounds    | `src/server/combatCalculationPool.ts`, `src/shared/combatAnswerCache.ts`                    |
| Interface, workers, and URL state      | `src/client/features/simulator`, `src/contracts/simulatorState.ts`                          |
| Comparison matrix and its cache        | `RosterCombatComparison`, `runRosterCombat.ts`, `RosterCombatTable`, `rosterCombatCache.ts` |
| Agent tool                             | `src/server/combatTools.ts`, [Agent reference](agent-reference.md#mcp)                      |

## Interface and context

Every estimate goes through `combatCalculation.ts` and `resolveCombatRequest`. Connected estimates use the server pool; service failure falls back to browser workers, and downloaded rules keep offline simulation working. Cache answers by the complete resolved request and never store roster documents or account metadata in the shared server cache. No cache replaces roster access checks.

`CombatMatchup` consumes evaluated snapshots and never fetches or mutates rosters or battles. Preserve the selected book, full roster, detachments, attachments, carriers, and source labels; do not rebuild an isolated pick. Key adjustments and weapon preferences by exact catalogue identity and side so swaps and member changes keep valid choices; companion choice ordinals are not absolute profile positions. Wait for current profile metadata before invalidating equipment choices, explain discarded choices, and reject callbacks from obsolete contexts.

Member changes go through the existing attachment authority. Imported leaders keep their own faction mark, but imported equipment is evaluated with the host catalogue ID; reference route faction slugs are presentation only. Each member keeps its weapons, rules, health, and defence; unit-wide abilities reach attached companions. Defence allocation puts non-Characters before Characters and wounded before healthy groups; use Bodyguard Toughness while Bodyguards survive, then the highest surviving leader/support Toughness.

Show sourced re-rolls and evaluated profile changes separately from manual overrides. The Calculation uses summary lists, per phase, every active rule on both sides (including attached units), the weapon choices and left-out weapons (`calculationInputs.ts`), then manual overrides, so a player can see everything an estimate takes into account. Excluding a weapon changes attacks, not the loadout. Standalone URL state replaces history; roster/battle experiments keep no URL state.

The standalone simulator offers an optional editable example in its page header, without moving the unit controls during selection or loading. A signed-in player can field a standalone side from one of their saved rosters, a friend's public roster (the first page of the roster library's Friends feed), or a friend's sealed list from a revealed event in a league the player can list (`friendLeagueRosters`: public, or one they own, help run or have entered): the side is a roster experiment (`CombatRoster` with `saved`), so it keeps the roster's detachment, enhancements, attachments and roster-wide rules against any catalogue unit or another roster. Simulate on a unit of another player's roster or revealed league list opens this simulator with that unit defending (`rosterMatchup`), so the player can attack it with one of their own; a linked roster they do not otherwise list appears under Opened rosters. Battle snapshots and the player's own rosters keep the in-place roster experiment. A side, recent simulation or comparison group drawn from a player's roster shows that player's name and avatar (`rosterOwners.tsx`), found among the player's own rosters, friends' rosters and friends' league lists; a roster opened by another reader's link and a bare catalogue unit name no one. Its link names the roster (or the league event and entrant) and the unit's position, not a copy of the roster; reopening reads the roster again through `sharedRoster` or `openLeagueRoster` and their access checks, follows a unit that moved within it, and leaves the side empty with a notice when the roster or unit is gone rather than substituting a bare catalogue pick. `matchupHistory.ts` remembers a signed-in player's latest settings for `RECENT_MATCHUP_LIMIT` standalone pairings after a successful estimate, using the same bounded URL contract; `simulatorPairing` identifies a pairing by its main units and their rosters, so newer settings and attachments replace older ones. History lives with the account (`recent_matchups`, trimmed by the module) and syncs through the offline action queue; guests keep none, and nothing is stored on the device. Only the standalone simulator supplies `onRemember`, so roster-editor and battle experiments never enter it. Remembered simulations reopen these settings and calculate again with current rules and roster contents rather than restoring an old answer. `e2e/simulator-journey.spec.ts` covers example editing, reloads, reopening, saved-roster sides, removal from another tab and another device, and guests keeping none.

Roster sessions copy the current draft and discard experiments on close. Battle sessions use frozen picks and live surviving health, and live battle changes update an open simulator without resetting its choices. Destroyed, reserve, and embarked units cannot provide support or be paired. Ambiguous surviving weapons require explicit allocation, and bearer-only defence is never assumed for an unidentified survivor. Legacy snapshots without picks cannot simulate.

Standalone roster reads merge into the current pairing rather than the pairing captured before the read. A newer choice on the same side supersedes its pending read; opening an example or recent simulation supersedes both sides. `e2e/simulator-roster-selection.spec.ts` verifies delayed replies, both sides, replacements and reloads.

Comparison matrices run every attacker against every defender through the same engine, with default profiles and supported passive rules only. Roster and benchmark pairings start at full health, battle pairings at logged health. Highlights rank independent attacks, not a joint assignment. Cancellation keeps completed summaries; unsupported or failed phases stay explained cells. Benchmarks (`DEFAULT_BENCHMARKS`) resolve by exact name in the default-edition index with no detachment.

Never cache partial runs, failed projections, or worker failures. The standalone comparison also offers the friends' rosters and friends' revealed league lists the unit simulator lists, each loaded through its own access check and labelled with its owner. Saved-roster and benchmark refreshes must not reset league or battle comparisons or cancel an explicit run. League comparisons read sealed snapshots through `openLeagueRoster` and its access checks ([Leagues](leagues.md) owns reveal gating); in doubles and 2v1 events a fixed pair is also offered as one side fielding both sealed lists, with each row naming its owner, and the comparison opens on the reader's pair against the opponent's (`leagueCombatPairing`); battle comparisons use `battleCombatRoster` and `combatAtHealth`.

## Rules and boundaries

Compile complete supported source clauses into typed effects, never rules selected by card name. Preserve recipients, target keywords, weapon names, phase, range, conditions, and exclusivity. Unknown additional mechanics keep the whole rule uncalculated; recognized non-damage clauses may coexist. Audit classifications never enable runtime support.

Do not apply evaluated profile changes twice or suppress other effects from the same rule. Passive supported effects may start active; targeted, conditional, resource-funded, and once-per-battle effects require explicit confirmation. The player decides board state, range, visibility, and activation; recording a stratagem in battle does not establish its target or duration.

Preserve source stacking rules, conditional defences, and explicit choices between incomparable repeated numeric abilities. A selected effect stays visibly selected even when it cannot change the result.

Rules are compiled from their words. A rule published as a [token](catalogue/sources.md#published-rules-text) reaches the simulator with its place in the roster (its origin, attachment, and the keywords of the unit, its attached units and every possible source); `rosterCombatant` passes it through unjudged and `readableRules` judges it with the same `judgedCombatRule` the server uses once the device has loaded its text, so effects whose words are tokens need the text loaded and server-side calculations leave them out.

Unsupported bearer ownership, attack targeting, sacrifices, or additional mechanics must not produce a confident estimate. Current support lives in the compiler/keyword tests and `pnpm catalogue:combat`, not a prose inventory.

## Calculation

Compute exact phase distributions and a shooting-then-melee sequence that carries shooting's health distribution into melee; never add phase probabilities or average unconstrained damage. Uncapped kills recalculate the same attacks against enough copies of a single-profile target to absorb them, with Blast and Cleave counting the real target; omit them for mixed profiles or when model-limit truncation could change the second decimal.

Attached abilities persist until the attacking unit finishes its attacks (core rules 19.04). Keep projected Feel No Pain grants through the current phase, then drop grants from destroyed sources before the next phase. A leader keeps its own leading abilities after its bodyguard is destroyed. Combined estimates and optimization are allowed only when a shared defensive source is allocated last and cannot expire before the unit is destroyed; otherwise keep phase-only estimates. Refuse shared Feel No Pain combined with separate mortal-wound abilities until their immediate source-expiry timing is represented.

Carriers keep model and weapon profile IDs, matched before legacy names and namespaced for attached members through projection and explicit survivors. Casualties across different model identities require explicit allocation unless the evaluated sheet establishes homogeneous defences and matching weapons. Unknown ownership, inconsistent counts, unsupported abilities, and expressions refuse calculation rather than approximate.

Use the fetched edition's rules, not remembered rules from another edition. The reference roller and exhaustive tests establish sequence behaviour; sampled larger matchups supplement them. Work bounds, timeouts, cancellation, and independent phase failure are part of correctness.

## Loadout odds

Only standalone and roster experiments expose alternative-loadout odds and Optimize; battle loadouts stay frozen. Build alternatives through the evaluator in full context, and score real carriers through the same rules and adjustments.

Optimization holds model counts and non-weapon choices fixed, searches legal equipment across the whole attached unit in full roster context, and applies all winning member loadouts together when the search finishes or the player cancels it. Keep the displayed loadout stable during discovery so refreshing its profiles cannot invalidate the search’s own weapon preferences. The main Optimize action ranks the shooting-then-melee sequence; its dropdown offers Optimize for ranged and Optimize for melee. A unit whose choices allow at most `EXHAUSTIVE_STATES` loadouts is searched exhaustively: never prune distinct selections that can reach different legal states there. A local result tells the player it is the best one found, not every loadout compared, and a result says when loadouts it could not estimate were left out. Timeouts, unsupported combinations, local searches, and work limits must not claim an exact optimum. Bounds live in `src/shared/combatLoadouts.ts` and `useLoadoutOptimizer.ts`.

Candidate discovery runs on the device through `deviceLoadoutSearch` (`src/client/offline/constructionWorker.ts`); `/api/simulator/optimize` serves devices without a download. The offline picker reads the index prepared by `catalogueEditionLoaders.combatUnits()` rather than projecting every army on the main thread.

## Coverage audit

`pnpm catalogue:combat` inventories source clauses and raw weapon keyword variants (`--faction`, `--json`); reports stay outside Git. Compiler wording coverage does not prove matchup eligibility. TypeSafe Jev shortlists development candidates only; combat simulation needs no TypeSafe credential. With `TYPESAFE_API_KEY`:

```sh
mkdir -p combat-reports
pnpm exec tsx scripts/auditCombatRules.ts --json > combat-reports/inventory.json
pnpm catalogue:combat:shortlist --input combat-reports/inventory.json
```

Recheck the inventory after parser changes and prove supported effects with source-backed probability tests.

## Verification

Use core/reference tests for mechanics, carrier ownership, contextual effects, negative branches, and limits. Clone cached projected weapon values before changing test scenarios so one fixture cannot alter another. Browser journeys are `e2e/simulator.spec.ts`, `simulator-context.spec.ts`, `roster-simulator.spec.ts`, `battle-simulator.spec.ts`, `combat-service.spec.ts`, `roster-comparison.spec.ts`, and the comparison journey in `leagues.spec.ts`. Verify matrix continuity through a real background saved-roster update during a calculation, and inspect at desktop and phone widths with JavaScript disabled for first frames.

Keep catalogue equipment ownership, profile alternatives and faction-index permutations in `scripts/simulatorCatalogue.integration.test.ts`, using the pinned snapshot and the ordinary projection and calculation functions. Browser tests cover the interactions that connect those functions: loadout editing, phase and member changes, workers, URL restoration, responsive layout, and persisted state. Add a catalogue case to the integration matrix before repeating an existing browser journey for another unit.
