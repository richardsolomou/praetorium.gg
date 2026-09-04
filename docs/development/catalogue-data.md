# Catalogue data

Praetorium builds and validates rosters from community data. Domain code stays in `src/core`. Loading and search stay in `src/server`.

## Sources and loading

- `catalogue/sources.json` defines each upstream source. Revisions and file hashes live in immutable snapshot manifests outside Git.
- The Game Datacards source extracts only `11th/gdc`; data for other games and editions is excluded from snapshots.
- Mission cards are read from both sources: the rules source says when a payout is due and how a card's payouts relate, and the Game Datacards mission pack says what each one asks for. Game Datacards names army-construction choices; the rules source only adds semantics it uniquely carries. Nothing is joined by a fuzzy match.
- `catalogue-data/` contains fetched data and is gitignored. Game data and copied rules text never enter version control.
- An hourly automation checks upstream revisions and publishes a complete immutable snapshot. It replaces the remote `current.json` pointer only after reading and verifying the published archive. A source disagreeing with another about a name is reported there rather than blocking the publish; see [Points ratchet](#points-ratchet).
- Running instances check that pointer hourly, download a changed snapshot from the shared store, and swap it into place atomically. They never contact an upstream data provider.
- Community-data requests have a per-attempt timeout and retry only transient network failures, timeouts, rate limits, and server errors. Checksums and invalid data fail immediately.
- `src/server/sync.ts` fetches upstream data only for the snapshot publisher. `src/server/catalogueSnapshot.ts` owns packing, verification, and instance downloads.
- Repository sources extract only their configured path. The sync checks archive size, output size, paths, and required contents before replacement.
- Each download uses a staging directory. It replaces the current source only after the download finishes and its revision or hashes match.
- Battlemaster supplies the exact terrain footprints, labels, and setup measurements. Rules-source owner and layout slugs resolve only through the pinned Battlemaster catalog; a missing or ambiguous match remains visible as unavailable, cannot be selected, and cannot start a battle.
- `just catalogue-sync` calls the same sync code as the server.
- The server loads the catalogue on first use. An instance without catalogue data can still serve battles and pasted rosters.

Server catalogue code is split by responsibility:

- `catalogueIndex.ts` loads files and indexes books, detachments, datasheet membership, and 40kdc's namespaced source references.
- `catalogue.ts` projects a datasheet for display and applies contextual profile modifiers. `datasheetRecordIn` is that projection made once per snapshot against the default selection — the reference page, the picker, the search index and roster pricing all read it — and a roster's own view is projected from the same code with the list as context.
- `cataloguePicker.ts` groups, prices, and limits picker results. `datasheetSearch.ts` matches the datasheet record's fields for the picker and global search; an enhancement is a choice, not an ability, so it is not indexed as one.
- `catalogueDescriptions.ts` resolves detachment and enhancement text without guessing between conflicting matches.
- `datacards.ts` reads Game Datacards once per snapshot — the catalogue loader hands the result to the rules loader — and `datasheetJoin.ts` is the one join from a catalogue datasheet to its card. It follows an exact 40kdc BSData↔Game Datacards relationship first. Missing or unresolved references fall back to the book's own file by name, then any file where every copy agrees, with apostrophes folded and a trailing plural forgiven. `just points` reports exact joins, every fallback, and every name the join cannot carry across.
- `sync.ts` owns downloads and atomic replacement. It does not interpret game data.

The rules dataset is split the same way. `rules.ts` only assembles `LoadedRules`; `rulesSource.ts` reads the files and keys what it finds, and `rulesCards.ts`, `rulesFactions.ts` and `rulesTerrain.ts` each own one part of it. An absent source leaves its part empty rather than guessed.

Core catalogue code is split by question:

- `definitions.ts` reads what the data says about one entry: what a link resolves to, what it holds, and whether a number is one model's or the whole squad's.
- `selection.ts` reads and rewrites a selection tree by path. It knows nothing about catalogues.
- `expand.ts` builds the smallest legal selection of an entry, and swaps a single choice.
- `unitSize.ts` says how many models a selection fields and which group resizes it.
- `unitChoices.ts` says what the data still leaves to the player, read from the datasheet rather than from what was built.
- `unitSpread.ts` divides a squad between the options one group offers, keeping the squad the size the player set.
- `modelKinds.ts` gathers per-loadout entries back into the kinds of model a datasheet names.
- `roster.ts` assembles all of it into `buildUnit`, and `wargear.ts` lists what the result is carrying.

## Books and datasheets

- A book offers the datasheets linked from its root. Entry type and file depth do not identify a datasheet.
- `catalogueLinks` are followed only when `importRootEntries` is true. Imported rosters are one level deep.
- Entries marked `library: true` are absent from the faction list.
- `catalogueOf` identifies the file that defines an entry. `index.datasheets.get(catalogueId)` identifies the books that offer it.
- `isDatasheetId` can fall back to any synced book when an imported roster names an unavailable catalogue.
- A book's own detachments take priority. A book without detachments uses the detachments from the book that contributes most of its roster.
- The rules dataset is keyed by its faction directory and every alias declared there. The catalogues call the Adeptus Astartes book Space Marines, and a lookup by the player-facing name still reaches its detachment and stratagem semantics.
- Army rules come from Game Datacards and are keyed by both the faction's own name and its catalogue name. The rules dataset's named rule is the fallback only when that faction has no Game Datacards card.
- Available detachments are those named by the faction's Game Datacards file or its declared parent's file. A catalogue import does not adopt another faction's detachments, and stale rules-source names are reported rather than offered.
- A detachment's stratagems are the union of the ids it names and the records filed under it. A stratagem is named as its card prints it; the rules dataset shouts, and only a stratagem without a card is title-cased from that. Core cards also keep the rules source's punctuation when the two sources differ only in how they punctuate or space a name. The dataset writes a shared stratagem down once and the other detachments reach it by id only; a card reached both ways is kept once, as the copy filed under this detachment.
- Detachment rule cards use Game Datacards wording when it is available. Separately named rules present only in the catalogue are appended, so supporting definitions such as a detachment's granted keywords are not lost.
- Legends datasheets are not legal roster choices and are never returned by the picker.
- A detachment has a wrapper, a group, and its choices. Any layer can be inline or linked, and wrapper names match by the `Detachment` prefix.
- Detachment names, points, faction overrides, force dispositions and enhancement names and points come from Game Datacards. A child faction inherits its declared parent's cards, its own cards take priority, and spacing, accents and any `(Aura)` or `(Upgrade)` suffix are ignored only inside that faction-scoped join. Missing or conflicting construction data remains blank; `just points` reports every rules-only name and every card without semantic data.
- `describedEnhancements` is the one place enhancement text is resolved, preferring the catalogue, then the faction-scoped Game Datacards card. The rules source only adds keyword restrictions and stratagem timing semantics to names Game Datacards already supplies.
- Game Datacards mission packs already supply mission twists and the fixed-secondary cap. Their `battleSizes` records do not replace `GAME_SIZES`: those values define the stable command and saved-roster protocol, King of the Colosseum is a product format absent from the packs, and catalogue constraints remain the legality authority for enhancement and datasheet-copy limits. The app does not read those limits from 40kdc.
- Unit upgrades marked by either the Game Datacards card or its rules-source overlay stay separate from character enhancements in detachment references and unit loadouts.
- A datasheet roster cap usually lives on its same-named category. `rosterLimit` reads that cap for display and filtering. `violations` remains the legality authority.
- The picker, roster and faction datasheet list shelf each datasheet by the first primary category that names a shelf. A datasheet can print more than one, and the first is not always the useful one: a Reaver Titan prints `Allies: Titanicus Traitoris` ahead of `Vehicle`. Unknown or missing primary categories stay under Other rather than being inferred from secondary keywords.
- The collection stores one membership row per player and datasheet. It does not store model quantities.
- Faction and detachment favourites are account-backed and preloaded during SSR only on the faction and roster surfaces that render them. Dialog-only favourites load when the dialog opens, while shelves and selectors still agree across devices on first render.

## Building units

- A `collective` count is the total for the unit. Constraints with `scope: parent` are per model and must scale with the number of carriers.
- An aggregated model's unmarked mandatory child is stored once as the model template. Its parent-scoped minimum is satisfied once per model even though the stored selection count is one; parent-scoped maximums still scale to allow choices across the squad.
- `collective.ts` alone says whether a stored count is the unit's total or one model's share. `expand`, `unitChoices`, `violations`, and `wargearOf` all read it and none re-derives it.
- `refit` fills required per-model upgrade groups after a model-count change. It uses the declared default, then the cheapest option. It does not fill optional groups or groups of models.
- Increasing one option in a full group reduces an available sibling. Decreasing an option lets `refit` return the freed count to the default.
- `spreads` survive pricing, saving, import, and export.
- A model-count override clears the other model slots first because the default selection already contains the minimum models.
- A squad-size constraint can live on the group or its occupants. `unitSize` applies the bound to their total.
- Default construction inspects required entries inside selection groups.
- A required group's count is distributed across its options within each option cap, preferring the declared default and then the cheapest option.
- Wargear counts multiply through ordinary selection ancestors. Collective counts already represent the unit total and do not multiply again.
- A unit's models come from the datasheet rather than only from its choices. A mandatory model is not reported as a choice; it is counted from the selection and has no editable rows. A squad's sergeant is usually represented this way.
- A model kind takes its name from its own entries before the catalogue profile. Eleventh-edition profiles often use the squad name, so the preferred name is the one shared by the loadouts, followed by the entry that plainly names the model.

## Pricing and legality

- `src/core/evaluate.ts` reports unsupported semantics in `unhandled`. An unreadable condition group fails closed.
- Selection groups are catalogue containers. `selectionsUnder` removes group layers when a condition counts selections. `inGroup` retains group membership for conditions that name the group.
- `EvaluateOptions.primaryCatalogueId` is present whenever costs or conditions can depend on the selected book.
- A roster contains forces, and forces contain selections. Force-scoped conditions must see that layer.
- Selection order is preserved because `before` and `after` conditions use it for escalating per-copy costs.
- `instanceOf` compares the current selection for `self` scope and searches the scoped contents for container scopes.
- Category links behave as keywords when conditions are matched.
- A keyword can be granted or withdrawn by a `category` modifier as well as linked. A Chaplain in Terminator Armour is Deathwing only in the Dark Angels book, and the enhancement gated on that keyword is invisible without it. `keywordIds` folds the whole tree once, honouring the modifier's `scope` and `affects`. A grant's own conditions are answered from the written links and never from another grant, so the answer cannot depend on the order the tree is walked in; a grant and a withdrawal of one keyword on one entry resolve in written order.
- `keywordsIn` alone says what keywords a datasheet carries. The printed line, roster legality, and picker visibility read it, so the picker never offers a datasheet the roster will refuse.
- A hidden category never reaches a keyword line, written or granted. The attachment markers, the weapon-matching markers, the Assigned Agents allowances and the paired Battleline categories a Chaos god's units are sorted into are all ordinary links on the datasheet, so the category decides and not the way the datasheet reached it. `Faction: Ynnari` is the keyword; the `Ynnari` beside it is a marker.
- `set-primary` and `unset-primary` are recognised and ignored. They name the force slot that holds a selection, which is not a question this app asks: most of them set an `Allies: <faction>` category that shelves nothing here, and the rest re-shelve a unit for one detachment. A shelf that moved with the roster would also break the one thing `groupOfEntry` exists to guarantee — that the picker and the roster sort a unit the same way. Because their meaning is known and irrelevant, they do not produce an incomplete-validation warning.
- A datasheet's canonical reference page is a separate question from the keywords it carries, and `isReferenceDatasheet` keeps reading the written faction links for it. A granted faction keyword is conditional on the book, so honouring it would give one datasheet several homes.
- `hiddenByRules` receives the current roster because visibility can depend on its detachment and force type.
- Prose-only army-rule exclusions become typed faction restrictions and retain any keyword that exempts a unit from a list. Roster legality and picker visibility consume the same restrictions through `restrictedBy`; `just points` fails when a named exclusion in the synced cards is missing.
- Conditional modifiers targeting the catalogue `error` field are legality errors. They carry cross-unit and loadout restrictions that cannot be represented as numeric constraints.
- Available choices come from the datasheet definition rather than only from the built selection, where optional groups are absent by default.
- A capped group shares its cap between occupants. In an uncapped group, each occupant uses its own maximum. Optional equipment does not compete without a group cap.
- A lone optional upgrade is written without a group to hold it. One attached directly to a unit or model appears as its own choice; one inside a group is already represented by its siblings. Its key names the entry rather than a group, so `withChoice` counts it instead of placing anything inside it.
- A datasheet's Warlord entry is a toggle, never a wargear choice. `isRosterToggle` is the one place that decides which is which.
- Warlord visibility follows the same conditions as loadout choices. Eligibility can depend on the detachment or primary catalogue, so a unit never receives the toggle when those conditions fail.
- Detachments are evaluated before units because enhancements and unit limits can depend on them.
- Profile modifiers run against the complete roster selection and support the catalogue's ordered text, numeric, rounding, cumulative, name, annotation, and visibility operations. The base value and every selected rule that changed it remain available for explanation in the interface.
- An attached unit is one unit however many picks hold it. Its modifiers are evaluated with the bodyguard, one Leader, and one Support unit together, allowing unit-wide enhancements to reach every model and multiple enhancements to stack. `attachedUnit` decides which picks form that unit.
- Named abilities granted by enhancements or attached units appear beside core abilities with a blue tag and their granting rule as the source. A structured rule link supplies the ability name and parameter where available. Only exact catalogue phrases identify a recipient or serve as a fallback; conditional or unfamiliar prose remains unguessed.
- An unconditional detachment rule that gives a weapon ability to models with named keywords adds that ability to their weapon profiles in blue. Explicit keyword exclusions are honoured, while conditional grants remain in the rule text rather than being shown as always active.
- A weapon keyword can resolve by name when the datasheet does not link its rule. For example, a detachment upgrade can append `[ASSAULT]` without a link, so `rulesNamed` looks up the name and drops any keyword the catalogues describe in conflicting ways.
- Eleventh-edition detachments are ordered purchases. A roster can use any force disposition offered by a purchased detachment and keeps the player's choice. All purchased detachments contribute their detachment-point cost and stratagems.
- King of the Colosseum bars a unit that reaches Toughness 10 during list building, from an enhancement or an attached leader. No synced source says what either does to a Toughness — enhancements arrive as an ability reference with no text, and leader attachments record eligibility only — so a unit already at the cap is reported as unverifiable rather than passed. Guessing it legal is the one answer nobody can correct at the table.
- King of the Colosseum layers its prototype construction rules over Incursion at its 600-point limit: exactly one detachment, at least two Infantry units, a Warlord, no Epic Heroes, at most one Toughness 9 unit and none tougher, and format-specific datasheet caps. These facts come from selected catalogue entries and profiles. Epic Heroes and units above Toughness 9 are absent from its picker, while Battleline and Dedicated Transport exceptions come from keywords rather than picker shelves.
- King of the Colosseum is offered at one 600-point size and is named without a size suffix. A size that stops being offered does not stop being played: `isKotcLimit` still recognises the retired 500-point limit, so a roster saved at it and a battle already running on it keep their construction rules, datasheet caps and tactical-only secondaries. Imports snap to the smallest offered size that fits, so a small list now lands on 600.
- Homebrew is picked, never assumed. `OPTIONAL_RULE_IDS` mirrors `FORMAT_RULE_IDS`: a format rule applies until a roster waives it, while an optional rule applies only after a roster selects it. `optionalRules` names what a size offers, a roster carries the selected ids, and `pickedOptionalRules` answers what the list plays beyond its format. The choices live in their own dialog so roster setup remains about the army. Every homebrew rule has an `optionalRules` entry, preventing it from applying without the group's agreement.
- King of the Colosseum offers one optional rule, a borrowed force disposition, paid for out of the detachment points the roster's own detachment leaves unspent, out of `BORROWED_DISPOSITION_BUDGET`. That budget is the optional rule's own homebrew and not the format's: King of the Colosseum sets no detachment point limit, and spends detachment points instead as the bid that decides who picks the twist, so the two meanings must not be conflated. It is off until the roster picks it, and dropping the rule drops the borrow with it so a list cannot keep playing a disposition it no longer pays for. The borrowed detachment is never added to the roster, so it contributes no rules, enhancements, stratagems or points — a force disposition only ever decides which primary mission the matchup plays. `borrowedDispositionError` is the one answer to whether a borrow is legal, and it fails closed: an unaffordable or unpriced borrow grants no disposition at all rather than costing nothing.
- A battle size's restrictions are overridable per roster. `formatRules` names every restriction, and a roster carries the ids it has waived. A waived restriction neither produces a pricing error nor filters the picker. Waivers are controlled from the picker menu and appear beside legality errors because they explain an expected error's absence; the warning is dismissible and returns when the waiver set changes. Every format restriction has a `formatRules` entry, keeping the picker and legality checks in agreement. A waived roster remains usable and carries its waivers into a battle snapshot. `waivedFormatRules` supplies the declarations shown in the library, builder, roster chooser, league sealing flow, and seated battle after confirmation.

## Points ratchet

`just points` builds units with the same `buildUnit` function as the app and compares them with the points reference. Definitions and points can publish at different times, so CI pins one verified snapshot and compares the pull request's match rate with its base revision. It also enforces a lower floor on the number of evaluated entries. The base run against that snapshot is the baseline; the head may improve it but may not lower it.

Legends reference entries are compared only with catalogue entries explicitly marked as Legends. Active and Legends datasheets with the same name are distinct entries. A lower match rate is a regression unless the generated check set changed and the new baseline is explained.

The MFM YAML does not expose the source IDs carried by 40kdc's `mfm` references, so the points ratchet reports its accepted unit-name joins as fallbacks. A 40kdc MFM reference becomes usable only when the paired points record exposes that identity.

Evaluator work begins with the generated selection because a mismatch can come from the evaluator, the catalogue, or the check harness.

`CATALOGUE_BASELINES=report` turns every pinned baseline from a failure into a reported shortfall, and only the snapshot publisher sets it. A baseline says "this got worse" next to something to compare against, and a pull request has that: one pinned snapshot measured against both revisions, so a number that moved is a number this repository moved. The publisher has no comparison, because fetching data nobody here controls is the whole job. There the same number moves when two sources disagree about a name, and refusing to publish holds every unrelated part of the refresh back until they agree again. So it records the shortfall in the run summary and publishes. `baselineShortfall` in `scripts/baselines.ts` is the one place that decides which of the two a run is doing.

That covers agreement between sources and nothing else. An unresolvable upstream, an incomplete snapshot, and an archive that does not verify after upload all still fail the publisher.

`just coverage out.json` (or `pnpm catalogue:coverage out.json`) writes everything the app can say about the synced data — every datasheet's profiles, abilities, model cards, wargear and choices, every detachment's rules, enhancements and stratagems — and `--compare before.json` lists what an earlier snapshot had that this one does not. Source-reading changes compare a `main` snapshot with the changed snapshot so a missing field appears by name. Both runs use the same `revision.json`, because `app()` otherwise refreshes the snapshot from the shared store at startup.

A change that withdraws a choice on purpose reads the same to this job as a field dropped by accident, so `catalogue/accepted-coverage-losses.json` states the withdrawn lines whole, each group with the reason it was withdrawn, and `--accept` takes them out of the count. A line listed there that has stopped being lost fails the run, so the file empties itself rather than growing quietly.

The `coverage` CI job runs this on every pull request. It syncs the catalogue once, snapshots the base and the head against that one `revision.json`, and fails when the head lost any of what the base could say. Construction-name comparisons first discard stale base names that the current Game Datacards snapshot does not enumerate; rules-source-only names are a reported source gap, not coverage the app preserves. A dropped field on an authoritative card still renders, so this gate is the only signal that catches it.

## 40kdc parity

The rules source carries units, points and compositions of its own, so `just parity` measures how much of what the catalogue lets a player choose 40kdc could also express, counted per option rather than per unit. At the released dataset it reaches most wargear options and almost no model variants, and it has no entity for a Mark of Chaos, so it cannot yet drive a loadout. The script prints the current figures and `--details` names the units furthest behind.

`just variants` is the other direction: where 40kdc generates `loadout_variants` from BSData, it checks every generated name against this app's own reading of the same catalogues, and rejects a variant whose equipment id belongs to another unit. Two extractions of one source only agree if both found the same thing, so this side scans the subtree exhaustively rather than walking the shape the generator walks. No released 40kdc carries those variants yet, so the check needs `KDC_CORE` pointed at a checkout that generates them and fails rather than passing on a snapshot that has none.

## Picker and attachments

- Picker rows are priced through `buildUnit` with the same inputs as the roster. The whole book is available; capping an alphabetically sorted result would otherwise hide datasheets that search can still find.
- Each complete faction summary is cached against its immutable catalogue snapshot. Reference-page search filters that summary instead of repricing every datasheet.
- Datasheet search covers visible names, keywords, abilities, weapons, weapon keywords, and wargear choices. Names rank ahead of metadata, metadata matches explain themselves, and full rules prose stays out of the index so common phrases do not overwhelm useful results.
- Datasheets from secondary imported books appear in source-labelled allied sections after the primary picker page, allowing each source to be included or hidden together.
- Character attachment targets come from ability text. `attachmentOf` supports bullet-list and inline formats, then adds any targets that a selected enhancement unlocks through the catalogue's structured association conditions.
- A missing attachment rule means the unit cannot attach.
- An ability titled `Leader` marks a leader. Other supported attachment abilities default to support.
- Unless a datasheet says otherwise, a bodyguard unit can have one Leader and one Support unit attached.

## Saved lists and interchange

- Application record IDs are compact URL-safe values minted by `randomId()` on the server. Clients provide an ID only when updating an existing record; share tokens use the longer `randomToken()` format.
- Saved lists store `RosterPick` values rather than expanded selections and rebuild them against the current catalogue for pricing.
- New saved lists are private. Making one unlisted lets anyone holding its opaque URL read it, and making one public also lists it on its owner's profile. Unlisted and public read alike, so what public adds is discovery rather than access. Switching a list back to private revokes both without changing the URL.
- Import provenance stays with the saved list so the library can distinguish an editable Praetorium roster, BattleBase and New Recruit text imports, and `.ros` or `.rosz` file imports.
- `built.units` freezes when a roster is attached, giving battle commands stable unit keys.
- Roster imports match entries by catalogue ID and resolve joined link paths from the final ID. Name matching is only a fallback.
- Unmatched import entries are reported rather than dropped.
- Roster XML uses `fast-xml-parser`, while `.rosz` archives use `fflate`.
- Export uses the current builder state and does not require a battle attachment.
