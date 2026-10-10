# Stratagems, missions, and scoring

Game Datacards supplies printed rules, missions, and stratagems; BSData owns executable roster choices; Battlemaster supplies terrain geometry. [Catalogue data](catalogue-data.md) owns source verification and field priority. Use the verified snapshot and publisher wording before changing a mechanic.

## Rules data

`src/server/rules.ts` assembles source, card, faction, and terrain readers. Missing or ambiguous facts stay unavailable. Do not infer timing from a card name, replace absent source data with free text, or treat prose-only conditions as supported mechanics.

Faction-scoped cards supply stratagem cost, phase, turn, and usage restrictions. Recognized printed timing may fill a missing structured phase. The core once-per-phase restriction applies unless a supported whole-stratagem restriction overrides it. Unsupported card mechanics remain unavailable. Empty timing supplies no extra restriction.

Source stratagem corrections belong in `catalogue/patches/datacards/`. Corrections needed by existing snapshots and battles also pass through `src/core/stratagemCorrections.ts` when reading source cards and folding saved preparation. Cover the corrected phase, opponent-turn refusal, usage limit, and unchanged saved log; do not widen a correction beyond its source card ID and erroneous phase.

`set-prep` records the side's complete cards/stratagem pool and server-verified payouts/timing atomically. Allies pool detachments, while core stratagems appear once. Primary ownership derives from ordered force dispositions and the selected mission pack; a selected pack cannot fall through to another. Tactical decks are authoritative, and text-only rosters cannot invent faction/detachment cards.

## Scoring

- Use source payout values, eligibility, timing, and caps. `standard` payouts work in both modes; `fixed` and `tactical` remain mode-specific. Unknown timing stays off the schedule.
- `isMutuallyExclusive` groups alternative tiers; ungrouped payouts add. Counted payouts clamp at their stated ceiling.
- Both sides receive the command-phase CP grant. Additional CP gains have a separate per-round allowance that spending never reopens. Tactical discard and any resulting CP are one undoable command, including the choice to discard none.
- Tactical cards finish when scored and are discarded only by choice. Unresolved cards may remain while the next turn deals its full draw; do not top up to a fixed hand size. Fixed cards remain active after scoring.
- Draws resolve under the battle lock. Ignore client placeholder cards. Manual draws use only the remaining deck and preserve supported `WHEN DRAWN` returns/replacements; board conditions stay for the player to judge.
- New Orders combines spend, discard, and random replacement in one command and returns the replacement to draw review.
- Shared advance guards enforce known scoring moments, prior-turn settlement, draw, and hand review. Settle the ended opponent turn before the incoming draw, using that turn's hand and round, including supported final-round fallbacks.
- `score-settlement` carries its scoring round. Older commands retain their original interpretation; never rewrite stored logs to repair historical attribution.
- Mission caps refuse positive corrections beyond a stated ceiling while allowing reductions. `scoringCapError` owns that fetched-data check; do not add IO to core. Prompts show the amount that actually banks while preserving the amount claimed on the card.
- Battle-ready bonuses are recorded before play and added only at finish. Missing structured twists remain absent.

Mission actions and reminder text must come from the same pack as the card. Conflicting joins produce no action. Optional personal reminders do not replace shared scoring guards. [Battles](battles.md#prompts-and-replay) owns synchronization and undo.

## Deployment patterns

Match layout names through pinned source references; missing or ambiguous geometry cannot start a battle. Keep deployment zones, objectives, footprints, walls, and roofs from the same layout. Battlemaster lite objective codes identify each objective terrain area; merge only the explicit `c1`/`c2` linked pair. Layout objectives replace generic deployment points. Terrain letters identify parts: anchor each badge to the matching transformed part, allowing roof placement while keeping walls and objectives clear. Leave ambiguous labels absent.

Placement arrows anchor to real outline corners; an angled footprint needs a second corner on a straight edge. Derive distances from board dimensions and format them with `terrainGeometry.ts` to the nearest eighth inch. Distinguish printed dimensions from approximate traced positions.

Reflect Battlemaster parts within their declared bounds before applying part and footprint rotations. Geometry changes must advance `TERRAIN_GEOMETRY_VERSION` and its accepted server schema so saved reference queries refresh.

King of the Colosseum uses [Play On Tabletop's published rules](https://playontabletop.com/kotc/) and the verified source patch. Its traced terrain is approximate; the printed board/deployment dimensions are not. The sole valid battlefield is selected automatically and remains enlargeable. [Catalogue data](catalogue-data.md#pricing-and-legality) owns its construction rules and optional homebrew.

## Rules documents

`src/server/rulesCore.ts` reads the source-declared documents; `src/client/ruleMarkup.ts` renders their supported markup safely. Load sections independently and derive numbering/links through `ruleIndexOf`. Numbers belong to their own document, falling back to core only when absent locally; duplicate numbers need distinct addresses.

Preserve prose, headings, supported lists/tables, clarifications, and labelled fields. Unrecognized markup stays literal text, never browser HTML. Keep Markdown parsing bounded to genuine paired delimiters so footnote asterisks cannot consume later prose. Do not republish rulebook photography. Every page retains source attribution.

## Verification

Cover each independent payout/trigger/usage-limit clause and compare disputed rules with publisher text. Exercise scoring at turn/round boundaries, fixed and tactical modes, caps, draws, returns, and undo. Run map browser checks against the snapshot containing the changed source data; an older pin can leave stale assertions passing. For map changes, compare every affected map with the publisher image for reflection, rotation, wall overlap, objective labels, and placement anchors; inspect preview and enlarged layouts at desktop and phone widths.
