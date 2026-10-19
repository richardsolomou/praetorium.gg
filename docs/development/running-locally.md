# Running locally

[Contributing](../../CONTRIBUTING.md) owns installation and checks. `just` lists recipes; `scripts/dev.ts` and `scripts/localDev.ts` own stack configuration.

## Catalogue

`just catalogue-sync` activates the release-pinned verified snapshot from the shared platform cache. Snapshots live in a private bucket, so it reads them only with `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` set; without them, `CATALOGUE_DIR=catalogue-data just catalogue-materialize --without-stored-editions` builds the catalogue from its pinned sources, leaving out the retired rules editions that exist only as published snapshots. Builds reuse the compiled catalogue runtime beside it. `CATALOGUE_CACHE_DIR=off` selects worktree-local copies. `just catalogue-latest` follows the published pointer; `just catalogue-upstream` reports source drift without activation.

Sync before list, mission, or battlefield work. Never edit the shared cache in place. Generated output stays in the owning stack. [Catalogue data](catalogue-data.md) owns publication and provenance.

## Development lifecycle

| Command            | Behavior                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `just dev`         | Install a changed lockfile, start/reuse the persistent worktree stack, wait for readiness, print its URL |
| `just dev-status`  | Report owner, URL, data, and logs                                                                        |
| `just dev-stop`    | Stop only the authenticated owner and its children                                                       |
| `just dev-restart` | Rebuild/restart while retaining data/settings                                                            |

Check browser status and dev status before starting. Use the reported URL and leave the preview running. Product-module, startup, or activated-catalogue changes require restart. After a checkout, pull, or merge, run `just dev`: a changed lockfile otherwise leaves the running preview on old packages, its dependency scan fails, and pages never finish loading; `just dev` installs it and restarts the preview. Never kill a shared-port listener or broad process name: ownership is verified by worktree and token through `data-dev/active-preview.json`, not by PID or port. Startup logs are in `data-dev/dev.log`.

Ports are allocated automatically; on a collision with an explicit `LOCAL_*_PORT`, choose another free port without touching its owner. Existing data in `data-dev/hosted/` fixes its app port and origin through the auth issuer, so changing them requires fresh data. A manual product migration stops startup instead of clearing data. `SPACETIME_BIN` selects the CLI; [Contributing](../../CONTRIBUTING.md#start-the-app) owns its version. Each start republishes the product module with its auth settings as SpacetimeDB environment values; [Deployment](../deployment.md#delivery) describes them.

## Browser tests

`just e2e` runs isolated production-mode stacks with fresh `/tmp/praetorium-e2e-<id>` data, reusing a fingerprinted compiled build (`scripts/browserTestBuild.ts`); `just e2e-cold <spec>` bypasses that cache. Run `just catalogue-preflight` before shipping a catalogue change. Never reuse the interactive Vite preview as a browser-test stack, and never let concurrent worktrees share test data.

An interrupted run leaves its stack and processes behind. Run `just teardown` once the branch's pull request has merged; it stops only stacks this worktree or a deleted worktree started, scoped by each stack's directory rather than a process name.

PR CI distributes all browser tests, including `@catalogue` journeys, across the same duration-balanced runners; the tag selects the release preflight rather than a separate CI lane. Refresh `e2e/durations.json` with `just e2e-durations <run-id>...` after changing the suite.

Documentation-only pull requests run static checks and skip runtime tests, builds, catalogue comparisons and preview images. `scripts/ciScope.ts` owns the narrow documentation allowlist; mixed changes, unknown paths, empty comparisons and manual dispatches run the full suite. A failed comparison fails CI. The publication text audit runs after the production build in CI so it reuses the offline bundle that build generated; local integration checks still include it.

The CI workflow's manual dispatch accepts 8 or 16 browser runners, with 16 as the default. Compare the same revision and record queue waits separately from job and test durations. `pnpm exec tsx scripts/benchmarkE2eRunners.ts <setup-seconds> <report.json>...` models both counts from downloaded passing reports at 4, 8 and 16 available runner slots. It assumes ideal use of two browser workers, adds the measured setup and median report overhead per runner, and excludes the shared build and external queue waits. Confirm estimates with workflow dispatches before changing the default.

Keep the browser runner's startup deadline longer than the build, preview seed, and Node readiness budgets combined, and measure startup phases (`PLAYWRIGHT_STARTUP_REPORT=/absolute/report.json`) before changing timeouts or worker counts. `just e2e-ui <spec>` keeps the stack running for test-only edits; restart it after application, build, or catalogue changes.

Run the complete affected scenario before shipping, including full navigation, reloads, and restored account state; a passing interaction in the Vite preview does not verify production hydration. A failed test retains its trace, screenshot, and DOM state. Gotchas:

- Until a page hydrates, a press on a server-rendered control does nothing, the router cancels a link navigation already under way, and hydration resets scroll position and typed field values. Repeat the interaction until its outcome appears (`retryUntilVisible` and `followLink` in `e2e/account.ts`) rather than waiting for time.
- A changed URL can precede the routed content. Wait for the destination heading before using controls shared with the previous screen; opening its dialog early can lose the interaction when the route swaps.
- Concurrent-tab save assertions must check the persisted result, because either tab can flush the shared mutation queue. A refreshed reference reaches the screen before the saved application is written: poll the saved result before testing a cold reload. Compare large saved applications inside the browser and return a boolean or digest so a failed assertion cannot print the complete bundle.
- A spec that calls `browser.newContext()` imports `test` from `e2e/test.ts`, which closes those contexts at test end; Playwright closes only fixture contexts, and a left-open player keeps polling for the rest of the worker's tests.
- Test titles must differ after punctuation is removed, because Playwright derives each test's output directory from its title.

[Native authentication](mobile.md#check-it) owns its separate stack and exclusive simulator reservation.

## Repository backup

`just repository-backup /absolute/destination` creates and verifies a bundle of every local Git ref, excluding uncommitted files. Keep it outside the repo and separate from GitHub.

## Production roster copies

`just rosters-fetch` exports saved selections into `data-dev/production-rosters.json`; `just rosters-import` copies them into this worktree's running preview account (`preview@praetorium.gg` / `preview-preview-preview`) as private rosters with new IDs, preserving local edits on repeated imports. `scripts/productionRosters.ts` owns both.

For the current Dokploy host, add these non-secret settings to the ignored `.env.local`:

```dotenv
PRODUCTION_SSH_HOST=hetzner
PRODUCTION_WEB_SERVICE=praetoriumgg-web-ecmusg
```

The SSH path, which needs the configured SSH identity and permission to read Docker service configuration and its SQLite volume, is the supported fetch path on production; an owner token alone cannot read the roster table for the alternative `PRODUCTION_SPACETIME_*` SQL path. Both paths are read-only. Keep credentials in `.env.local`, never in commands or tracked files, and keep snapshots in ignored `data-dev/`.

`just rosters-normalise [snapshot.json]` rewrites saved loadouts whose counts disagree with the units the app builds from them, accepting only rewrites that leave wargear, counts, points, and errors unchanged. `--apply` is the only production write these commands make: run it from a checkout of the deployed release; it refuses unless production's catalogue `revision.json` matches and saves against the version it read, so a concurrent edit wins and reruns are safe.

Roster copies are a migration test corpus, not a backup; [Deployment](../deployment.md#backups) owns disaster recovery and [Catalogue data](catalogue-data.md#roster-migration-rehearsal) owns migration rehearsal.
