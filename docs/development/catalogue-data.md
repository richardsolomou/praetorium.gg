# Catalogue data

Praetorium builds and validates rosters from community data. Domain code stays in `src/core`. Loading and search stay in `src/server`.

## Sources and loading

- `catalogue/sources.json` defines each upstream source. Revisions and file hashes live in immutable snapshot manifests outside Git.
- The Game Datacards source extracts only `11th/gdc`; data for other games and editions is excluded from snapshots.
- Mission cards are read from both sources: the rules source says when a payout is due and how a card's payouts relate, and the Game Datacards mission pack says what each one asks for.
- `catalogue-data/` contains fetched data and is gitignored. Do not commit game data or copied rules text.
- An hourly automation checks upstream revisions and publishes a complete immutable snapshot. It replaces the remote `current.json` pointer only after reading and verifying the published archive.
- Running instances check that pointer hourly, download a changed snapshot from the shared store, and swap it into place atomically. They never contact an upstream data provider.
- Community-data requests have a per-attempt timeout and retry only transient network failures, timeouts, rate limits, and server errors. Checksums and invalid data fail immediately.
- `src/server/sync.ts` fetches upstream data only for the snapshot publisher. `src/server/catalogueSnapshot.ts` owns packing, verification, and instance downloads.
- Repository sources extract only their configured path. The sync checks archive size, output size, paths, and required contents before replacement.
- Each download uses a staging directory. It replaces the current source only after the download finishes and its revision or hashes match.
- Optional description exports still refresh when the authoritative sources are current. Live faction pages are best-effort additions and do not make the verified exports unavailable.
- Battlemaster supplies the exact terrain footprints, labels, and setup measurements. A layout without its pinned geometry remains visible as unavailable, cannot be selected, and cannot start a battle.
- `just catalogue-sync` calls the same sync code as the server.
- The server loads the catalogue on first use. An instance without catalogue data can still serve battles and pasted rosters.

Server catalogue code is split by responsibility:

- `catalogueIndex.ts` loads files and indexes books, detachments, and datasheet membership.
- `catalogue.ts` projects a datasheet for display and applies contextual profile modifiers.
- `cataloguePicker.ts` groups, prices, and limits picker results. `datasheetSearch.ts` matches the same structured datasheet fields for the picker and global search.
- `catalogueDescriptions.ts` resolves detachment and enhancement text without guessing between conflicting matches.
- `sync.ts` owns downloads and atomic replacement. It does not interpret game data.

The rules dataset is split the same way. `rules.ts` only assembles `LoadedRules`; `rulesSource.ts` reads the files and keys what it finds, and `rulesCards.ts`, `rulesDatasheets.ts`, `rulesFactions.ts` and `rulesTerrain.ts` each own one part of it. An absent source leaves its part empty rather than guessed.

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

- A book offers the datasheets linked from its root. Do not identify datasheets by entry type or file depth.
- Follow `catalogueLinks` only when `importRootEntries` is true. Imported rosters are one level deep.
- Exclude entries marked `library: true` from the faction list.
- `catalogueOf` identifies the file that defines an entry. `index.datasheets.get(catalogueId)` identifies the books that offer it.
- `isDatasheetId` can fall back to any synced book when an imported roster names an unavailable catalogue.
- A book's own detachments take priority. A book without detachments uses the detachments from the book that contributes most of its roster.
- Key the rules dataset by its faction directory and by every alias that directory declares. The catalogues call the Adeptus Astartes book Space Marines, and a lookup by the name a player sees must still find its detachment points and stratagems.
- Read every structured army rule from Game Datacards. Use the rules dataset only when that faction has no Game Datacards rule.
- Show only detachments named by Game Datacards or the rules dataset. A catalogue import does not make another faction's detachments its own, and a detachment without reference detail must not link to a missing page.
- A detachment's stratagems are the union of the ids it names and the records filed under it. The dataset writes a shared stratagem down once and the other detachments reach it by id only; a card reached both ways is kept once, as the copy filed under this detachment.
- Legends datasheets are not legal roster choices and are never returned by the picker.
- A detachment has a wrapper, a group, and its choices. Any layer can be inline or linked. Match wrapper names by the `Detachment` prefix.
- Enhancement names and points come from the rules source. Description text prefers the catalogue, then the pinned Wahapedia export; leave conflicting matches blank.
- Unit upgrades marked by the rules source stay separate from character enhancements in detachment references and unit loadouts.
- A datasheet roster cap usually lives on its same-named category. `rosterLimit` reads that cap for display and filtering. `violations` remains the legality authority.
- The picker, roster and faction datasheet list shelf each datasheet by its primary category. A datasheet can print more than one, and the first is not always the one a player sorts by: a Reaver Titan prints `Allies: Titanicus Traitoris` ahead of `Vehicle`. Take the first primary category that names a shelf. Unknown or missing primary categories stay under Other rather than being inferred from secondary keywords.
- The collection stores one membership row per player and datasheet. It does not store model quantities.
- Faction favourites are account-backed and preloaded during SSR so faction shelves and selectors agree across devices on first render.

## Building units

- A `collective` count is the total for the unit. Constraints with `scope: parent` are per model and must scale with the number of carriers.
- An aggregated model's unmarked mandatory child is stored once as the model template. Its parent-scoped minimum is satisfied once per model even though the stored selection count is one; parent-scoped maximums still scale to allow choices across the squad.
- `expand`, `unitChoices`, `violations`, and `wargearOf` must use the same collective-count rules.
- `refit` fills required per-model upgrade groups after a model-count change. It uses the declared default, then the cheapest option. It does not fill optional groups or groups of models.
- Increasing one option in a full group reduces an available sibling. Decreasing an option lets `refit` return the freed count to the default.
- Preserve `spreads` through pricing, saving, import, and export.
- Clear other model slots before applying a model-count override. The default selection already contains the minimum models.
- A squad-size constraint can live on the group or its occupants. `unitSize` applies the bound to their total.
- Inspect required entries inside selection groups when building defaults.
- Fill a required group's count across its options. Respect each option cap and prefer the declared default, then the cheapest option.
- Wargear counts multiply through ordinary selection ancestors. Collective counts already represent the unit total and do not multiply again.
- Read a unit's models from the datasheet, not only from its choices. A model the data insists on is no choice, so nothing that reads choices reports one, and a squad's sergeant is nearly always among them. Count such a model from the selection and give it no rows: nothing about it is the player's to change.
- Name a kind of model by its own entries before the catalogue's profile. An eleventh-edition datasheet names the profile after the squad, so a card drawn from it reads as the whole unit. Prefer the name the loadouts agree on, then the entry that names the model plainly beside them.

## Pricing and legality

- `src/core/evaluate.ts` reports unsupported semantics in `unhandled`. An unreadable condition group fails closed.
- Selection groups are catalogue containers. `selectionsUnder` removes group layers when a condition counts selections. `inGroup` retains group membership for conditions that name the group.
- Pass `EvaluateOptions.primaryCatalogueId` when costs or conditions can depend on the selected book.
- A roster contains forces, and forces contain selections. Force-scoped conditions must see that layer.
- Preserve selection order. `before` and `after` conditions use it for escalating per-copy costs.
- `instanceOf` compares the current selection for `self` scope and searches the scoped contents for container scopes.
- Treat category links as keywords when matching conditions.
- A keyword can be granted or withdrawn by a `category` modifier as well as linked. A Chaplain in Terminator Armour is Deathwing only in the Dark Angels book, and the enhancement gated on that keyword is invisible without it. `keywordIds` folds the whole tree once, honouring the modifier's `scope` and `affects`. A grant's own conditions are answered from the written links and never from another grant, so the answer cannot depend on the order the tree is walked in; a grant and a withdrawal of one keyword on one entry resolve in written order.
- `keywordsIn` alone says what keywords a datasheet carries. The printed line, roster legality, and picker visibility read it, so the picker never offers a datasheet the roster will refuse.
- A hidden category never reaches a keyword line, written or granted. The attachment markers, the weapon-matching markers, the Assigned Agents allowances and the paired Battleline categories a Chaos god's units are sorted into are all ordinary links on the datasheet, so the category decides and not the way the datasheet reached it. `Faction: Ynnari` is the keyword; the `Ynnari` beside it is a marker.
- `set-primary` and `unset-primary` are recognised and ignored. They name the force slot that holds a selection, which is not a question this app asks: most of them set an `Allies: <faction>` category that shelves nothing here, and the rest re-shelve a unit for one detachment. A shelf that moved with the roster would also break the one thing `groupOfEntry` exists to guarantee — that the picker and the roster sort a unit the same way. Because their meaning is known and irrelevant, they do not produce an incomplete-validation warning.
- A datasheet's canonical reference page is a separate question from the keywords it carries, and `isReferenceDatasheet` keeps reading the written faction links for it. A granted faction keyword is conditional on the book, so honouring it would give one datasheet several homes.
- Call `hiddenByRules` with the current roster. Visibility can depend on its detachment and force type.
- Parse prose-only army exclusions into typed faction restrictions. Roster legality and picker visibility consume the same restrictions; `just points` fails when a named exclusion in the synced rules was not captured.
- Treat conditional modifiers targeting the catalogue `error` field as legality errors. These carry cross-unit and loadout restrictions that cannot be represented as numeric constraints.
- Read available choices from the datasheet definition, not only from the built selection. Optional groups are absent from the default selection.
- A capped group shares its cap between occupants. In an uncapped group, each occupant uses its own maximum. Optional equipment does not compete without a group cap.
- A lone optional upgrade is written without a group to hold it. Report one hung directly on a unit or a model as its own choice, and not when it sits inside a group, where its siblings already report it. Its key names the entry rather than a group, so `withChoice` counts it instead of placing anything inside it.
- A datasheet's Warlord entry is a toggle, never a wargear choice. `isRosterToggle` is the one place that decides which is which.
- Read the Warlord entry through the same visibility as the loadout choices. Who may be nominated is conditional in the data — on a detachment for a tank, on the primary catalogue for a borrowed datasheet — and walking past those conditions offers the crown to units that may not hold it.
- Add detachments before units during evaluation. Enhancements and unit limits can depend on them.
- Apply profile modifiers against the complete roster selection. Support the catalogue's ordered text, numeric, rounding, cumulative, name, annotation, and visibility operations. Keep the base value and each selected rule that changed it so the interface can explain every derived value.
- An attached unit is one unit however many picks hold it. Read a unit's modifiers with the whole of it present — the bodyguard unit, its Leader and every supporting character attached to it — so an enhancement written against models in the bearer's unit reaches all of them, and two such enhancements in one unit stack. `attachedUnit` decides which picks are the same unit.
- Show named abilities granted by enhancements or attached units alongside the unit's core abilities, using a blue tag and preserving the granting rule as their source. Take the ability name and parameter from a structured rule link when one exists; recognize only exact catalogue phrases for its recipient or as a fallback when no link exists. Conditional or unfamiliar prose stays as prose rather than being guessed.
- Resolve a weapon keyword by name when nothing on the datasheet links its rule. A detachment upgrade appends `[ASSAULT]` to the characteristic without linking anything, so `rulesNamed` looks the name up and drops any the catalogues describe two ways.
- Eleventh-edition detachments are ordered purchases. A roster can use any force disposition offered by a purchased detachment and keeps the player's choice. All purchased detachments contribute their detachment-point cost and stratagems.
- King of the Colosseum layers its prototype construction rules over Incursion at the selected 500- or 600-point limit: exactly one detachment, at least two Infantry units, a Warlord, no Epic Heroes, at most one Toughness 9 unit and none tougher, and format-specific datasheet caps. Derive these facts from the selected catalogue entries and profiles. Keep Epic Heroes and units above Toughness 9 out of its picker, and derive its Battleline and Dedicated Transport exceptions from keywords rather than picker shelves.

## Points ratchet

`just points` builds units with the same `buildUnit` function as the app and compares them with the points reference. It currently matches 100% of 1,861 checks; it prints the current count, and CI enforces only a lower floor, so treat its output as the real baseline.

Legends reference entries are compared only with catalogue entries explicitly marked as Legends. Active and Legends datasheets with the same name are distinct entries. A lower match rate is a regression unless the generated check set changed and the new baseline is explained.

Inspect the generated selection before changing evaluator logic. A mismatch can come from the evaluator, the catalogue, or the check harness.

## Picker and attachments

- Price picker rows with `buildUnit`, using the same inputs as the roster. Offer the whole book: results are sorted by name, so a cap ends the list mid-alphabet and hides datasheets a search still finds.
- Cache each complete faction summary against its immutable catalogue snapshot. Filter that summary for reference-page searches instead of repricing every datasheet.
- Search datasheets by their visible name, keywords, ability names, weapons, weapon keywords and wargear choices. Rank names ahead of metadata, explain metadata matches, and keep full rules prose out of the index so common phrases do not overwhelm useful results.
- Keep datasheets from secondary imported books in source-labelled allied sections after the primary picker page so players can include or hide them together.
- Character attachment targets come from ability text. `attachmentOf` supports bullet-list and inline formats.
- A missing attachment rule means the unit cannot attach.
- An ability titled `Leader` marks a leader. Other supported attachment abilities default to support.

## Saved lists and interchange

- Application record IDs are compact URL-safe values minted by `randomId()` on the server. Clients provide an ID only when updating an existing record; share tokens use the longer `randomToken()` format.
- Save `RosterPick` values instead of expanded selections. Rebuild them against the current catalogue when pricing a saved list.
- New saved lists are private. Making one unlisted lets anyone holding its opaque URL read it. Switching it back to private invalidates that public access without changing the URL.
- Keep import provenance with the saved list so the library can distinguish an editable Praetorium roster, BattleBase and New Recruit text imports, and a `.ros` or `.rosz` file import.
- Freeze `built.units` when a roster is attached. Battle commands refer to those stable unit keys.
- Import roster entries by catalogue ID. Resolve joined link paths from their final ID. Use a name match only as a fallback.
- Report entries that cannot be imported instead of dropping them.
- Use `fast-xml-parser` for roster XML and `fflate` for `.rosz` archives.
- Export the current builder state. A battle attachment is not required.
