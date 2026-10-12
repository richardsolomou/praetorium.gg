# Running locally

[Contributing](../../CONTRIBUTING.md) owns installation and checks. `just` lists recipes; `scripts/dev.ts` and `scripts/localDev.ts` own stack configuration.

## Catalogue

`just catalogue-sync` activates the release-pinned verified snapshot from the shared platform cache. `CATALOGUE_CACHE_DIR=off` selects a worktree-local copy. `just catalogue-latest` follows the published pointer; `just catalogue-upstream` reports source drift without activation.

Sync before list, mission, or battlefield work. Never edit the shared cache in place. Generated output stays in the owning stack. [Catalogue data](catalogue-data.md) owns publication and provenance.

## Development lifecycle

| Command            | Behavior                                                                     |
| ------------------ | ---------------------------------------------------------------------------- |
| `just dev`         | Start/reuse the persistent worktree stack, wait for readiness, print its URL |
| `just dev-status`  | Report owner, URL, data, and logs                                            |
| `just dev-stop`    | Stop only the authenticated owner and its children                           |
| `just dev-restart` | Rebuild/restart while retaining data/settings                                |

Check browser status and dev status before starting. Use the reported URL and leave the preview running. Source edits hot reload; product-module, startup, or activated-catalogue changes require restart. Never kill a shared-port listener or broad process name. Browser tests own a separate disposable stack.

The owner/readiness record is `data-dev/active-preview.json`; startup logs are `data-dev/dev.log`. A loopback controller verifies worktree/token ownership, not just PID or health. Old records without controller identity require stopping the original runner from its terminal before starting again.

App ports are allocated automatically, preferring 3000, with separate internal/product ports. Explicit `LOCAL_APP_PORT`, `LOCAL_INTERNAL_PORT`, `LOCAL_SPACETIME_PORT`, and `LOCAL_CONTROL_PORT` fail if occupied. `LOCAL_DATA_DIR` and `LOCAL_PUBLIC_URL` override storage/origin. Existing data fixes its app port/origin through the auth issuer; changing those requires fresh data, preserving the original. For a control-port collision, choose an explicit free control port without touching its other owner.

Default data/build output lives in `data-dev/hosted/` and survives restart. Startup applies checked-in auth migrations and seeds initial preview data. `SPACETIME_BIN` selects the required CLI; [Contributing](../../CONTRIBUTING.md#start-the-app) owns its version. Both loopback hostnames work for sign-in. Native development uses the reported origin via `EXPO_PUBLIC_APP_URL`, with Android's emulator host mapping.

## Browser tests

`just e2e` owns isolated production-mode stacks with allocated ports, unique fresh `/tmp/praetorium-e2e-<id>` data/build output, and per-run results. Shutdown stops owned process groups before deleting their data. Repeated cleanup of a stopped child must not signal its old process group again. Concurrent worktrees never share test databases or reset each other's data.

Keep the browser runner's startup deadline longer than the build, preview seed and Node readiness budgets combined. The local health wait must allow both seeding and catalogue warmup to finish; a rules snapshot can add retained versions without changing the database schema.

`just e2e-install` installs Chromium; `just e2e-trace` records traces. Configuration and worker/retry/shard counts live in the Playwright config and CI. Prefer automatic allocation; explicit `PLAYWRIGHT_*` overrides require fresh data under the expected `/tmp` prefix. `just e2e-durations <run id>...` refreshes shard timings from the median of several complete CI runs.

A spec that opens another browser context with `browser.newContext()` imports `test` from `e2e/test.ts`, which closes those contexts when the test ends. Playwright closes only the contexts its fixtures create; a left-open player keeps polling and downloading for the rest of the worker's tests. Test titles must differ after punctuation is removed, because Playwright derives each test's output directory from its title.

[Native authentication](mobile.md#check-it) owns its separate stack and exclusive simulator reservation.

## Repository backup

`just repository-backup /absolute/destination` creates/verifies a bundle of every local Git ref. Keep it outside the repo and separate from GitHub. It excludes uncommitted files.

## Production roster copies

`just rosters-fetch` exports saved selections into `data-dev/production-rosters.json`; `just rosters-import` copies them into this worktree's running preview account. Sign in with `preview@praetorium.gg` and password `preview-preview-preview`. Import retains the original IDs inside loadouts, model counts, attachments, rules selections, and available variant links. It uses separate roster IDs, private visibility, and generated names. Repeated imports preserve local edits and resume after partial failure. Variants whose base was deleted are reported and copied as standalone rosters. Original timestamps remain in the snapshot; imported creation times use their last saved time.

For the current Dokploy host, add these non-secret settings to the ignored `.env.local`:

```dotenv
PRODUCTION_SSH_HOST=hetzner
PRODUCTION_WEB_SERVICE=praetoriumgg-web-ecmusg
```

The SSH path requires the configured SSH identity and permission to read Docker service configuration and its SQLite volume. It checks the production application origin, reads account IDs only on the host, and uses the running app's operator API. Each account's rosters are read in one transaction; the whole export is not a database-wide snapshot. Account credentials, user IDs, names, notes, battle history, and production secrets are not downloaded. Reads fail on supported population/size limits instead of truncating the roster set.

Alternatively, the SQL path reads the roster table in one transaction using `PRODUCTION_SPACETIME_URL`, `PRODUCTION_SPACETIME_DATABASE`, and `PRODUCTION_SPACETIME_OWNER_TOKEN`. This requires authorization to read the roster table; a database owner token alone does not grant that access on production, where the SSH path is supported. Cloudflare Access requires both `PRODUCTION_SPACETIME_ACCESS_CLIENT_ID` and `PRODUCTION_SPACETIME_ACCESS_CLIENT_SECRET`. Keep credentials in `.env.local`, never in commands or tracked files. Both paths are read-only in production. Snapshots and reports are written with private file permissions; keep them in ignored `data-dev/`.

Full paired-volume backups in private object storage remain the disaster-recovery path described in [Deployment](../deployment.md#backups). Roster copies are a migration test corpus, not a replacement backup. [Catalogue data](catalogue-data.md#roster-migration-rehearsal) owns migration authoring and verification.
