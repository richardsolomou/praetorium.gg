# Scripts

Maintenance, catalogue publishing, verification and deployment entry points an operator or CI job runs; shared helpers live in scripts/lib.

## entrances

- audit canonical catalogue: an operator reports missing records, field fallbacks, source conflicts and unknown UI semantics in the compiled catalogue
  handler: scripts/auditCanonicalCatalogue.ts
  trust: operator
- audit combat rules: the combat rule audit workflow inventories catalogue rules the combat simulator does not yet model
  handler: scripts/auditCombatRules.ts
  trust: operator
- benchmark roster loading: an operator times saved-roster loading against the active catalogue
  handler: scripts/benchmarkRosterLoading.ts
  trust: operator
- catalogue coverage: an operator writes down everything the app can say about the synced catalogue so two revisions can be compared
  handler: scripts/catalogueCoverage.ts
  trust: operator
- catalogue history: the publisher carries the data-update history into the catalogue snapshot about to be packed
  handler: scripts/catalogueHistory.ts
  trust: operator
- catalogue history seed: the seed workflow builds the history the publisher starts from out of verified archives
  handler: scripts/catalogueHistorySeed.ts
  trust: operator
- catalogue snapshot: an operator or the publisher packs, downloads, installs or locks a catalogue snapshot
  handler: scripts/catalogueSnapshot.ts
  trust: operator
- check combat rule questions: an operator checks the combat rule classifier against labelled ability descriptions
  handler: scripts/checkCombatRuleQuestions.ts
  trust: operator
- check descriptions: an operator lists enhancement, stratagem and ability descriptions the catalogue cannot join
  handler: scripts/checkDescriptions.ts
  trust: operator
- check import boundaries: pnpm check refuses imports that cross the architecture's dependency direction
  handler: scripts/checkImportBoundaries.ts
  trust: operator
- check joins: an operator lists datasheet names the catalogue and Game Datacards do not agree on
  handler: scripts/checkJoins.ts
  trust: operator
- check points: the points ratchet compares evaluator prices with the pinned MFM reference
  handler: scripts/checkPoints.ts
  trust: operator
- check restrictions: an operator lists named faction restrictions and error modifiers the Game Datacards and BSData sources leave uncaptured
  handler: scripts/checkRestrictions.ts
  trust: operator
- check terrain: an operator counts terrain layouts with pinned Battlemaster geometry and finds unbalanced objective markers
  handler: scripts/checkTerrain.ts
  trust: operator
- clear accepted coverage losses: the release versioning step clears the coverage losses accepted for the last release
  handler: scripts/clearAcceptedCoverageLosses.ts
  trust: operator
- compare catalogue coverage: CI compares catalogue coverage between two code revisions on one verified snapshot
  handler: scripts/compareCatalogueCoverage.ts
  trust: operator
- compare projected profiles: CI compares projected datasheet profiles between two code revisions
  handler: scripts/compareProjectedProfiles.ts
  trust: operator
- compile catalogue: an operator compiles the canonical catalogue from the materialized sources
  handler: scripts/compileCatalogue.ts
  trust: operator
- configure dokploy node: the deploy workflow configures the Dokploy web application and its environment
  handler: scripts/configureDokployNode.ts
  trust: operator
- dev: a contributor starts, inspects, restarts or stops the worktree's local stack
  handler: scripts/dev.ts
  trust: operator
- dokploy auth schedule: the deploy workflow installs the scheduled account database backup
  handler: scripts/dokployAuthSchedule.ts
  trust: operator
- dokploy preview: the preview workflow deploys or removes a pull request preview
  handler: scripts/dokployPreview.ts
  trust: operator
- e2e shard: CI splits the browser suite across runners by recorded duration
  handler: scripts/e2eShard.ts
  trust: operator
- evaluate reference: an operator scores reference search recall, citations, size and latency against a recorded baseline
  handler: scripts/evaluateReference.ts
  trust: operator
- local dev: browser tests and contributors start a disposable local stack
  handler: scripts/localDev.ts
  trust: operator
- materialize catalogue: an operator or the publisher fetches the pinned upstream revisions and applies every correction patch
  handler: scripts/materializeCatalogue.ts
  trust: upstream
- node auth backup: the scheduled task backs up the SQLite account database
  handler: scripts/nodeAuthBackup.ts
  trust: operator
- node server: the container starts the production web server
  handler: scripts/nodeServer.ts
  trust: operator
- parallel catalogue coverage: an operator splits catalogue coverage across processes by faction
  handler: scripts/parallelCatalogueCoverage.ts
  trust: operator
- project catalogue profiles: CI projects datasheet profiles for comparison
  handler: scripts/projectCatalogueProfiles.ts
  trust: operator
- seed preview: a preview deployment or contributor seeds demonstration accounts, rosters and battles
  handler: scripts/seedPreview.ts
  trust: operator
- shortlist combat rules: an operator asks a model to shortlist which inventoried rules affect combat, with a bounded request budget and a local cache
  handler: scripts/shortlistCombatRules.ts
  trust: operator
- submit index now: the deploy workflow submits changed sitemap URLs to IndexNow after health checks pass
  handler: scripts/submitIndexNow.ts
  trust: operator
- sync catalogue: an operator activates the pinned catalogue snapshot, checks source pins, or reports moved upstream revisions
  handler: scripts/syncCatalogue.ts
  trust: upstream
- verify reference deployment: an operator checks that a deployed origin's reference API and MCP endpoint answer as expected
  handler: scripts/verifyReferenceDeployment.ts
  trust: operator

## invariants

- verified snapshot install: A catalogue snapshot is installed only when every file matches its manifest checksum.
  over: the files of an installed snapshot against its manifest's hashes
  via: rejects a changed file in an installed snapshot
  because: rosters are priced and battles frozen against the installed catalogue; a changed file would change prices and legality without any reviewed revision
  crossing: upstream -> verified catalogue
  refuted: verifyInstalledSnapshot skipped the per-file sha256 comparison -> rejects a changed file in an installed snapshot failed (2026-10-06)
  kinds: storage, revision
  checklist: scoped-reads dismissed: an install reads one archive, not a shared population
  checklist: encrypted-storage dismissed: catalogue data is public and stored in the clear
  checklist: key-rotation-compatibility dismissed: nothing is encrypted
  checklist: input-validation declared as verified snapshot install
  checklist: revision-preservation dismissed: snapshots are immutable by name; this bullet checks content against the manifest
  checklist: commit-ordered-effects dismissed: activation replaces a symlink only after the checks pass, which is this bullet's subject
  checklist: durable-dispatch-intent dismissed: there is no dispatch
  checklist: declared-target-coverage dismissed: there is no fan-out
  checklist: completion-evidence dismissed: install is synchronous and reports its own outcome
