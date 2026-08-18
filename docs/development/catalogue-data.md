# Catalogue data

Praetorium builds and validates rosters from fetched community data. The domain code stays in `src/core`; loading and search stay in `src/server`.

## Sources and loading

- `catalogue/sources.json` defines each upstream source. Revisions and file hashes live in immutable snapshot manifests outside Git.
- The Game Datacards source extracts only `11th/gdc`; data for other games and editions is excluded from snapshots.
- `catalogue-data/` contains fetched data and is gitignored. Do not commit game data or copied rules text.
- An hourly automation checks upstream revisions and publishes a complete immutable snapshot. It replaces the remote `current.json` pointer only after reading and verifying the published archive.
- Running instances check that pointer hourly, download a changed snapshot from the shared store, and swap it into place atomically. They never contact an upstream data provider.
- `src/server/sync.ts` fetches upstream data only for the snapshot publisher. `src/server/catalogueSnapshot.ts` owns packing, verification, and instance downloads.
- Repository sources extract only their configured subpath. Archive size, output size, paths, and non-empty contents are checked before replacement.
- Each download uses a staging directory. It replaces the current source only after the download finishes and its revision or hashes match.
- Optional description exports still refresh when the authoritative sources are current. Live faction pages are best-effort additions and do not make the verified exports unavailable.
- Battlemaster supplies the exact terrain footprints, labels, and setup measurements. A layout without its pinned geometry remains visible as unavailable, cannot be selected, and cannot start a battle.
- `just catalogue-sync` calls the same sync code as the server.
- The server loads the catalogue on first use. An instance without catalogue data can still serve battles and pasted rosters.

Server catalogue code is split by responsibility:

- `catalogueIndex.ts` loads files and indexes books, detachments, and datasheet membership.
- `catalogue.ts` projects a datasheet for display and applies contextual profile modifiers.
- `cataloguePicker.ts` searches, groups, prices, and limits picker results.
- `catalogueDescriptions.ts` resolves detachment and enhancement text without guessing between conflicting matches.
- `sync.ts` owns downloads and atomic replacement. It does not interpret game data.

## Books and datasheets

- A book offers the datasheets linked from its root. Do not identify datasheets by entry type or file depth.
- Follow `catalogueLinks` only when `importRootEntries` is true. Imported rosters are one level deep.
- Exclude entries marked `library: true` from the faction list.
- `catalogueOf` identifies the file that defines an entry. `index.datasheets.get(catalogueId)` identifies the books that offer it.
- `isDatasheetId` can fall back to any synced book when an imported roster names an unavailable catalogue.
- A book's own detachments take priority. A book without detachments uses the detachments from the book that contributes most of its roster.
- Legends datasheets are not legal roster choices and are never returned by the picker.
- A detachment has a wrapper, a group, and its choices. Any layer can be inline or linked. Match wrapper names by the `Detachment` prefix.
- Enhancement names and points come from the rules source. Description text prefers the catalogue, then the pinned Wahapedia export; leave conflicting matches blank.
- Unit upgrades marked by the rules source stay separate from character enhancements in detachment references and unit loadouts.
- A datasheet roster cap usually lives on its same-named category. `rosterLimit` reads that cap for display and filtering. `violations` remains the legality authority.
- The collection stores one membership row per player and datasheet. It does not store model quantities.

## Building units

- A `collective` count is the total for the unit. Constraints with `scope: parent` are per model and must scale with the number of carriers.
- `expand`, `unitChoices`, `violations`, and `wargearOf` must use the same collective-count rules.
- `refit` fills required per-model upgrade groups after a model-count change. It uses the declared default, then the cheapest option. It does not fill optional groups or groups of models.
- Increasing one option in a full group reduces an available sibling. Decreasing an option lets `refit` return the freed count to the default.
- Preserve `spreads` through pricing, saving, import, and export.
- Clear other model slots before applying a model-count override. The default selection already contains the minimum models.
- A squad-size constraint can live on the group or its occupants. `unitSize` applies the bound to their total.
- Inspect required entries inside selection groups when building defaults.
- Fill a required group's count across its options. Respect each option cap and prefer the declared default, then the cheapest option.
- Wargear counts multiply through ordinary selection ancestors. Collective counts already represent the unit total and do not multiply again.

## Pricing and legality

- `src/core/evaluate.ts` reports unsupported semantics in `unhandled`. An unreadable condition group fails closed.
- Selection groups are catalogue containers. `selectionsUnder` removes group layers when a condition counts selections. `inGroup` retains group membership for conditions that name the group.
- Pass `EvaluateOptions.primaryCatalogueId` when costs or conditions can depend on the selected book.
- A roster contains forces, and forces contain selections. Force-scoped conditions must see that layer.
- Preserve selection order. `before` and `after` conditions use it for escalating per-copy costs.
- `instanceOf` compares the current selection for `self` scope and searches the scoped contents for container scopes.
- Treat category links as keywords when matching conditions.
- Call `hiddenByRules` with the current roster. Visibility can depend on its detachment and force type.
- Read available choices from the datasheet definition, not only from the built selection. Optional groups are absent from the default selection.
- Add detachments before units during evaluation. Enhancements and unit limits can depend on them.
- Apply profile modifiers against the complete roster selection. Support the catalogue's ordered text, numeric, rounding, cumulative, name, annotation, and visibility operations. Keep the base value and each selected rule that changed it so the interface can explain every derived value.
- Eleventh-edition detachments are ordered purchases. A roster can use any force disposition offered by a purchased detachment and keeps the player's choice. All purchased detachments contribute their detachment-point cost and stratagems.
- King of the Colosseum layers its prototype construction rules over Incursion: 600 points, exactly one detachment, at least two Infantry units, a Warlord, no Epic Heroes, at most one Toughness 9 unit and none tougher, and format-specific datasheet caps. Derive these facts from the selected catalogue entries and profiles.

## Points ratchet

`just points` builds units with the same `buildUnit` function as the app and compares them with the points reference. It currently matches 100% of 1,862 checks.

Legends reference entries are compared only with catalogue entries explicitly marked as Legends. A current datasheet with the same name is not evidence for an older Legends price. A lower match rate is a regression unless the generated check set changed and the new baseline is explained.

Inspect the generated selection before changing evaluator logic. A mismatch can come from the evaluator, the catalogue, or the check harness.

## Picker and attachments

- Price picker rows with `buildUnit`, using the same inputs as the roster. Price only the displayed page.
- Keep datasheets from secondary imported books in source-labelled allied sections after the primary picker page so players can include or hide them together.
- Character attachment targets come from ability text. `attachmentOf` supports bullet-list and inline formats.
- A missing attachment rule means the unit cannot attach.
- An ability titled `Leader` marks a leader. Other supported attachment abilities default to support.

## Saved lists and interchange

- Save `RosterPick` values instead of expanded selections. Rebuild them against the current catalogue when pricing a saved list.
- New saved lists are private. Making one unlisted lets anyone holding its opaque URL read it; switching it back to private invalidates that public access without changing the URL. Existing lists remain unlisted across the access-control migration so previously shared links keep working.
- Keep import provenance with the saved list so the library can distinguish an editable Praetorium roster, a BattleBase text import, and a `.ros` or `.rosz` file import.
- Freeze `built.units` when a roster is attached. Battle commands refer to those stable unit keys.
- Import roster entries by catalogue ID. Resolve joined link paths from their final ID. Use a name match only as a fallback.
- Report entries that cannot be imported instead of dropping them.
- Use `fast-xml-parser` for roster XML and `fflate` for `.rosz` archives.
- Export the current builder state. A battle attachment is not required.
