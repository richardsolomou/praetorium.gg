# Running locally

[Contributing](../../CONTRIBUTING.md) owns installation and checks. `just` lists recipes; `scripts/dev.ts` and `scripts/localDev.ts` own stack configuration.

## Catalogue

Contributors do not need private credentials. Before starting a preview, `just dev` runs `just catalogue-prepare`'s preparation when the catalogue directory is missing; it preserves an existing catalogue, including materialized source edits. Preparation reuses the release-pinned verified snapshot from the shared platform cache when available. Without a cached snapshot or private store credentials, it automatically builds from the pinned public sources, keeping their rules editions and omitting only historical editions stored exclusively as private snapshots. It prints that limitation without asking for credentials or a rules-version choice. The local server uses the prepared catalogue without background snapshot downloads.

`just catalogue-sync` requires the exact release snapshot and never substitutes a source build; use it for release verification and CI. An uncached snapshot needs private access. Maintainers can keep `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in the main checkout's ignored `.env.local`, which linked worktrees also read.

Configured private-store or mirror failures remain errors; preparation does not hide them by switching to public sources. Builds reuse the compiled catalogue runtime beside the shared snapshot cache. `CATALOGUE_CACHE_DIR=off` selects worktree-local copies. `just catalogue-latest` follows the published pointer.

Prepare the catalogue before list, mission, or battlefield work. Never edit the shared cache in place. Generated output stays in the owning stack. [Catalogue data](catalogue-data.md) owns publication and provenance.

## Development lifecycle

| Command            | Behavior                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `just dev`         | Install a changed lockfile, start/reuse the persistent worktree stack, wait for readiness, print its URL |
| `just dev-status`  | Report owner, URL, data, and logs                                                                        |
| `just dev-stop`    | Stop only the authenticated owner and its children                                                       |
| `just dev-restart` | Rebuild/restart while retaining data/settings                                                            |

Use the reported URL and leave the preview running. Product-module, startup, or activated-catalogue changes require restart. After a checkout, pull, or merge, run `just dev`: a changed lockfile otherwise leaves the running preview on old packages, its dependency scan fails, and pages never finish loading; `just dev` installs it and restarts the preview. Never kill a shared-port listener or broad process name. Startup logs are in `data-dev/dev.log`.

On a collision with an explicit `LOCAL_*_PORT`, choose another free port without touching its owner. A manual product migration stops startup instead of clearing data. `SPACETIME_BIN` selects the CLI; [Contributing](../../CONTRIBUTING.md#start-the-app) owns its version. Each start republishes the product module with its auth settings as SpacetimeDB environment values; [Deployment](../deployment.md#delivery) describes them.

## Browser tests

`just e2e` runs isolated production-mode stacks with fresh `/tmp/praetorium-e2e-<id>` data, reusing a fingerprinted compiled build (`scripts/browserTestBuild.ts`); `just e2e-cold <spec>` bypasses that cache. Never reuse the interactive Vite preview as a browser-test stack.

PR CI distributes browser tests, including `@catalogue` journeys, across the same duration-balanced runners; the tag selects the release preflight rather than a separate CI lane.

A pull request push runs only the specs its change exercises, chosen by `scripts/e2eSelect.ts` from a coverage map. The nightly CI run (or a dispatch with `coverage`) sets `E2E_COVERAGE_DIR`: `e2e/test.ts` records each test's executed browser functions and, through the app server's inspector, its executed server functions, one worker per stack so each test's server work is its own; `scripts/e2eMap.ts` maps them through the test build's source maps (server maps are on for `LOCAL_BUILD_DIR` builds only) and caches the map by revision. An edit inside a function needs the specs that called it; any other edit to a file needs every spec that loaded it, because top-level code runs on load. Edits that cannot change what runs (comments, type declarations, and import bindings added or dropped) need no spec, and lines that moved since the map's revision are followed back to its numbering. Coverage cannot see the catalogue compiler or web workers, so the map lists their source and an edit to it runs every spec. Anything else the map cannot place runs every spec too: a new or unmapped source file, CSS, configuration, tooling, shared `e2e/` helpers, lines changed since the map, or a missing map. `scripts/lib/e2eSelection.ts` owns those rules; keep a new kind of input on the full-suite side until the map can place it. That run is the required `e2e` check, and a change with no runtime effect reports it without a run. A spec the selection missed can therefore merge and deploy; the nightly full suite is what catches it. To run every spec on demand, dispatch CI on the branch (`gh workflow run ci.yml --ref <branch>`); its `e2e` result lands on that commit. Refresh `e2e/durations.json` with `just e2e-durations <run-id>...` after changing the suite; an unrecorded test weighs as much as the median, so one long new test leaves its runner minutes behind the rest.

Pull requests that only change files no runtime lane, build or deploy reads (contributor docs, changesets, `plugin/`, `justfile`) run static checks and skip runtime tests, builds, catalogue comparisons and preview images. `scripts/ciScope.ts` owns that allowlist; add a path only after checking nothing in CI, the build or the app reads it, and keep `CHANGELOG.md` out because the app imports it. The publication text audit runs after the production build in CI so it reuses the offline bundle that build generated; local integration checks still include it.

Compare browser runner counts through the CI workflow's manual dispatch on the same revision, and record queue waits separately from job and test durations. `pnpm exec tsx scripts/benchmarkE2eRunners.ts <setup-seconds> <report.json>...` models runner counts from downloaded passing reports. Confirm estimates with workflow dispatches before changing the default.

Keep the browser runner's startup deadline longer than the build, preview seed, and Node readiness budgets combined, and measure startup phases (`PLAYWRIGHT_STARTUP_REPORT=/absolute/report.json`) before changing timeouts or worker counts. `just e2e-ui <spec>` keeps the stack running for test-only edits; restart it after application, build, or catalogue changes.

Run the complete affected scenario before shipping, including full navigation, reloads, and restored account state; a passing interaction in the Vite preview does not verify production hydration. A failed test retains its trace, screenshot, and DOM state. Gotchas:

- Until a page hydrates, a press on a server-rendered control does nothing, the router cancels a link navigation already under way, and hydration resets scroll position and typed field values. Repeat the interaction until its outcome appears (`retryUntilVisible` and `followLink` in `e2e/account.ts`) rather than waiting for time.
- A changed URL can precede the routed content. Wait for the destination heading before using controls shared with the previous screen; opening its dialog early can lose the interaction when the route swaps.
- Concurrent-tab save assertions must check the persisted result, because either tab can flush the shared mutation queue. A refreshed reference reaches the screen before the saved application is written: poll the saved result before testing a cold reload. Compare large saved applications inside the browser and return a boolean or digest so a failed assertion cannot print the complete bundle.
- A spec that calls `browser.newContext()` imports `test` from `e2e/test.ts`, which closes those contexts at test end; Playwright closes only fixture contexts, and a left-open player keeps polling for the rest of the worker's tests.
- Live battle pages never reach `networkidle`; wait for page elements. Locate unit cards with `data-unit`, roster rows with `data-roster`, and players with `data-person`; scope assertions to the card or row so a menu item cannot satisfy them before the change takes effect.
- Test titles must differ after punctuation is removed, because Playwright derives each test's output directory from its title.

[Native authentication](mobile.md#check-it) owns its separate stack and exclusive simulator reservation.

## Production roster copies

`scripts/productionRosters.ts` owns `just rosters-fetch` and `just rosters-import`; imports land in this worktree's running preview account (`preview@praetorium.gg` / `preview-preview-preview`).

Set these non-secret values in the ignored `.env.local` for the host running the live web service; the deployment controller can be elsewhere:

```dotenv
PRODUCTION_SSH_HOST=user@your-production-host
PRODUCTION_WEB_SERVICE=praetoriumgg-web-ecmusg
```

The SSH path, which needs the configured SSH identity and permission to read Docker service configuration and its SQLite volume, is the supported fetch path on production; an owner token alone cannot read the roster table for the alternative `PRODUCTION_SPACETIME_*` SQL path. Both paths are read-only. Keep credentials in `.env.local`, never in commands or tracked files, and keep snapshots in ignored `data-dev/`.

`just rosters-normalise [snapshot.json]` rewrites saved loadouts whose counts disagree with the units the app builds from them, accepting only rewrites that leave wargear, counts, points, and errors unchanged. `--apply` is the only production write these commands make: run it from a checkout of the deployed release.

Roster copies are a migration test corpus, not a backup; [Deployment](../deployment.md#backups) owns disaster recovery and [Catalogue data](catalogue/rules-versions.md#roster-migration-rehearsal) owns migration rehearsal.
