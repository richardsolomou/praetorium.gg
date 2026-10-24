# Catalogue data: Sources and runtime

## Offline download

The offline download is three hashed assets the manifest names: the reference (pages and search), construction data for the current rules, and construction data for every rules version. A device fetches the reference first and the complete construction data only while its account data or guest draft names a roster on another version (`rulesVersionsInUse.ts`); it refetches only assets whose address changed. Construction data includes each rules version's playable catalogues and their complete transitive imports, sharing identical data with the base source. Repeated text tokens share storage while keeping their exact upstream file identities. Retain version 1 and 2 download support. Do not raise the bundle size limit to fit unrelated armies. Verify a production build with the release snapshot, including versioned roster editing after a cold offline reload.

## Sources and loading

| Authority                                         | Location                                   |
| ------------------------------------------------- | ------------------------------------------ |
| Upstream revisions, licences, and attribution     | `catalogue/sources.json`                   |
| Pinned file composition and rules versions        | `catalogue/composition.json`               |
| Reproducible archive baseline                     | `catalogue.json`                           |
| Withdrawn snapshots/sources                       | `catalogue/revocations.json`               |
| Saved IDs from retired sources                    | `catalogue/retired-ids.json`               |
| Reviewed saved-loadout migrations                 | `catalogue/roster-migrations.json`         |
| Authored corrections with provenance              | `catalogue/patches/`, source fork branches |
| Immutable manifest, hashes, and canonical records | Verified snapshot                          |

Never commit fetched upstream files, copied rules prose, generated catalogues, or snapshots. A correction adding rules text beyond a single quoted sentence is a commit on a fork branch of its source, pinned in `catalogue/composition.json`; other corrections stay minimal and source-pinned in `catalogue/patches/`. Unsupported or conflicting semantics remain reported, not guessed. Compatibility declarations are bundled into builds, never fetched at runtime.

`canonicalDetachmentName` in `src/core/detachmentName.ts` owns verified cross-source name aliases; use it only for identity joins and text imports, retaining source labels, public slugs and the source label's construction warning. Verify the reported combination and attachments with [`rosterText.salamanders.fixture.ts`](../../../src/core/rosterText.salamanders.fixture.ts). `scripts/detachmentNames.integration.test.ts` checks coverage, construction, reference ownership and the supplied cards against the installed snapshot.

`pnpm catalogue:snapshot lock <snapshot-id>` adopts a verified release into `catalogue.json`. Publishing or activating a snapshot never changes an existing image. Keep candidate snapshots under ignored `data-dev/`, not `.output/`, which the production build clears.

`src/server/sync.ts` owns bounded downloads and extraction, `catalogueSnapshot.ts` packing/verification, and `scripts/lib/catalogueMaterialize.ts` source assembly. Replace output only after every source, correction, revision, hash and required-content check succeeds; never replace an activated shared-cache symlink. Retry transport failures, not checksum or schema failures.

New lite files require a new pinned snapshot; older snapshots keep deployment-objective fallback.

### Published rules text

Praetorium serves no Game Datacards rules text: not in pages, server reads, the API, MCP, search, the compiled runtime, or the offline download. Its parsers read each string through a `SourceTexts` function (`src/shared/sourceText.ts`); in production it is `publishedTexts` (`src/server/sourceTexts.ts`), which publishes a token naming the snapshot file, the display transform, and the SHA-256 of the exact source string. `textSources` lists each file's pinned upstream URL; a reader who opts in on a device loads those files from GitHub and `src/client/sourceText.ts` swaps each token for the string whose hash matches. `RuleText` and `RuleMarkup` resolve tokens; anything else that shows or reads rules text must resolve it through `loadedText` or `loadedWords`, never display a token or a cut-off one.

Rules must not read a published text, on the server or a device, because neither holds its words. Read facts from the raw entry during the parse: enhancement eligibility, stratagem timing and limits, army-rule restrictions (`restrictionsIn`), and transport capacity (`printedTransport`) do. Facts read from texts other rules consult later — detachment weapon grants, strategic reserve exemptions, and referenced rule names — are recorded per token as it is made (`textFactsOf`) and travel in `LoadedDatacards.textFacts`; add a new one there and read it through `src/shared/textFacts.ts`. Compare texts with `comparableText`.

BSData text stays in the data rules compute from, on the server and in the offline download, because Leader attachments, ability grants, and combat rules read it. Reference pages and search carry BSData descriptions as tokens too (`withDefinitionTokens`, from `LoadedCatalogue.definitionTexts`; `publishedFaction` and `publishedDetachmentReference` in `src/server/referenceCatalogue.ts`); the API, agent tools and corpus replace tokens with pointers ([Agent reference](../agent-reference.md#reference-corpus)). Pass `authored` to `RuleText` and `RuleMarkup` for words the app writes itself. Construction reads, the offline construction data, and the search index the device matches against keep BSData's words, because the device computes from them. `scripts/clientText.integration.test.ts` walks these payloads over the installed snapshot and fails on any Game Datacards sentence anywhere, or any BSData sentence in a reference payload.

A device chooses each text source on its own; `textSourcePaths` in `src/server/sourceTexts.ts` assigns each file its source, and `loadedText` in `src/client/sourceText.ts` is the one place that decides whether a token's source is chosen; untokenized catalogue words count as BSData. The choice lives in this device's storage (`src/client/rulesText.ts`), so it behaves the same signed in or out and Praetorium keeps no record of it. Nothing loads from one click: every gap's `SourceTextPrompt` opens the one `TextSourcesDialog`, which starts with only the sources already on. `/sources` lists the same sources with a switch each and credits every source, so other pages name no source and carry no attribution lines.

### Runtime updates

Production images contain application code and source configuration, without fetched catalogue data. `scripts/nodeServer.ts` prepares a persistent cache before starting the application and runs `scripts/catalogueRefresh.ts` in a separate process at startup and hourly. Worker stdout and stderr must be visible while preparation runs. A new MFM version requires the edition transition below, including on a cold start.

The worker stages sources, checks rules-version continuity, records measured changes, and prepares matching server projections and browser downloads before atomically replacing `current.json`. A failed update keeps the last complete revision active. Workers on the supported shared volume coordinate through one SQLite transaction across compiler revisions, except on previews, which [share a volume](../../deployment.md#pull-request-previews) and coordinate per compiler; compiler and authoring configuration hashes scope their caches so different application revisions cannot exchange incompatible prepared data. The seed build records the compiler key (`scripts/lib/compilerSources.ts`) in `catalogue-compiler.json` and the worker receives it from there, because images do not bundle at runtime. A new compiler reuses the latest working sources when their authoring configuration matches, preferring the revision production last published, which is the one a release prepares, and rebuilds their projections unless the release already shared them. Without compatible retained sources, cold startup prepares the configured published baseline before checking branches in the background, so an invalid upstream update cannot block startup. It needs network access; subsequent startups serve the retained data while checking upstream.

The active catalogue lives under `DATA_DIR/catalogues/<compiler-key>/`. Keep three complete data revisions and up to 128 immutable browser assets per compiler. Running replicas hold cache leases; cleanup retains their caches and two inactive compiler caches for rollback. `offline-reference-version.json` is uncached and names `/catalogue-assets/<compiler-key>/` downloads; server reads and those downloads switch together. Devices recheck the manifest through the existing offline refresh flow. Historical snapshot-only editions are reused locally or read from the private archive; public contribution builds omit only those unavailable archives. Never replace a retained edition with current rules to make an update pass.

### Compiled runtime

Reproducible archive builds install runtime JSON from the local cache, the shared store on the catalogue mirror, or a compile from the snapshot. The key (`scripts/catalogueRuntimeKey.ts`) combines the snapshot's fingerprint with the compiler key, so bump the runtime format version only when the manifest or file layout changes. When canonical records change, bump `CANONICAL_CATALOGUE_COMPILER_VERSION` too, so packaged base and edition projections cannot bypass the corrected compiler. Keep previously supported artifacts readable for audits while recompiling them for serving. Compiler fixes reach reference pages on deployment without editing the immutable snapshot. The offline reference bundle (`scripts/lib/offlineReferenceCache.ts`) shares that store.

Rules-version contexts and faction pickers are built as steps (`construction()` in `src/server/catalogueEditions.ts`, generators in `src/shared/steps.ts`) that `warm` in `src/server/app.ts` runs in short slices between requests; never leave them to the first request. Production startup readiness waits for them; a live swap does not (`warm`). Startup compiles canonical records only for each edition's advertised factions; support books compile on demand through `canonicalCatalogueSteps` (`completeStepsCooperatively`), in time slices rather than one datasheet per turn. Never compile unrelated archived armies before health succeeds. Keep each step to a file, a faction or a datasheet. Development warms from the first request; hot reload does not re-warm.

Public datasheet reads use the prepared canonical catalogue before loading construction data. Cold faction reference lists advance the shared unit-summary preparation in short time slices between other requests (`referenceFactionDatasheets`), preserving the same pricing and filtering as synchronous picker reads while allowing concurrent requests to run.

Keep construction contexts for the process lifetime; eviction rebuilds indexes on a request. Do not scope server construction files to catalogue imports: sources omit imports for shared-ID overrides, and name-based keyword and attachment lookups need books beyond that graph. After changing construction preparation, compare production roster prices, availability and legality and complete reference projections.

Every configured rules version stays resident on every replica. `src/server/sharedJson.ts` shares strings and byte-identical parses across versions, so parsed sources, edition reference indexes and Battlemaster geometry are read-only: copy before adjusting. Benchmark in fresh processes on the same snapshot before claiming a memory or latency change, and verify container behavior after deployment. Run each with `source` and `runtime`, optionally followed by snapshot and runtime-output paths; the memory benchmark also takes `--verify` to compare complete projection hashes:

```sh
node --expose-gc --import tsx scripts/benchmarkCatalogueMemory.ts source
node --expose-gc --import tsx scripts/benchmarkCatalogueLookups.ts source
```

### Publishing snapshots

A pull request changing `catalogue/` runs `.github/workflows/catalogue.yml`, which audits, packs, publishes an inactive candidate, and commits the `catalogue.json` pointer to the branch. Release verification and cold startup use that snapshot as their baseline; the runtime updater can then advance its current sources. Dispatch it with `force` to republish after a compiler change.

`scripts/publishCatalogue.py` publishes snapshots to the private `praetorium-private` bucket under `catalogue/`. A snapshot carries its source files, rules text included, so nothing publishes one where anyone can read it. Readers sign requests with `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` (`src/server/catalogueStore.ts`). Images need no private credentials; production uses its existing private store access to restore snapshot-backed historical editions on a cold cache. Local and preview stacks omit unavailable private editions and keep test uploads in their local object store. Published archives remain available for reproducible checks. Runtime updates fetch the configured GitHub branches directly; deployment does not activate the archival pointer.

To withdraw a snapshot or source, edit `catalogue/revocations.json` and redeploy; existing images carry their pinned policy. Do not delete shared objects blindly: several retained snapshots can share one.
