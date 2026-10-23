# Stratagems, missions, and scoring

Game Datacards supplies printed rules, missions, and stratagems; BSData owns executable roster choices; Battlemaster supplies terrain geometry. [Catalogue data](catalogue-data.md) owns source verification and field priority. Use the verified snapshot and publisher wording before changing a mechanic.

## Rules data

`src/server/rules.ts` assembles source, card, faction, and terrain readers. Missing or ambiguous facts stay unavailable. Do not infer timing from a card name, replace absent source data with free text, or treat prose-only conditions as supported mechanics.

Faction-scoped cards supply stratagem cost, phase, turn, and usage restrictions; recognized printed timing may fill a missing structured phase. The core once-per-phase restriction applies unless a supported whole-stratagem restriction overrides it. Detachment references keep verified cards whose timing cannot be represented, but executable pools require supported phase and turn fields; never infer timing to make a reference card playable.

Source stratagem corrections belong in `catalogue/patches/datacards/`; corrections that existing snapshots and battles need also go through `src/core/stratagemCorrections.ts`, matching only the verified card ID and erroneous fields and leaving saved logs unchanged.

`set-prep` records the side's complete card and stratagem pool with server-verified payouts and timing atomically. Primary ownership derives from ordered force dispositions and the selected pack, which never falls through to another. Text-only rosters cannot invent faction or detachment cards.

## Scoring

- Use source payouts, eligibility, timing, and caps; unknown timing stays off the schedule.
- Both sides receive the command-phase CP grant. Additional CP gains have a separate per-round allowance that spending never reopens.
- Tactical cards finish when scored and are discarded only by choice; the next turn deals its full draw without topping up to a hand size. Discard and its CP, including discarding none, is one undoable command.
- Draws resolve on the server under the battle lock, ignoring client placeholder cards. New Orders is once per battle (`src/core/stratagemCorrections.ts`).
- Settle the ended opponent turn, with that turn's hand and round, before the incoming draw. `score-settlement` carries its round; older commands keep their original interpretation, and stored logs are never rewritten to repair attribution.
- `endOfBattle` objectives score after the second final turn and bypass only the round ceiling, never the battle ceiling. Undo restores the whole award. Historical frozen awards stay unchanged; older battles use manual score corrections.
- A missed action is judged as of its moment: live phase, turn, and usage limits then; its cost must not overdraw the side at any point since; a CP gain uses that round's allowance; a score banks in its round under the same caps, carries no end-of-battle claim or settlement round, and needs the secondary active and drawn by then. New Orders cannot be recorded late. Refuse anything else rather than rewriting later decisions.
- Caps refuse positive corrections beyond a stated ceiling but allow reductions. `scoringCapError` owns that fetched-data check; keep IO out of core.
- Battle-ready bonuses are recorded before play and added only at finish.

Mission actions and reminder text come from the card's own pack; conflicting joins produce no action. [Battles](battles.md#prompts-and-replay) owns synchronization and undo.

Mission nominations (`select-mission`, folded in `src/core/missionSelections.ts`) are optional table tracking and never hold up a phase or turn; the module owns when each is offered and expires. Capabilities freeze against source pack/card IDs and verified wording digests (`src/server/missionSelections.ts`): existing logs and in-play repairs keep their original capabilities, and only setup prepared or resubmitted after an update uses current ones. Table facts such as objective range, control, kills, and No Man's Land need player confirmation: never infer zones from coordinates or award points from a nomination. Unit identity comes from roster command sequence plus original attached-group membership. Objective keys and names are frozen table facts, not a geometry allowlist; saved labels never change on reload or source refresh.

## Deployment patterns

Match layouts through pinned source references; missing or ambiguous geometry cannot start a battle. Keep zones, territories, objectives, footprints, walls, and roofs from the same layout. Battlemaster gives only the attacker's territory; the rest is the defender's, and a deployment without exactly one attacker territory shows none. Merge only the explicit `c1`/`c2` objective pair. Leave ambiguous labels absent.

Reflect Battlemaster parts within their declared bounds before applying rotations. Distinguish printed dimensions from approximate traced positions. Geometry changes must advance `TERRAIN_GEOMETRY_VERSION` and its accepted server schema so saved reference queries refresh.

King of the Colosseum follows [Play On Tabletop's rules](https://playontabletop.com/kotc/); [catalogue data](catalogue-data.md#pricing-and-legality) owns its construction rules.

## Rules documents

Stratagem and mission text is published as [tokens](catalogue-data.md#published-rules-text); its timing and limits are read from the raw card during the parse.

`src/shared/ruleDocuments.ts` parses source-declared documents for both the server and the browser. The server publishes only their outline — titles, rule numbers, costs, and addresses — on every surface, with each document's pinned upstream URL and SHA-256 (`src/server/rulesCore.ts`). A reader who opts in on a device loads the text in their browser from that file (`src/client/rulesText.ts`), which refuses any file whose hash differs and keeps verified copies in Cache Storage; never add rules prose back to a server response, the snapshot's compiled output, or the offline bundle. A correction to a core rules file would change its hash, so make it upstream rather than in `catalogue/patches/`. `src/client/ruleMarkup.ts` renders supported markup. Derive numbering and links through `ruleIndexOf`: numbers belong to their own document, falling back to core only when absent locally, and duplicates need distinct addresses. Unrecognized markup stays literal text, never browser HTML. Parse Markdown only across genuine paired delimiters so footnote asterisks cannot swallow later prose. Never republish rulebook photography; every page keeps source attribution.

## Verification

Cover each independent payout, trigger, and usage-limit clause, and compare disputed rules with publisher text. Run map browser checks against the snapshot containing the changed source data, since an older pin can leave stale assertions passing. Compare every affected map with the publisher image, at desktop and phone widths.
