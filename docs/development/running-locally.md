# Running locally

Setup and checks are in [Contributing](../../CONTRIBUTING.md). Run `just` to list all commands.

## Catalogue

`just catalogue-sync` downloads the release-pinned snapshot into `CATALOGUE_CACHE_DIR`, or the platform cache directory by default, and points `catalogue-data/` at it. Set `CATALOGUE_CACHE_DIR=off` for a worktree-local copy. `just catalogue-latest` follows the manually published snapshot. `just catalogue-upstream` checks for newer upstream revisions without changing the active snapshot.

The app can run without a snapshot, but list building, mission matchups, and battlefields need one. Sync before the corresponding browser tests.

## Services and database

Install SpacetimeDB CLI 2.7.0, then run `just dev`. It builds the Node app and product module, starts SpacetimeDB locally, and serves the app with a SQLite auth file and local object directory. The first run seeds four preview accounts, two credentialless practice opponents, and example rosters, battles, and leagues. Local data and credentials stay in the gitignored `data-dev/hosted/` directory. Set `SPACETIME_BIN` if the 2.7.0 CLI is outside its standard installation path; `LOCAL_APP_PORT`, `LOCAL_SPACETIME_PORT`, and `LOCAL_DATA_DIR` override the local defaults.

Restart `just dev` after source changes to rebuild the app or product module. The local databases and seed data survive restarts.

`pnpm auth:db:generate` creates auth migrations. The local runner applies the checked-in migration before serving.

## Browser tests

`just e2e` starts isolated local SQLite, object storage, and SpacetimeDB services and runs Playwright. `just e2e-trace` records a trace, and `just e2e-install` installs Chromium.

CI splits the suite across eight runners by the durations in `e2e/durations.json`, and a test missing from it counts as the median. Locally and on each CI runner, tests run on two workers against one stack, so a test must create its own players and data rather than depend on what another test left behind. When runner times drift apart, `just e2e-durations <run id>` records the durations of a CI run's passing tests. CI retries a failed test once; a test that passes on retry is reported as flaky and still needs a fix.

## Repository backup

`just repository-backup /absolute/destination` creates and verifies a Git bundle of every local ref. Keep the bundle outside this repository and separate from GitHub. It does not include uncommitted files.
