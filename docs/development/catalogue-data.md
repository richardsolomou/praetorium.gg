# Catalogue data

Community data supplies roster construction and reference records. Deterministic evaluation lives in `src/core`; source loading and contextual projection live in `src/server`. [Running locally](running-locally.md#catalogue) owns activation commands; [Game rules](game-rules.md) owns play/scoring semantics.

## Sources and loading

| Authority                                         | Location                     |
| ------------------------------------------------- | ---------------------------- |
| Upstream revisions, licences, and attribution     | `catalogue/sources.json`     |
| Pinned file composition and codex versions        | `catalogue/composition.json` |
| Release snapshot pin                              | `catalogue/lock.json`        |
| Withdrawn snapshots/sources                       | `catalogue/revocations.json` |
| Saved IDs from retired sources                    | `catalogue/retired-ids.json` |
| Authored corrections with provenance              | `catalogue/patches/`         |
| Immutable manifest, hashes, and canonical records | Verified snapshot            |

Never commit fetched upstream files, copied rules prose, generated catalogues, or snapshots. Keep corrections minimal and source-pinned. Game Datacards extraction includes only the configured edition/game. Inspect the exact source before changing rules; unsupported or conflicting semantics remain reported, not guessed.

Rule references recognize both `Twin Linked` and `Twin-linked` as the same weapon ability while preserving the source's displayed spelling. Weapon abilities split on commas and semicolons, preserving colon-delimited target restrictions. The server, client, and combat reader share that splitting rule. Missing catalogue rule definitions fall back to unambiguous weapon and core ability definitions in Game Datacards' `keywords.json`; a datasheet's own named ability can also describe a weapon keyword. Granted core abilities retain their source note and use the same rule definitions for their tooltip.

`src/server/sync.ts` owns bounded downloads and extraction; `catalogueSnapshot.ts` owns archive packing/verification; `scripts/lib/catalogueMaterialize.ts` owns pinned source assembly. Stage complete output and replace it only after every source, correction, revision, hash, and required-content check succeeds. Do not replace an activated shared-cache symlink. Retry transient transport failures, not checksum or schema failures.

`pnpm catalogue:materialize` writes `.output/catalogue-data/` or explicit `CATALOGUE_DIR`; single-source output supports patch verification. Publication verifies the uploaded archive before changing `current.json`. Hosted images retain their packaged snapshot until deployment; publication alone does not update live rules. Health waits for catalogue/search preparation. An instance without data can still serve battles and pasted rosters.

Battlemaster materialization fetches detail and Chapter Approved lite data for every layout. Verify layout identity, slot, deployment, instance order, position, and rotation before joining objective codes. New lite files require publishing and pinning a new verified snapshot before deployment; older snapshots retain deployment-objective fallback.

Canonical catalogue output carries a compiler version. When its version is older than the application's compiler, startup recompiles the reference in memory from the verified snapshot's sources. Local generated output must match both the current compiler version and source revisions. Compiler fixes therefore reach reference pages on deployment without changing the pinned upstream data or editing the immutable snapshot.

### Composing sources and publishing codexes

`catalogue/composition.json` selects files from independently pinned repositories. Its root `overlays` replace exact files in `definitions`, `points`, or `datacards` after fetching `catalogue/sources.json`. Every repository source uses a full commit SHA; `branch` is used for drift reporting, never as a moving download target. Include imported libraries and shared dependencies required by a replacement. Materialization rejects missing files, duplicate book IDs, duplicate overlay destinations, and missing imported books before replacing the output. It does not validate every upstream entry-ID collision or every rules interpretation; inspect the selected source and run the ordinary catalogue audits.

The composition selects BSData main, then overlays the Marine/chapter and Astartes library files from the codex branch, together with its compatible shared game system. Main removed an Extra Attacks category that the codex files still reference; keep the game-system file with those files until the branches share that schema. This retains the released Marine rules without waiting for BSData's branch merge. Branch placement does not determine official release status. Advance base and overlay pins deliberately after inspecting their changes; `pnpm catalogue:upstream` reports both published base drift and configured overlay/edition branch drift.

Author larger rules changes in the existing `richardsolomou/wh40k-11e` fork, preserving BSData identities and file structure. Keep upstream tracking and authored changes in that data repository. Praetorium can select its files alongside BSData files without merging either branch into the application. Keep small verified corrections in `catalogue/patches/`; do not copy whole catalogues or rules prose here.

Correction contents contribute to source revisions; edition revisions also contribute to the combined faction-cache revision. A correction-only publication must invalidate saved-roster pricing, totals, and legality caches.

Each `editions` entry contains an `edition`, optional whole-source replacements in `sources`, and file `overlays`. An edition needs a stable lowercase `id` (at most 20 characters), player-facing `name`, `status` (`preview`, `released`, or `retired`), `default`, original playable `catalogueIds`, and `releases` events with epoch-millisecond `at` and `status`. Use a new edition for an upcoming codex. Set preview `default` to false; only released editions can become the default. No unreleased production edition is configured until verified source data is available.

An edition inherits the composed root definitions, points, and datacards unless explicitly replaced. Verify all three authorities together: inherited MFM rows and prose can otherwise override a new codex's definitions. Pin or overlay edition-specific points and datacards when they differ. Root corrections apply before inheritance; edition corrections belong in `catalogue/patches/editions/<edition-id>/<source>/`. Both layers use the existing provenance requirements. `pnpm catalogue:materialize -- --source definitions` applies root composition for patch verification and omits editions; complete materialization builds isolated indexes under `editions/<edition-id>/`.

Players choose a codex within the faction. Its index controls units, detachments, enhancements, pricing, and references together. Changing codexes retains selections and reports unavailable choices for replacement. Every setup-save consumer, including library actions, compares faction families and remaps allied catalogue identities before saving. Rules reads carry the selected catalogue ID through optimization and reference previews. Saved lists and exports carry `<edition-id>~<book-id>`; unit and option IDs remain unchanged. Ordinary faction URLs, global search, and simulator pickers use the default rules. Exact saved IDs retain their selected version. Previews are labelled in lists and reference pages and cannot be submitted to leagues; ordinary battles can use them. Battle snapshots freeze the codex label/status with the army, including linked lists whose prices are read from current data. Older snapshots without version metadata show no codex label.

To promote a preview, keep its ID and files, append a `released` event, set `status` to `released`, and set `default` to true. Turn off the previous edition's default if one exists. Do not rename, delete, or copy the preview into the root. Publication checks the previous verified snapshot and refuses removed editions, removed faction identities, or rewritten release events. Retire superseded editions while retaining their sources for saved lists. Exact qualified reference routes can read imported support books without offering those books as selectable editions. Keep attachment, leader, supporter, and detachment destinations in the same rules version, including links from other factions and offline reference data. Data-update history compiles each version separately, including inherited units and detachments offered by its playable factions, so promotion preserves its history and does not create phantom unit additions. Saved-list change assessment compares only history from the selected rules version. Publish through the existing verified snapshot workflow; editing the authored manifest alone does not update hosted data.

### Retired sources

A retired source stays a known snapshot source name in `catalogueSources.ts`, so published snapshots that carry it still verify as history; it is never materialized again. When its records move to another source, `catalogue/retired-ids.json` maps each saved book, detachment, and datasheet ID to the current record with the same name in the matching faction, and each saved option and toggle to the one option or toggle of the same name on the mapped datasheet under the same detachment. Map only verified one-to-one matches and leave the rest unmapped, so pricing reports them as choices to reselect. `src/core/retiredCatalogueIds.ts` applies the map at each boundary where ids arrive: the server input schemas in `schemas.ts` (prices, saves, datasheets, simulations, battle faction and stratagem reads), saved rows (`rosterPersistence.ts`, library summaries), and stored guest drafts.

## Canonical catalogue and audits

`src/server/canonicalCatalogue.ts` compiles a validated, deterministic artifact with field provenance and issues. Reference pages consume it; contextual rosters still use the evaluator. `src/core/datasheetStructure.ts` owns semantic profile/characteristic kinds, keeping upstream display labels out of UI control flow.

| Field                                                               | Policy                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Executable choices, constraints, contextual modifiers               | BSData evaluation                                                                                |
| Printed composition, loadout, base, mission/rules prose             | Game Datacards, with supported source-backed fallbacks                                           |
| Reference and evaluated unit points, DP, enhancement/upgrade prices | Pinned MFM when an unambiguous row joins; supported card/evaluator fallback                      |
| Wargear prices                                                      | MFM only for matching executable options or source-backed pieces; remaining costs stay evaluated |
| Terrain geometry                                                    | Pinned Battlemaster detail and lite objectives; source-pinned label corrections                  |

Do not treat one source as globally authoritative. Replacement profile/ability joins must be unambiguous and preserve selected equipment/context. Conditional price rows require their actual model count and requisition context. Conflicts, missing joins, unsupported labels, and fallbacks remain visible in provenance and `issues`; unknown semantic mappings require a reviewed mapping and test.

```sh
pnpm catalogue:compile
pnpm catalogue:audit -- --details
```

Compilation writes `.output/canonical-catalogue.json`, outside the activated cache. Set `CATALOGUE_CANONICAL_FILE` for another path. Audits report the current snapshot; keep their changing counts outside these docs.

## Code map

| Question                                | Owner                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Book membership and imports             | `src/server/catalogueIndex.ts`                                             |
| Applied datasheet projection            | `src/server/catalogue.ts`                                                  |
| Picker prices/limits and search         | `src/server/cataloguePicker.ts`, `datasheetSearch.ts`                      |
| Text resolution and joins               | `src/server/catalogueDescriptions.ts`, `datasheetJoin.ts`, `datacards.ts`  |
| Entry/link meaning                      | `src/core/definitions.ts`                                                  |
| Selection-tree edits                    | `src/core/selection.ts`                                                    |
| Defaults and choice swaps               | `src/core/expand.ts`                                                       |
| Model sizes, choices, spread, and kinds | `src/core/unitSize.ts`, `unitChoices.ts`, `unitSpread.ts`, `modelKinds.ts` |
| Unit assembly and equipment             | `src/core/roster.ts`, `wargear.ts`                                         |
| Evaluation and keyword conditions       | `src/core/evaluate.ts`                                                     |
| Shared count semantics                  | `src/core/collective.ts`                                                   |

## Books and datasheets

Books offer root-linked datasheets, not every entry of a certain type/depth. Follow catalogue imports only when enabled; library books are not player factions. Separate an entry's defining book, books offering it, and its public reference home. `isReferenceDatasheet` supplies the shared discovery answer; conditional granted faction keywords do not create new homes.

Faction-scoped aliases and declared parents resolve rules and detachments. Do not adopt another faction's detachments merely because a catalogue imports it. Parent copies link to the parent's canonical page; chapter-only records retain their own page. Saved retired faction/detachment IDs remain present and illegal until deliberately replaced, never silently dropped or priced as free. Legends are excluded from legal picker choices.

Descriptions and ability definitions require exact, unambiguous joins. An empty named section is not permission to borrow matching prose from anywhere: a complete matching definition must belong to the correct faction/section. Missing enhancement/stratagem details finish loading as unavailable. Unit upgrades and character enhancements stay distinct, retaining source eligibility.

Missing army-rule prose can use an unambiguous matching BSData rule from the faction's books. When the faction has no army-rule cards or no Game Datacards file, only a sole visible top-level catalogue rule can supply the unnamed army rule. Library catalogues do not create factions; ambiguous candidates stay unavailable. `catalogueArmyRules.ts` owns this fallback, verified through `rules.test.ts`.

`GAME_SIZES` is a stable saved-roster/command protocol, not replaced by mission-pack size records. Source construction constraints remain authoritative. Collection membership records ownership, not model quantity.

## Building units

- Required models come from the datasheet and cannot be invented by excess weapon counts. Only supported optional specialists may enter through equipment choices. Count all loadout variants of a required model kind.
- Collective counts are unit totals; parent-scoped counts scale with carriers. Mandatory model templates stored once still satisfy per-model minima. Every consumer uses `collective.ts` rather than multiplying independently.
- Defaults distribute required group counts within option caps, preferring declared defaults then supported cheapest choices. `refit` fills required equipment after resizing, never optional groups or model groups.
- A full group's increment reduces an available sibling; decrement returns capacity to its default. A model override clears other model slots first. Bounds may live on the group or occupants and apply to the total.
- Apply loadout choices before nested weapon spreads, then model allocations after specialists. Removed loadouts suppress nested equipment; restoring them preserves saved choices. Fixed/default equipment remains readable without duplicate controls.
- Equipment counts multiply ordinary ancestors once. Empty containers are not weapons, and linked profiles do not merge distinct carriers. Preserve independent choices and paired equipment as their actual bundles.
- Reminder timing is prose-derived suggestion, confirmed by the player. Unknown wording stays blank; each trigger keeps its own moment, phase, and turn scope. Round boundaries have no phase or turn owner. Explicit first-round wording suggests a first-round restriction; generic phase boundaries suggest “Any phase”. Explicit destruction conditions can suggest retaining the alert while the unit is destroyed, with player confirmation.

## Pricing and legality

`evaluate.ts` reports unsupported semantics in `unhandled`; unreadable conditions fail closed. Pass the full force, selected book, detachment, battle-size selection, bearer, and attachment context. Preserve selection order for escalating costs. Conditions counting selections flatten containers appropriately while group tests retain membership.

`keywordIds` applies written and granted/withdrawn categories consistently. Grant conditions use written links so traversal order cannot change the result; conflicting grants/withdrawals use source order. Hidden categories never become displayed keywords. `keywordsIn`, `restrictedBy`, and the evaluator are shared by visibility and legality. Error-field modifiers are legality errors. Known irrelevant shelf operations do not become validation warnings.

A datasheet's maximum on its own selections in `parent` caps the force holding it, as BattleScribe reads it. Choices come from definitions, including absent optional groups. Shared group caps and per-option caps are different; optional equipment competes only when a group cap says so. Warlord is a toggle governed by the bearer's conditions, not a weapon option. Force-wide limits must remain enforced even where catalogue composition problems are tolerated inside a unit.

Evaluate detachments before units and include the selected battle size in every force. Enhancement limits use the force's cost/constraint semantics, not a separate manual counter. `attachedUnit` groups bodyguard, Leader, and Support for unit-wide evaluation. Profile modifiers retain base values and source labels. Never apply already projected ability/stat changes again in combat.

Detachments are ordered purchases; every purchased detachment contributes DP and rules, while the player chooses one offered force disposition. Waivers use `formatRules` and remain visible through library, chooser, league confirmation, and battle snapshot. Optional rules use `optionalRules` and apply only by explicit selection; they are not implicit format rules.

King of the Colosseum construction follows [the publisher](https://playontabletop.com/kotc/), with its product size and retained legacy limits defined in code. Keep source restrictions separate from the optional borrowed-disposition homebrew. Borrowing contributes only a disposition, never the borrowed detachment's rules or equipment; an unaffordable or unpriced borrow grants nothing. Do not assume a Toughness-sensitive roster is valid when enhancement/attachment effects cannot be verified.

## Points ratchet

`just points` builds real units and compares raw evaluator output with the pinned MFM reference; product overrides do not hide upstream disagreements. CI compares two code revisions against the same verified snapshot, with an entry-count floor. A changed snapshot may need a compatible baseline; explain it rather than comparing ratios from different reference sets. Do not lower the established match rate.

Inspect generated selections and original price rows before blaming code or source data. Keep active and Legends results separate. Use `scripts/checkJoins.ts --details` for unresolved names and faction/card coverage; do not copy its snapshot-specific counts here.

## Picker and attachments

Picker prices and limits use the same build inputs as saved rosters. Builder pricing includes roster-aware copy limits for the picker, datasheet Add, and duplication. Shared category caps deduct other units in the group; prerequisite units can unlock allied slots. Do not gate edits from the empty-roster limits cached with faction summaries. Search covers structured names, keywords, abilities, weapons, and choices; names outrank metadata and broad rules prose stays out. Complete faction summaries are snapshot-cached; an arbitrary alphabetical cap must not hide legal units. Imported allied offers retain their source labels.

`attachmentOf` reads supported source eligibility and enhancement-unlocked targets. Missing rules mean no attachment. Default capacity is one Leader and one Support unless the source changes it; a Support requiring an existing Leader stays unavailable without one. All attachment-dependent projection uses this same grouping.

## Saved lists and interchange

Saved rows contain `RosterPick` choices and rebuild against the current catalogue. Writes atomically advance the user-scoped revision; realtime transports carry no private picks. Visibility is private by default, unlisted for link holders, or public for discovery. Returning to private revokes reads without changing the URL.

Variants are independent saved lists in a flat `baseRosterId` group, copied from the server's saved row. Saves cannot change that identity. Automatic names update with edits; manual names stay chosen. Battle/league snapshots and exports freeze the name they received.

A visitor keeps one draft in browser storage, shared by its tabs and surviving reloads and native sign-in remounts. A claim submitted from the save prompt runs on arrival within an hour; a draft found later asks the signed-in player to save or discard it, so another person's leftover list never enters an account unasked. Claim retries and concurrent tabs update the same draft ID rather than creating another list. New record IDs are server-minted except that idempotent claim boundary; share tokens have their own longer format.

Imports accept supported text exports, not `.ros`/`.rosz`. Unknown factions refuse; unmatched units or choices are reported for confirmation, never silently dropped or substituted. `importMismatch.ts` owns the explanation. Treat fixed equipment and named models as already placed; equipment, enhancement, Warlord, size, and attachment mismatches need their distinct reasons. Export current choices, including only the selected force disposition.

Visitors review every supported text import before opening their one local draft. The review counts matched payload entries and names missing units or choices; correction returns to the retained text. Account saving uses the existing explicit guest claim. Exercise picker and reference-page refusals whenever unit-limit messages change. Do not overwrite an existing visitor draft through an import shortcut.

## Data updates

`changes/history.json` is validated, bounded, and immutable inside the snapshot. `src/core/catalogueChanges.ts` compares source-faithful reference data; `src/server/catalogueHistory.ts` loads it, and `catalogueChangeLog.ts` projects page/history reads. Missing history yields an empty state, not inferred changes.

History records points and additions/removals for reference datasheets, detachments, enhancements, and upgrades. It excludes prose, profiles, wargear, and renames. IDs match first, then unambiguous source-backed identities; price rows retain their conditions. Missing datasets and ambiguous matches are not interpreted as removals. Bound and deterministically order output.

The publisher compiles both verified snapshots with the same code and appends idempotently. History describes the previous snapshot and resulting revisions, not the containing snapshot's own content hash. Failed historical reads/compiles never invent a change; explicit repair verifies both sides before replacing the latest entry. `catalogue-history.yml` reconstructs older history from verified archives and upstream checkpoints; its reports/cache stay outside Git.

`/data-updates` and faction pages paginate with stable cursors and fragment anchors. Initial HTML includes history, and opening a fragment preserves the native details state. Reference links resolve against current data; removed records have no link. Sitemap `lastmod` comes only from measured changes, never assumed rules-text freshness.

Saved-list assessment reuses pricing's `rosterUseProblem`, bounded to displayed rows and yielding batches for whole-library counts. Compare only newer bounded history and fold net changes, dropping reversals. Real saves advance `updatedAt`; merely opening a list must not. Library count and editor banner share that fold. Never compare frozen battle/league snapshots with current data.

## Verification

Run adjacent evaluator/projection tests, `just points`, and relevant roster/import browser flows. Verify one and multiple carriers through edit, save, reload, preview, View mode, and export. Check every affected rendered surface after a source change: picker, unit card, loadout, roster total, saved-list assessment, reference, and combat projection. Use each distinct conditional price-row shape. A same-named weapon on another datasheet is not proof that this one is wrong.
