# Catalogue data

Pins live in `catalogue/composition.json`, `catalogue/sources.json`, and `catalogue.json`; corrections in [`catalogue/patches/`](../../catalogue/patches/README.md). [Running locally](running-locally.md#catalogue) covers setup.

## Rules text

- Never serve or show either source's rules text in any form, construction data and the offline download included: the browser never loads them either, and every rule a player reads is a VS Data summary. Read Game Datacards strings through `SourceTexts` (`src/core/sourceText.ts`); the catalogue reads BSData's rules texts as tokens from load (`src/server/definitionTexts.ts`). Whatever a rule reads from words is recorded in `TextFacts` (`src/core/textFacts.ts`) and read through `readText` or `statedIn`, so the server and a device answer alike: a card rule's combat reading is recorded beside its token, or, for a rule of several tokens such as a stratagem, under all their keys (`factsKey`); `scripts/clientText.integration.test.ts` enforces this.
- A catalogue text Game Datacards prints too is published as the card's token, which carries the catalogue text's facts (`src/server/cardTwins.ts`); a device acts on a token only through its recorded facts.
- Only the server reads BSData tokens back into words (`definitions.words`), to search what abilities do; such fields never leave it.
- Snapshots contain rules text: publish them only to the private `praetorium-catalogue` bucket, which holds nothing else. Test runs and pull request previews read it with `SNAPSHOT_R2_*`, a read-only key for that bucket alone, so no pull request's code reaches the backups or players' photos in `praetorium-private`; only the release, the publishing workflows and production hold `PRIVATE_R2_*`. A preview receives the key as `SNAPSHOT_R2_ACCOUNT_ID`, `SNAPSHOT_R2_ACCESS_KEY_ID` and `SNAPSHOT_R2_SECRET_ACCESS_KEY`, which only `catalogueR2Client` reads, so no other bucket's client takes it up.
- Rules summaries come from the pinned [VS Data](https://github.com/richardsolomou/vs-data) releases in `catalogue/sources.json`: the current rules version's under `summaries`, and one for each earlier rules version under `summaries.earlier`, each by tag, archive and SHA-256. Materializing checks each archive's SHA-256 before unpacking, runs VS Data's own verification, refuses a release whose rules version no rules version in `catalogue/composition.json` is named for, and keeps only `summaries/<rules version>.json`, for the versions the build holds: a build without the private store, such as a preview's live refresh, verifies the releases of the versions it leaves out and keeps nothing of them: the summaries, their spans and open questions, the aliases the join needs, the credits adapted records carry, each Stratagem's typed facts and the mission packs. Each rules version plays its own release's Stratagems; every rules version plays the base release's mission packs, whose summaries `ruleSummaryRecords` serves under `missions` by `kind:id`. A new release is a change to its pin alone: while the `VS_DATA_LIVE` repository variable is `true`, `.github/workflows/vs-data-live.yml` makes that change every 30 minutes (`scripts/updateVsDataPins.ts`) and merges it once its snapshot and the required checks pass; unset it to pin by hand. Records join Game Datacards through VS Data's identity aliases (`src/shared/vsData.ts`), including the faction and wargear-slot forms for datasheets several factions print; each rules version's cards read its own release, and a file several rules versions print alike reads the base's. A full materialize then drops any summary that repeats a sentence of either source's files for its rules version (`withholdCopiedSummaries`), so a server never scans them. `ruleSummaryRecords` serves one source file's summaries by the hashes its tokens name, reading a rules version's release only once a rule of it is asked for; summaries are for reading, never game calculations. A token's file ID hashes its upstream address, revision included, so a data update replaces the file every stored token names: `ruleSummaryRecords` marks such an ID `replaced`, and the reader finds each string's current file through `textHomesFor` (`useRuleSummaries`). A summary is VS Data's restricted Markdown (paragraphs, lists of lines starting with a dash or a number, bold, `vsdata:` links), read by `src/core/summaryMarkdown.ts` into blocks the server serves, so a client never parses it; a release from before the Markdown carries offset spans instead, read the same way until no pin needs them. A summary shows uncredited in place of the rule, and a rule without one shows its name and numbers only; the Sources page carries VS Data's credit, and credits any upstream work a pinned release's records adapt (`ruleSummaryCredits`), so a credit leaves once no record needs it. A rule whose text only BSData prints finds its summary by name through its owner (`useUnitAbilitySummary`): the datasheet's VS Data unit or the detachment (`<faction>.<detachment>`), then its faction, then the one faction that has it; a core rules clarification is a record of its own (`gdc.core.rule.clarification.<rule>.<number>`), or the FAQ whose words it prints. Weapon and core abilities a summary names, by span or in brackets, open the current rules version's summary of that ability (`ruleAbilitySummaries`), which a keyword tooltip also falls back to by name where its own text has none. A rules version's release names its weapon and core abilities (`keywords`), the keyword glossary: a keyword the catalogue prints no rule for, or a core ability a faction lists among its army rules, is that ability, with no text, and shows its summary by name. The rules pages are the rules documents each release outlines in its `core-rule` records (`vsDataRuleDocuments`), in the order, sections and anchors VS Data gives them, with their summaries served under `rules` by `kind:id`; a link or `rule:` reference id made before then may name a rule by its Game Datacards id, which `catalogue/legacy-ids/rules.json` resolves, and a document or section by its id, which `rule-pages.json` resolves. `pnpm catalogue:points` ends with `scripts/checkVsDataCoverage.ts`, a ratchet per rules version on `catalogue/vs-data-coverage.json`, which also counts the current catalogue's weapon ability keywords whose tooltips show a summary.
- Materializing also keeps each release's typed effect blocks (VS Data's `docs/rule-facts.md`) beside its summaries, as `summaries/<rules version>.effects.json` by `kind:id`, with the rules a block references by name and any block Praetorium cannot read held back as unresolved. `textFactsOfVsData` (`src/shared/vsDataEffects.ts`) reads a record's blocks into `TextFacts`, starting each placement on the choice Praetorium's own reading would. `pnpm catalogue:effects [--edition <id>]` compares them with what the rules read from the words today, for every text the simulator, reminders, grades and Order allowances read, each joined to the record whose summary its datasheet shows; it reports, and changes nothing.
- Materializing also keeps each release's roster definitions and points snapshots whole, by kind and ID with their names, as `summaries/<rules version>.construction.json` (`writeVsDataConstruction`, read by `vsDataConstructionSchema`). Nothing builds lists from them yet: `pnpm exec tsx scripts/vsDataParity.ts` reports, for the current rules version, which datasheets the roster picker offers that VS Data doesn't admit to the faction's roster and the reverse, listed prices against VS Data's for each datasheet's smallest size, and each Detachment's force disposition, written to `data-dev/vs-data-parity.json`.

## Data

- Bump `CANONICAL_CATALOGUE_COMPILER_VERSION` when canonical records change, then republish via `catalogue.yml` with `force`.
- Parsed sources from `src/server/sharedJson.ts` are shared: copy before changing.
- Construction reads go in `constructionReads.ts` so the worker and server agree.
- Points come from the [MFM fork](https://github.com/richardsolomou/wh40k-11e-mfm); never duplicate prices in definitions.
- Imports read a list in any of the official app's languages through the names each rules version's VS Data release localises (`localisation/<language>.json`): compacting keeps every spelling of each faction, Detachment, Enhancement, unit and the models and wargear under it, English first (`names`), and the rules a list is imported into carry them by BSData entry id (`importNames`), so an app spelling also bridges to BSData's. `loadCatalogueTranslations` adds them to the import translations.
- Community translations, including Portuguese and Russian, which the app does not print, come from [wh40k-11e-translations](https://github.com/richardsolomou/wh40k-11e-translations), a pinnable copy of nrdata.org, which serves only its live state; refresh it there with `bin/update` and a commit, never by fetching nrdata.org at build time. They are New Recruit's spellings keyed by BSData's English names, with no licence VS Data could publish them under, so they stay an import-only source here.
- `pnpm exec tsx scripts/importParity.ts record <file>` records what every import corpus list imports to; `compare <before> <after>` lists each that changed. A change to how imports read names keeps every list the same, or reads more of it.
- Definitions no longer update upstream. After a points update, dataslate or codex, run `just drift` and work its report (`data-dev/drift/drift.md`, JSON beside it): "likely edit" rows first, where Game Datacards and 40kdc-data agree against us, then "GDC differs" rows. Game Datacards is the authority; a 40kdc-only row is a lead to check against the cards, never an edit on its own. "New in GDC HEAD" shows what a Game Datacards bump would change.
- `changes/history.json` is immutable.

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

## Top-four lists

- The Tournament lists tab's lists are fetched from 40k Stats and Mini Headquarters into `DATA_DIR/winning-lists` and imported on the web process in the background, paced between lists; never import them while answering a request.
- Every published placing is kept, with no date window: importing cleanly under the current revision is what removes a list built for removed datasheets or options. A list that imports but is no longer legal keeps its problem in its verdict and stays on the tab, marked; the builder's unit counts, grades and `list_winning_lists` by default read only lists legal today.
- A first import under a revision pauses after each list for four times as long as the list took, so the server keeps answering and the import takes about an hour; the tab shows the lists checked so far until it finishes, while the unit counts wait for the full set rather than marking units from part of it.
- Each list's verdict is kept per catalogue revision, and the draft its page reads per catalogue revision and app release, so a release that changes how lists import serves fresh drafts; changing what a verdict records must also change its stored shape, or old verdicts are served.

## Coverage bar

A release holds this bar, which only goes up:

- `just points` matches at least 99.9% of Munitorum prices and every faction file.
- Of the tournament lists in each of the `40kstats` and `lexmechanic` corpora exported from the official app's newest data, at least 95% import clean (`pnpm exec tsx scripts/importCorpus.ts run --source <source> --since 2026-06-20 --live`), and no change makes a clean list unclean.

## Saved IDs in VS Data

`catalogue/legacy-ids/{books,detachments,units,enhancements}.json` give the VS Data ID of each book, Detachment, datasheet and Enhancement ID a saved list can hold, and only grow: `scripts/freezeRosterIds.ts <catalogue directory> <unpacked releases, one directory per rules version>` adds what a new snapshot or release names and refuses to move a frozen ID. Read a list's IDs once its rules version is known (`currentRosterIds`): a key is `<rules version>~<ID>` where a retained rules version reads the ID otherwise, else the ID itself, and an Enhancement's key is `<VS Data Detachment>/<option ID>`, since one entry serves Detachments VS Data records apart. Books map by hand, Detachments and Enhancements by name within their faction with the script's reviewed spellings, datasheets by VS Data's `bsdata.*` aliases, else by exact name, and retired IDs through the retired-ID, migration and retained-version aliases.

## Roster migration

Before changing sources or saved-selection construction, baseline production rosters:

```sh
just rosters-fetch
just rosters-audit
cp data-dev/production-rosters.audit.json data-dev/production-rosters.baseline.json
just rosters-audit data-dev/production-rosters.json catalogue-data data-dev/production-rosters.baseline.json
```

Author replacements in `catalogue/roster-migrations.json` with a reason. Never fuzzy-match, substitute, or drop a selection, or suppress a legality error, to make the audit pass.

A choice a unit never made starts on the option its group names as the default (the one the card prints), whatever it costs; an optional group starts on named wargear. A unit marked `floor: true` builds each unmade choice at its cheapest option instead, the named default only settling a tie, as units were built before. `migrateStoredRoster` marks every unit of a row without `printedDefaults` and sets it, so the product data migration marks each older row once, and a save without `printedDefaults` is marked the same way: the client's `saveRoster` sends it with every save it makes or queues, and server code that saves a roster itself sets it, so a save an older app queued offline keeps its units' cheapest; `rosterFromRow` marks a row the migration has not reached yet. A battle's fielded list carries `printedDefaults` from `rosterSnapshot`, and folding one without it marks its picks. Never remove `floor` from a saved unit. A unit's listed price and the Munitorum point adjustment build at the floor too, so a costlier default is charged on top of the card's price.

Every catalogue publish (`pnpm catalogue:history`, against the published snapshot) and every live refresh (`prepareLiveRevision`, against the revision it follows) runs `checkIdDrops` (`scripts/lib/catalogueIdDrops.ts`) on the base rules. It fails when the new catalogue drops a book, datasheet, detachment, enhancement or option ID a saved roster can hold, and no map moves it, while:

- a new ID in the same scope carries the same or a near-identical name: a rename the maps must carry, even when the history reads it as a removal;
- or the data-update history does not record the removal of a book, datasheet, detachment or enhancement by that name.

An option that left its datasheet only reports. A failed refresh keeps serving the previous revision, so a release never publishes the drop. Map what saved rosters hold (run the audit above); `pnpm exec tsx scripts/catalogueIdDrops.ts <previous> <next>` runs the check on two catalogue directories, and with `--accept <reason>` records the rest in `catalogue/accepted-id-drops.json`.

## Privacy

- Who reads a roster, its notes, and its preparation follows the [privacy contract](../product-design.md#privacy-contract); exports never carry notes.
- Imports never silently drop or substitute units, and never overwrite an existing draft.
- Collection photos stay in the private bucket with location metadata stripped; every path that drops a photo row records it in `collection_photo_deletion` in the same transaction.

Before a catalogue release, run `just catalogue-preflight` against the proposed `catalogue.json`.
