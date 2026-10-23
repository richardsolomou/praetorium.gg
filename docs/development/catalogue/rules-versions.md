# Catalogue data: Rules versions, updates and audits

## Composing sources and publishing rules versions

`catalogue/composition.json` selects files from repositories pinned by full commit SHA (`branch` selects the approved update stream); root `overlays` replace exact files in `definitions`, `points`, or `datacards`. Include imported libraries and shared dependencies a replacement needs. Materialization does not catch every entry-ID collision or rules interpretation; inspect the source and run the audits.

`BSData/wh40k-11e` supplies base definitions directly from `main`; Game Datacards supplies base reference records from its own `main`. Custodes construction and reference files retain the verified `feat/custodes-codex` overlays: upstream unit availability alone does not prove equivalent leader rules, army rules, stratagem timing or imports. Remove an overlay only after checking those surfaces and rehearsing saved rosters. The `richardsolomou/wh40k-11e` fork also holds authored source branches needed by retained rules. Author codexes on separate branches preserving upstream identities and file structure; verify rules, points and datacards before using them. Historical commits never move, including the retained 3 October Space Marines version and its saved rules identity. A historical repository may change to upstream only after verifying that upstream contains the identical Git commit; the commit and source path identify the retained content.

`just catalogue-upstream` compares configured pins with approved branch heads without R2 access or activation. Current sources follow their configured branches; resolve each shared repository/branch once per update and record the exact commits together in the assembled catalogue. Source updates do not require a pull request. Retired and snapshot-backed editions keep their pins; retired editions must explicitly pin all three source authorities.

Snapshots and materialized catalogues carry faction icons from the `icons` source. Without them, factions fall back to the remote icons in `src/server/factionIconSources.ts`; `tsx scripts/syncCatalogue.ts --supplemental` downloads those into the catalogue's `faction-icons/` instead.

Points track the [Praetorium MFM fork](https://github.com/richardsolomou/wh40k-11e-mfm): verify each candidate against a fresh full official scrape, retain its validation and changelog, and pin its commit. Do not duplicate MFM prices in the definitions fork.

Editions inherit root definitions, points and datacards unless replaced; verify all three together, since inherited MFM rows and prose can override a new codex. Edition corrections live in `catalogue/patches/editions/<edition-id>/<source>/` and apply after root corrections. Only released editions can be default. `releases` events record catalogue status changes, not publisher release or effective dates. An authored `attribution` replaces the inherited MFM or Game Datacards credit; an official-looking file shape does not establish authority.

Name rules versions after verified releases (an MFM version or codex), never relative or internal names such as “Previous rules” or “Catalogue”; the default is listed first and marked “Current”. MFM dates use `firstSeen` and the BSData changelog; codex dates need a publisher announcement or corroborated retailer listings, distinguishing pre-orders, scheduled and actual releases. Retirement and compiler timestamps are not release dates. Retained catalogues sharing an MFM release are named by pinned source revision date, explained in the edition description.

A `base: true` edition aliases the root sources: offer it once while still resolving exact root IDs for saved rosters and old links. Roster loaders resolve a saved book through `factionFor`, not the faction index.

A faction's rules version controls units, detachments, enhancements, pricing and references together. Saved lists and exports carry `<edition-id>~<book-id>`; unit and option IDs are unchanged. Setup saves compare faction families and remap allied identities. Unqualified URLs, global search and simulator pickers use the default rules. Paths are `/factions/<faction>/rules/<slug>` (`mfm-<version>` for root rules); older forms redirect to the canonical path. Keep attachment, leader, supporter and detachment links in the same rules version, including cross-faction and offline.

Rosters keep their version when the default changes; `src/core/currentRules.ts` decides when an army has a newer current version. Conversion is always deliberate and preserves units, choices, relationships, name, access and preparation; `copyRoster` with the reviewed `setup` saves it as a variant instead.

To promote a preview, keep its ID and files, append a `released` event, set `status` and `default`, and clear the previous default; never rename, delete, or copy it into the root. Retire superseded editions without deleting their sources. The runtime updater advances current sources; authored rules-version transitions still change the configuration in Git.

For a new MFM version, freeze the current base edition to explicit pins, add a new `base: true` default, and fold the outgoing base into `null` in `catalogue/edition-migrations.json`. A faction whose book the new MFM replaces with a codex stays out of that fold, joins the frozen edition's `catalogueIds`, and keeps unqualified pre-release rosters there through `catalogue/retained-roster-rules.json` (as MFM 1.6 does for index Custodes); fold other versions of that book into the qualified new base, not `null`, or the data migration stores IDs that resolve to the frozen edition. `just rosters-audit` reports the difference. Retained editions pin every source authority so inheritance cannot change archived rules.

## Retired sources

A retired source stays known in `catalogueSources.ts` so published snapshots still verify, but is never materialized. `catalogue/retired-ids.json` maps saved IDs to same-named records only for verified one-to-one matches; unmapped choices are reported for reselection. `src/core/retiredCatalogueIds.ts` applies it at every ID boundary.

Coverage exceptions in `catalogue/accepted-coverage-losses.json` apply only to pull requests changing `catalogue/`, so one update cannot exempt later losses; replace the list with each update.

## Roster migration rehearsal

Before changing catalogue sources or saved-selection construction, fetch production rosters ([Production roster copies](../running-locally.md#production-roster-copies)) and record a baseline with the existing code; the initial audit may exit nonzero but still writes the report:

```sh
just rosters-fetch
just rosters-audit
cp data-dev/production-rosters.audit.json data-dev/production-rosters.baseline.json
just rosters-import
```

Keep the same production snapshot throughout; refetching needs a new baseline. After the change, compare; it fails on new identity losses, unavailable detachments, clamped counts, exceeded limits or legality errors, and reports points changes, which need review too:

```sh
just rosters-audit data-dev/production-rosters.json catalogue-data data-dev/production-rosters.baseline.json
```

Author verified replacements in `catalogue/roster-migrations.json` chronologically, with both snapshot IDs and a reason. `currentPick` applies retired mappings then these, only for the current unqualified catalogue. Never infer replacements by fuzzy name matching at runtime, substitute a different enhancement, or drop a removed selection to make an audit green. Preserve option counts, model slots, attachments and unknown choices; require a player decision when there is no equivalent. A `fixedChoices` declaration may consume only a verified choice whose identical equipment is now mandatory on the same datasheet; unknown alternatives remain visible for resolution. Verify each mapping against both snapshots' records, add a regression test covering the old paths and repeated migration, save and reload a migrated copy in the preview, and report every unresolved item before deploying.

`catalogue/edition-migrations.json` folds rules versions that never matched their own MFM version (`null` is current rules). `src/core/editionMigrations.ts` applies it before every other ID mapping, and `migrateStoredRoster` rewrites rows during the deploy's data migration and on each write. Folded versions are never conversion destinations.

Retained editions can pin an immutable `snapshot`, which they cannot overlay. `catalogue/retained-roster-rules.json` matches exact removed detachment or selection signatures, before path migrations, only for rosters last saved before `savedBefore` (when the app first served the replacing rules); zero-count options do not match. Its notice must not claim current-rule illegality without evaluating it.

`scripts/retainRosterCatalogue.ts` reproduces historical profile construction from `catalogue/retained-profile-build.json`; publish and verify its immutable archives before pinning them. Preserve saved loadouts even where the original dataset reports a legality error; never suppress the error to pass a rehearsal.

## Canonical catalogue and audits

`src/server/canonicalCatalogue.ts` compiles reference records with field provenance and `issues`; contextual rosters still use the evaluator. `src/core/datasheetStructure.ts` owns semantic profile kinds, keeping upstream display labels out of UI control flow.

| Field                                                               | Policy                                                                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Executable choices, constraints, contextual modifiers               | BSData evaluation                                                                                              |
| Printed composition, loadout, base, mission/rules prose             | Game Datacards, published as [tokens](sources.md#published-rules-text), with supported source-backed fallbacks |
| Reference and evaluated unit points, DP, enhancement/upgrade prices | Pinned MFM when an unambiguous row joins; supported card/evaluator fallback                                    |
| Wargear prices                                                      | MFM only for matching executable options or source-backed pieces; remaining costs stay evaluated               |
| Terrain geometry                                                    | Pinned Battlemaster detail and lite objectives; source-pinned label corrections                                |

No source is globally authoritative. Joins must be unambiguous and preserve selected equipment and context. Conflicts, missing joins and fallbacks stay visible; unknown semantic mappings need a reviewed mapping and test.

```sh
pnpm catalogue:compile
pnpm catalogue:audit -- --details
```

Keep audit counts out of these docs.

## Data updates

`changes/history.json` is immutable inside the snapshot. `src/core/catalogueChanges.ts` compares source-faithful reference data and `src/server/catalogueChangeLog.ts` projects reads. Missing history yields an empty state, never inferred changes. The publisher compiles both snapshots with the same code and appends idempotently; repair verifies both sides before replacing the latest entry. Sitemap `lastmod` comes only from measured changes.

Saved-list assessment reuses `rosterUseProblem` and folds only newer history from the roster's own rules version; library count and editor banner share that fold. Only real saves advance `updatedAt`. Never compare frozen battle/league snapshots with current data.

While the device's construction download is one the service still publishes (`currentConstruction()` in `runtime.ts`), a worker holding it (`constructionWorker.ts`) answers construction reads it has prepared: the rules version's construction data, and for unit lists the faction's picker. A read it has not prepared goes to the server alone and starts that preparation in the background, so nothing is calculated twice; choosing a faction for a new roster prepares it ahead. Disconnected, or in the saved application, the worker loads the page's packed construction data and reads wait for its preparation. [Telemetry](../telemetry.md) owns the events for reads the device answers. Both sides run the same named reads (`constructionReads.ts`), so add a construction read to that table, never to one side. Without a prepared worker, construction prefers server calculations. Either way, send unsynced choices as inputs and never price the server's older saved copy in their place. Requests fall back to downloaded rules on failure or timeout. Do not prepare every faction on the device or persist calculated lists: each page would repeat work the server already does once for everyone.

Detachment reference ownership follows each datacard record's declared faction, even inside a parent's file; shared Marine detachments stay on the Space Marines page, and chapter-only detachments are never hidden because they live in the Marine book.
