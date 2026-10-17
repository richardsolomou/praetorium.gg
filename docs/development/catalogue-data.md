# Catalogue data

Community data supplies roster construction and reference records. Deterministic evaluation lives in `src/core`; source loading and contextual projection live in `src/server`. [Running locally](running-locally.md#catalogue) owns activation commands; [Game rules](game-rules.md) owns play/scoring semantics.

The offline download is three hashed assets the manifest names: the reference (pages and search), construction data for the current rules, and construction data for every rules version. A device fetches the reference first and the complete construction data only while its account data or guest draft names a roster on another version (`rulesVersionsInUse.ts`); it refetches only assets whose address changed. Construction data includes each rules version's playable catalogues and their complete transitive imports, including the game system, sharing identical data with the base source. Retain version 1 and 2 download support, restore rules-version metadata before validating, and bound compressed and expanded data. Do not duplicate unrelated armies per version or raise the bundle size limit to fit them. The build validates the generated bundle with the client's decoder before writing it. Verify a production build with the release snapshot, including versioned roster editing after a cold offline reload.

## Sources and loading

| Authority                                         | Location                                   |
| ------------------------------------------------- | ------------------------------------------ |
| Upstream revisions, licences, and attribution     | `catalogue/sources.json`                   |
| Pinned file composition and rules versions        | `catalogue/composition.json`               |
| Release snapshot pin                              | `catalogue.json`                           |
| Withdrawn snapshots/sources                       | `catalogue/revocations.json`               |
| Saved IDs from retired sources                    | `catalogue/retired-ids.json`               |
| Reviewed saved-loadout migrations                 | `catalogue/roster-migrations.json`         |
| Authored corrections with provenance              | `catalogue/patches/`, source fork branches |
| Immutable manifest, hashes, and canonical records | Verified snapshot                          |

Never commit fetched upstream files, copied rules prose, generated catalogues, or snapshots. A correction adding rules text beyond a single quoted sentence is a commit on a fork branch of its source, pinned in `catalogue/composition.json`; other corrections stay minimal and source-pinned in `catalogue/patches/`. Unsupported or conflicting semantics remain reported, not guessed. Compatibility declarations are bundled into builds, never fetched at runtime.

`pnpm catalogue:snapshot lock <snapshot-id>` adopts a verified release into `catalogue.json`. Publishing or activating a snapshot never changes an existing image. Keep candidate snapshots under ignored `data-dev/`, not `.output/`, which the production build clears.

`src/server/sync.ts` owns bounded downloads and extraction, `catalogueSnapshot.ts` packing/verification, and `scripts/lib/catalogueMaterialize.ts` source assembly. Replace output only after every source, correction, revision, hash and required-content check succeeds; never replace an activated shared-cache symlink. Retry transport failures, not checksum or schema failures.

Verify Battlemaster layout identity, slot, deployment, instance order, position and rotation before joining objective codes. New lite files require a new pinned snapshot; older snapshots keep deployment-objective fallback.

### Published rules text

Praetorium serves no Game Datacards rules text: not in pages, server reads, the API, MCP, search, the compiled runtime, or the offline download. Its parsers read each string through a `SourceTexts` function (`src/shared/sourceText.ts`); in production it is `publishedTexts` (`src/server/sourceTexts.ts`), which publishes a token naming the snapshot file, the display transform, and the SHA-256 of the exact source string. `textSources` lists each file's pinned upstream URL, derived from the snapshot's `composition.json`; a reader who opts in on a device loads those files from GitHub and `src/client/sourceText.ts` swaps each token for the string whose hash matches, so a wrong or altered file cannot answer. A string Praetorium corrected is not upstream and stays unavailable, as does a retained edition copied whole from an older snapshot. `RuleText` and `RuleMarkup` resolve tokens; anything else that shows or reads rules text must resolve it through `loadedText` or `loadedWords`, never display a token or a cut-off one.

Rules must not read a published text, on the server or a device, because neither holds its words. Read facts from the raw entry during the parse: enhancement eligibility, stratagem timing and limits, army-rule restrictions (`restrictionsIn`), and transport capacity (`printedTransport`) do. Facts read from texts other rules consult later — detachment weapon grants, strategic reserve exemptions, and referenced rule names — are recorded per token as it is made (`textFactsOf`) and travel in `LoadedDatacards.textFacts`; add a new one there and read it through `src/shared/textFacts.ts`. Compare texts with `comparableText`, since one card copied into two files publishes two tokens. Use `sourceWords` only for tests and local checks that read the source directly.

BSData text stays in the data rules compute from, on the server and in the offline download, because Leader attachments, ability grants, and combat rules read it. What Praetorium publishes from the canonical catalogue — reference pages, the API, agent tools, search, and the corpus — carries BSData descriptions as tokens too (`withDefinitionTokens`, from `LoadedCatalogue.definitionTexts`). In the browser, `RuleText` and `RuleMarkup` show any rules text only once the reader has chosen to load it; pass `authored` for words the app writes itself. Reference payloads built from the loaded catalogue publish those words as tokens too (`publishedFaction`, `publishedDetachmentReference` in `src/server/referenceCatalogue.ts`). Construction reads, the offline construction data, and the search index the device matches against keep BSData's words, because the device computes from them. `scripts/clientText.integration.test.ts` walks these payloads over the installed snapshot and fails on any Game Datacards sentence anywhere, or any BSData sentence in a reference payload.

A device chooses each text source on its own: BSData for files under a snapshot's `definitions/` and Game Datacards for `datacards/`, by place in the snapshot rather than by repository, so a fork or correction overlay counts as the source it replaces. `textSources` returns each file's source with its URL, and `loadedText` in `src/client/sourceText.ts` is the one place that decides whether a token's source is chosen; untokenized catalogue words count as BSData and rules documents as Game Datacards. The choice lives in this device's storage (`src/client/rulesText.ts`), so it behaves the same signed in or out and Praetorium keeps no record of it. Nothing loads from one click: every prompt, the rules-page notice, and `TextSourcesNotice` (shown above every page until a device decides) open the one `TextSourcesDialog`, which lists every source in `TEXT_SOURCE_INFO`, starts with only the sources already on, and records nothing on Cancel. `/sources` lists the same sources with a switch each and credits every source, so other pages name no source and carry no attribution lines.

### Compiled runtime

Builds install runtime JSON from the local cache, the shared store on the catalogue mirror, or a compile from the snapshot. The key (`scripts/catalogueRuntimeKey.ts`) hashes the compiler sources, so bump the runtime format version only when the manifest or file layout changes. Only builds with `ASSETS_R2_*` write access upload, once per key. Reads verify fingerprints and file hashes, treat unverifiable objects as misses, and fail closed on mismatched manifests. Compiler fixes reach reference pages on deployment without editing the immutable snapshot.

Readiness loads only prepared projections and the base construction catalogue. Rules-version contexts and faction pickers are built afterwards as steps (`construction()` in `src/server/catalogueEditions.ts`, generators in `src/shared/steps.ts`) that `warm` in `src/server/app.ts` runs in short slices between requests: building them before readiness held health for minutes, and leaving them to the first request stalled every request behind it. Keep each step to a file, a faction or a datasheet. `LOCAL_TEST_MODE` skips the background build because it starves browsers sharing the runner. In development, warming starts from the first request rather than the Nitro plugin, which runs a second copy of `app.ts`, and a hot reload swaps catalogue loaders without warming, so each projection rebuilds when first read.

Keep construction contexts for the process lifetime; eviction rebuilds indexes on a request. Do not scope server construction files to catalogue imports: sources omit imports for shared-ID overrides, and name-based keyword and attachment lookups need books beyond that graph. After changing construction preparation, compare production roster prices, availability and legality and complete reference projections.

Every configured rules version stays resident on every replica. `src/server/sharedJson.ts` shares strings and byte-identical parses across versions, so parsed sources, edition reference indexes and Battlemaster geometry are read-only: copy before adjusting. Benchmark in fresh processes on the same snapshot before claiming a memory or latency change, and verify container behavior after deployment. Run each with `source` and `runtime`; append snapshot and runtime-output paths and `--verify` to compare complete projection hashes:

```sh
node --expose-gc --import tsx scripts/benchmarkCatalogueMemory.ts source
node --expose-gc --import tsx scripts/benchmarkCatalogueLookups.ts source
```

### Publishing snapshots

A pull request changing `catalogue/` runs `.github/workflows/catalogue.yml`, which audits, packs, publishes an inactive candidate, and commits the `catalogue.json` pointer to the branch so preview and merge use that exact snapshot. It skips when the pinned `authoringRevision` matches the `catalogue/` tree; dispatch with `force` to republish after a compiler change. It pushes with `CHANGESETS_TOKEN` so the pointer commit runs required checks, and only for branches in this repository.

`scripts/publishCatalogue.py` publishes snapshots to the private `praetorium-private` bucket under `catalogue/` and refuses mismatched existing artifacts. A snapshot carries its source files, rules text included, so nothing publishes one where anyone can read it. Readers sign requests with `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` (`src/server/catalogueStore.ts`); CI and image builds pass them only to the steps that sync a snapshot, never to a running server, which would otherwise write test uploads to the private bucket. A production deploy runs `publishCatalogue.py activate`, so R2 `current.json` and revocations follow production, including rollbacks.

To withdraw a snapshot or source, edit `catalogue/revocations.json` and redeploy; existing images carry their pinned policy. Do not delete shared objects blindly: several retained snapshots can share one.

### Composing sources and publishing rules versions

`catalogue/composition.json` selects files from repositories pinned by full commit SHA (`branch` is only for drift reporting); root `overlays` replace exact files in `definitions`, `points`, or `datacards`. Include imported libraries and shared dependencies a replacement needs. Materialization does not catch every entry-ID collision or rules interpretation; inspect the source and run the audits.

`richardsolomou/wh40k-11e` supplies definitions; its `main` tracks BSData. Author codexes on separate fork branches preserving BSData identities and file structure, and overlay their exact commits once verified (Custodes currently comes from `feat/custodes-codex`). A branch created from current rules is only an authoring baseline until its rules, points and datacards are verified. Historical pins never move, including the retained 3 October Space Marines version and its saved rules identity.

Fast-forward the fork without force before checking drift, investigate rather than reset a divergent branch, and advance pins deliberately; syncing neither moves pins nor publishes:

```sh
gh repo sync richardsolomou/wh40k-11e --source BSData/wh40k-11e --branch main
pnpm catalogue:upstream
```

Points track the [Praetorium MFM fork](https://github.com/richardsolomou/wh40k-11e-mfm): verify each candidate against a fresh full official scrape, retain its validation and changelog, and pin its commit. Do not duplicate MFM prices in the definitions fork.

A rules version is an MFM version. Corrections, codexes and GW's dated builds within it advance the released edition's pins in place (“Changed by update”); only a new MFM version gets a new edition. A correction-only publication must still invalidate saved-roster pricing, totals and legality caches.

Editions inherit root definitions, points and datacards unless replaced; verify all three together, since inherited MFM rows and prose can override a new codex. Edition corrections live in `catalogue/patches/editions/<edition-id>/<source>/` and apply after root corrections. Only released editions can be default. `releases` events record catalogue status changes, not publisher release or effective dates. An authored `attribution` replaces the inherited MFM or Game Datacards credit; an official-looking file shape does not establish authority.

Name rules versions after verified releases (an MFM version or codex), never relative or internal names such as “Previous rules” or “Catalogue”; the default is listed first and marked “Current”. MFM dates use `firstSeen` and the BSData changelog; codex dates need a publisher announcement or corroborated retailer listings, distinguishing pre-orders, scheduled and actual releases. Retirement and compiler timestamps are not release dates. Retained catalogues sharing an MFM release are named by pinned source revision date, explained in the edition description.

Release evidence for the current versions: the Space Marines codex released on 3 October 2026 per the [publisher's 27 September announcement](https://www.warhammer-community.com/en-gb/articles/zuwukdba/sunday-preview-might-of-the-ten-thousand/) and [Loaded Dice's listing](https://www.loadeddice.uk/products/codex-space-marines-11th-edition), and was [merged upstream](https://github.com/BSData/wh40k-11e/pull/2409) on 11 October. The Custodes codex is scheduled for 17 October 2026, corroborated by [Miniature Market](https://www.miniaturemarket.com/Codex-Adeptus-Custodes-Preorder/GW-01-14-2026) and [Pandemonium Games](https://www.pandemoniumgames.co.za/collections/games-workshop/products/warhammer-40k-horus-heresy-adeptus-custodes-codex); MFM 1.6 (14 October 2026) prices it. Retained MFM 1.4 and 1.5 dates refer to definition revisions [659a6027](https://github.com/BSData/wh40k-11e/commit/659a6027f7b192d3a21a630b1c9786ae29ec741f) and [6cd87e7c](https://github.com/BSData/wh40k-11e/commit/6cd87e7c53badbac33773587d4fbee8fe06a023c).

A `base: true` edition aliases the root sources: offer it once while still resolving exact root IDs for saved rosters and old links. Roster loaders resolve a saved book through `factionFor`, not the faction index; “Army book replaced” appears only when that read says the book does not exist (`armyAvailability.ts`), never for a pending or failed read.

A faction's rules version controls units, detachments, enhancements, pricing and references together. Saved lists and exports carry `<edition-id>~<book-id>`; unit and option IDs are unchanged. Setup saves compare faction families and remap allied identities. Unqualified URLs, global search and simulator pickers use the default rules. Paths are `/factions/<faction>/rules/<slug>` (`mfm-<version>` for root rules); published slugs cannot collide with edition IDs or change, older forms redirect to the canonical path, a superseded root slug redirects to the version named for that MFM or else current rules, and unknown versions fail rather than fall back. Keep attachment, leader, supporter and detachment links in the same rules version, including cross-faction and offline.

Rosters keep their version when the default changes; `src/core/currentRules.ts` decides when an army has a newer current version (a deliberately chosen preview does not). Conversion is always deliberate and preserves units, choices, relationships, name, access and preparation; `copyRoster` with the reviewed `setup` saves it as a variant instead.

To promote a preview, keep its ID and files, append a `released` event, set `status` and `default`, and clear the previous default; never rename, delete, or copy it into the root. `validateEditionContinuity` refuses removed editions or factions, rewritten release events, and changed effective pins on archived versions or on a released version whose points change MFM version. Retire superseded editions without deleting their sources. Hosted data changes only through the snapshot workflow.

For a new MFM version, freeze the current base edition to explicit pins, add a new `base: true` default, and fold the outgoing base into `null` in `catalogue/edition-migrations.json`. A faction whose book the new MFM replaces with a codex stays out of that fold, joins the frozen edition's `catalogueIds`, and keeps unqualified pre-release rosters there through `catalogue/retained-roster-rules.json` (as MFM 1.6 does for index Custodes); fold other versions of that book into the qualified new base, not `null`, or the data migration stores IDs that resolve to the frozen edition. `just rosters-audit` reports the difference. Retained editions pin every source authority so inheritance cannot change archived rules.

### Retired sources

A retired source stays known in `catalogueSources.ts` so published snapshots still verify, but is never materialized. `catalogue/retired-ids.json` maps saved IDs to same-named records only for verified one-to-one matches; unmapped choices are reported for reselection. `src/core/retiredCatalogueIds.ts` applies it at every ID boundary.

Coverage exceptions in `catalogue/accepted-coverage-losses.json` apply only to pull requests changing `catalogue/`, so one update cannot exempt later losses; replace the list with each update.

## Roster migration rehearsal

Before changing catalogue sources or saved-selection construction, fetch production rosters ([Production roster copies](running-locally.md#production-roster-copies)) and record a baseline with the existing code; the initial audit may exit nonzero but still writes the report:

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

Author verified replacements in `catalogue/roster-migrations.json` chronologically, with both snapshot IDs and a reason. `currentPick` applies retired mappings then these, only for the current unqualified catalogue. Never infer replacements by fuzzy name matching at runtime, substitute a different enhancement, or drop a removed selection to make an audit green. Preserve option counts, model slots, attachments and unknown choices; require a player decision when there is no equivalent. Verify each mapping against both snapshots' records, add a regression test covering the old paths and repeated migration, save and reload a migrated copy in the preview, and report every unresolved item before deploying.

`catalogue/edition-migrations.json` folds rules versions that never matched their own MFM version (`null` is current rules). `src/core/editionMigrations.ts` applies it before every other ID mapping, and `migrateStoredRoster` rewrites rows during the deploy's data migration and on each write. Folded versions are never conversion destinations.

Retained editions can pin an immutable `snapshot`, which they cannot overlay. `catalogue/retained-roster-rules.json` matches exact removed detachment or selection signatures, before path migrations, only for rosters last saved before `savedBefore` (when the app first served the replacing rules); zero-count options do not match. Its notice must not claim current-rule illegality without evaluating it.

Startup compiles canonical records only for each edition's advertised factions; support books compile on demand through `canonicalCatalogueSteps`, one datasheet per event-loop turn. Never compile unrelated archived armies before health succeeds.

`scripts/retainRosterCatalogue.ts` reproduces historical profile construction from `catalogue/retained-profile-build.json`; publish and verify its immutable archives before pinning them. Preserve saved loadouts even where the original dataset reports a legality error; never suppress the error to pass a rehearsal.

## Canonical catalogue and audits

`src/server/canonicalCatalogue.ts` compiles reference records with field provenance and `issues`; contextual rosters still use the evaluator. `src/core/datasheetStructure.ts` owns semantic profile kinds, keeping upstream display labels out of UI control flow.

| Field                                                               | Policy                                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Executable choices, constraints, contextual modifiers               | BSData evaluation                                                                                    |
| Printed composition, loadout, base, mission/rules prose             | Game Datacards, published as [tokens](#published-rules-text), with supported source-backed fallbacks |
| Reference and evaluated unit points, DP, enhancement/upgrade prices | Pinned MFM when an unambiguous row joins; supported card/evaluator fallback                          |
| Wargear prices                                                      | MFM only for matching executable options or source-backed pieces; remaining costs stay evaluated     |
| Terrain geometry                                                    | Pinned Battlemaster detail and lite objectives; source-pinned label corrections                      |

No source is globally authoritative. Joins must be unambiguous and preserve selected equipment and context. For a two-row MFM starting-strength table, intermediate counts pay the upper row per the [Starting Strength guidance](https://mfm.warhammer-community.com/en); per-model tables match exactly and refuse counts outside printed limits. Conflicts, missing joins and fallbacks stay visible; unknown semantic mappings need a reviewed mapping and test.

```sh
pnpm catalogue:compile
pnpm catalogue:audit -- --details
```

Keep audit counts out of these docs.

## Code map

| Question                                | Owner                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Book membership and imports             | `src/server/catalogueIndex.ts`                                             |
| Applied datasheet projection            | `src/shared/catalogue.ts`                                                  |
| Picker prices/limits and search         | `src/shared/cataloguePicker.ts`, `datasheetSearch.ts`                      |
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

## Books and datasheets

Books offer root-linked datasheets, not every entry of a type. Library books are not player factions. Separate an entry's defining book, offering books and reference home (`isReferenceDatasheet`); conditional granted keywords do not create homes. Do not adopt another faction's detachments merely because its catalogue is imported; parent copies redirect to the parent's page. Saved retired faction/detachment IDs stay present and illegal until replaced, never dropped or priced as free. Legends are excluded from legal picker choices.

Descriptions and ability definitions require exact, unambiguous joins within the correct faction/section; an empty named section is not permission to borrow prose. Missing enhancement/stratagem details load as unavailable. Unit upgrades and enhancements stay distinct. `Twin Linked` and `Twin-linked` are the same ability, keeping the source's spelling; server, client and combat share one weapon-ability splitting rule.

`GAME_SIZES` is a stable saved-roster/command protocol, not replaced by mission-pack size records.

Answers memoized by `memoUntilSnapshotChanges` (`src/server/snapshotMemo.ts`) are shared and must not be mutated.

### Custom points budgets

A saved roster's `limit` is its battle size; an optional `pointsBudget` replaces only that size's points total, and a budget equal to the standard total is stored as none. Per core rules 25.03 and the pinned game system, the battle size alone drives detachment points, enhancement, datasheet and allied limits; only the points-limit check (`rosterUseProblem`) and the strategic reserve limit (rule 20.01) read the budget. King of the Colosseum takes no budget, a 3000-point Onslaught keeps unlimited detachment points despite the data's 4 DP, and league events refuse custom budgets.

An unstated budget is not a cleared one: saves from clients that predate budgets keep the stored value, while `null` restores the standard total. Every save, copy, variant, conversion, lock comparison and setup-review path carries the field.

Setup disables a detachment sharing a one-per-army limit with a chosen one; `exclusiveDetachments` uses the pricing evaluator so setup never disagrees with legality.

### Collection

A collection never changes pricing or legality. Counts are per datasheet ID (`src/core/collection.ts`), so a shared kit or alternative build is not modelled and roster units of one datasheet draw on the same count. Each entry holds at least one model; removal deletes the count, with its built and painted counts, in the same transaction. Painted models are built and built models are owned: `boundedProgress` lowers the bounded counts whenever a lower one changes, rather than refusing an edit another device may have made stale. Wishes (`collection_wish`) are wanted models apart from ownership and survive removal of the owned entry. Favourites are separate and say nothing about ownership. Keep read compatibility for pre-favourite heart rows until the data migration's backfill is verified. Battle-based suggestions must never block the page. Edits save to the durable queue before projecting; account downloads pass retention checks so an older download cannot overwrite a newer edit. `collection_profile` checks publication and ownership in the same transaction as the read; [Product design](../product-design.md) owns visibility. Cover changes in `e2e/collection.spec.ts`.

`src/core/collectionCsv.ts` owns the CSV format: a header row naming `datasheet` or `datasheet_id`, matching by ID before name and faction, and spreadsheet-formula escaping on export. Import is online only (`import_collection`): it reviews every row before saving, adds what is missing, treats a zero as leaving a saved count alone, never removes anything, and changes differing saved counts only when the player asks. `rosterReadiness` (`src/core/collectionReadiness.ts`) compares a roster with the reader's own collection in the builder's collapsed Your collection section.

Collection photos live in the private bucket as `collection-photos/<uuid>`, up to `MAX_DATASHEET_PHOTOS` per collection row in `collection_photo`, found by its `collection_photo_row` index. The browser re-encodes uploads, which drops location metadata; `uploadCollectionPhoto` deletes the stored object if the module refuses the row. `/api/collection-photos/<uuid>` (`src/server/collectionPhotos.ts`) asks `collection_photo` for visibility on every read and answers `no-store`, so hiding, removal and account deletion take effect at once. Every path that drops a photo row records its id in `collection_photo_deletion` in the same transaction for the web server's sweep. Likes are `collection_photo_like` rows counted into `collection_photo.likes` in the same transaction; `rankCollectionPhotos` in `src/core/collectionPhotos.ts` owns gallery order. A player's report holds a photo (`collection_photo.review`) from everyone but its owner until an administrator keeps or removes it on `/admin?tab=photos`; a kept photo ignores later reports. Administrators read any photo through the same route. With `TYPESAFE_API_KEY`, `src/server/photoScreening.ts` asks TypeSafe Jev whether each JPEG or PNG upload shows miniatures or content that does not belong, after it is stored ([Telemetry](telemetry.md) owns how to read the results). Profile pictures get the same treatment with questions only for seriously inappropriate content. Jev images are an experimental TypeSafe feature, so the request format can change between its releases. Browsers upload collection photos and profile pictures as JPEG of at least 280 pixels a side, because Jev reads only JPEG and PNG of that size. Datasheet galleries read in the browser only, because signed-out reference HTML is shared-cached. Nitro's development server serves `sec-fetch-dest: image` requests as static files, so `vite.config.ts` strips that header for this route. Uploads are never queued; previews have no private bucket and refuse them.

`collection_stock` is retired but stays in the schema and account deletion until emptied, because SpacetimeDB refuses to drop a table with rows.

## Building units

- Required models come from the datasheet; excess weapon counts cannot invent them. Collective counts go through `collective.ts`, never independent multiplication.
- Defaults fill required group counts within caps, preferring declared defaults then cheapest choices; a subgroup without its own minimum reserves what its occupants require (Indomitor Kill Team). `refit` fills only required equipment after resizing.
- The size control resizes a required group before a wider optional sibling (Wolf Guard Headtakers), and a specialist replaces a model of the kind its group is sized by (Cthonian Beserks).
- A Warlord the player removes stays removed, so a doubles roster can leave it to its teammate.
- Apply loadout choices before nested spreads, then model allocations after specialists. Removed loadouts suppress nested equipment, but restoring them keeps saved choices.
- Saved counts must match the built unit, because later presses fold against them: `withSquadBodies`, `resizedSpreads` and `builtPickSelections` keep them aligned, and a group is saved as a choice or counts, never both. Verify grow, shrink, another edit, putting a weapon down, and reload.
- Equipment counts multiply ordinary ancestors once; empty containers are not weapons and linked profiles do not merge distinct carriers.
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

Picker prices and limits use the same build inputs as saved rosters; reference pages keep unconditional prices. Before and after changing roster bootstrap pricing, compare every production roster with `pnpm benchmark:pricing data-dev/production-rosters.json <output.json>`. Do not gate edits from empty-roster limits cached with faction summaries, and no cap may hide legal units. Search keeps generic core and faction rules prose out, and keeps different CP amounts distinct.

The destination roster is the pricing authority for reference-to-roster adds. Keep picker rows stable as points change (base price, no conditional budget warning). Add stays clickable during repricing; queued clicks run one at a time against completed limits and are discarded if setup changed.

Roster cards discover attachments; the picker does not. `src/core/attachmentOptions.ts` uses the card unit's current rules, and new datasheets go through the picker's queued Add with the attachment in the same edit. Options breaking a slot, category or required-Leader rule are hidden; copy-limited ones stay visible and disabled with a reason. Missing attachment rules mean no attachment. Cover changes in `e2e/builder-guidance.spec.ts`.

## Saved lists and interchange

Saved rows contain `RosterPick` choices rebuilt against the current catalogue. Writes atomically advance the user-scoped revision; realtime transports carry no private picks. Discovery and profile readers never receive picks, notes, preparation or a variant's base; [Product design](../product-design.md) owns visibility.

Setup edits use `RosterSetupDialog`'s two-step review; `src/core/rosterSetup.ts` owns the transition. Price the exact candidate through the ordinary construction authority and recheck before confirmation; Cancel and Back save nothing. Account confirmation compares the normalized source inside the durable document transaction so another tab cannot silently rebase the review; saves outside the durable runtime (including the native v3 bridge) use the server expected-version check with one retained operation receipt and need a fresh review after an intervening edit. Guest localStorage is not atomic across tabs. Cover in `e2e/roster-setup-review.spec.ts`.

Unit notes are owner-only: `readerRosterFromRow` and battle/league reads strip them for other readers, rendered notes carry `ph-no-capture`, and no telemetry reads them. `normalisePicks` omits notes so typing never reprices. Legacy `nickname` and `prep.shareNotes` are stripped without changing pending operation inputs or receipts.

`src/core/rosterLock.ts` lets a locked roster accept only visibility changes; `saveRoster` and queued `syncRoster` apply it before the version check, so stale or offline work gets a refusal kept for review. Locking, unlocking and archiving are explicit server operations that need a connection, first sync that roster's queued edits, and advance its version. A lock is not a permission: sharing, export, battles, leagues and deletion are unaffected. Cover in `e2e/roster-lock.spec.ts` and `e2e/roster-archive.spec.ts`.

Variant groups (`baseRosterId`) cannot be changed by saves and outlive their deleted base. A visitor keeps one browser draft; a later-found draft asks before entering an account, and claim retries reuse its ID. Never overwrite an existing visitor draft through an import or exchange link.

Imports accept supported text exports, not `.ros`/`.rosz`. Unknown factions refuse; unmatched units or choices are reported for confirmation, never silently dropped or substituted, and every import is reviewed before saving. Show reported points separately from the authoritative price, and report unsupported battle sizes instead of guessing.

`src/shared/rosterFiles.ts` owns text exports. They are extended Praetorium text, not event-submission schemas; do not label a layout event-compatible (the [WTC 2026 event pack v1.1](https://wtc-belgium.com/wp-content/uploads/2026/06/2026-WTC40K-11th-edition-Event-Pack-v1.1.pdf) specifies none). Exports never carry notes, preparation, waived or optional rules. Points alone never choose a battle size they do not equal.

`src/core/rosterExchange.ts` owns versioned exchange codes. A roster with a custom budget is written as format 2 so older apps refuse it instead of importing the standard total. Owner, visibility, preparation, reminders and notes are never encoded, and the QR link carries the code in its fragment to keep rosters out of server logs. Run `e2e/roster-exchange.spec.ts` after changing the format or review.

## Data updates

`changes/history.json` is immutable inside the snapshot. `src/core/catalogueChanges.ts` compares source-faithful reference data and `catalogueChangeLog.ts` projects reads. Missing history yields an empty state, never inferred changes; missing datasets and ambiguous matches are not removals. The publisher compiles both snapshots with the same code and appends idempotently; repair verifies both sides before replacing the latest entry. Sitemap `lastmod` comes only from measured changes.

Saved-list assessment reuses `rosterUseProblem` and folds only newer history from the roster's own rules version; library count and editor banner share that fold. Only real saves advance `updatedAt`. Never compare frozen battle/league snapshots with current data.

While the device's construction download is one the service still publishes (`currentConstruction()` in `runtime.ts`), a worker holding it (`constructionWorker.ts`) answers construction reads it has prepared: the rules version's construction data, and for unit lists the faction's picker. A read it has not prepared goes to the server alone and starts that preparation in the background, so nothing is calculated twice; choosing a faction for a new roster prepares it ahead. Disconnected, or in the saved application, the worker loads the page's packed construction data and reads wait for its preparation. Import and export stay on the server while it answers, because it records them as product events; reads the device answers send the server's events from the browser (`constructionReadEvents`). Both sides run the same named reads (`constructionReads.ts`), so add a construction read to that table, never to one side. Without a prepared worker, construction prefers server calculations. Either way, send unsynced choices as inputs and never price the server's older saved copy in their place. Requests fall back to downloaded rules on failure or timeout, but cancellation must not start local calculation. The worker stops after `CONSTRUCTION_WORKER_IDLE_MS` without work because it holds the whole catalogue, and a page stops using it once the release check finds a newer release (`retireDeviceConstruction`), because its rules code may then differ from the server's. Do not prepare every faction on the device or persist calculated lists: each page would repeat work the server already does once for everyone.

Detachment reference ownership follows each datacard record's declared faction, even inside a parent's file; shared Marine detachments stay on the Space Marines page, and chapter-only detachments are never hidden because they live in the Marine book.

## Verification

Before pushing a catalogue release, run `just catalogue-preflight` against the proposed `catalogue.json`; it activates that snapshot and runs the `@catalogue` browser journeys, so keep those tags on the owning tests when they move.

Loadout persistence fixtures choose their equipment and rules version explicitly rather than inherit upstream defaults. Optimizing preparation must not drop current or retained rules; compare complete outputs for the pinned snapshot.

After a source change, run adjacent evaluator/projection tests, `just points`, and roster/import browser flows, and check every affected surface: picker, unit card, loadout, roster total, saved-list assessment, reference and combat projection. Use each distinct conditional price-row shape. A same-named weapon on another datasheet is not proof that this one is wrong.
