# Running locally

[Contributing](../../CONTRIBUTING.md) owns installation and checks. Run `just` to list commands.

## Catalogue

`just catalogue-sync` activates the release-pinned verified snapshot from the shared platform cache and points this worktree's `catalogue-data/` at it. Set `CATALOGUE_CACHE_DIR=off` for a worktree-local copy. `just catalogue-latest` follows the manually published snapshot; `just catalogue-upstream` reports upstream changes without activating them.

Sync before work or browser tests involving lists, missions, or battlefields. The cache is shared, but generated local catalogue output stays with the owning development stack; do not edit the cached snapshot in place.

## Development lifecycle

`just dev` starts or reuses one persistent development stack for this worktree, waits for readiness, prints its URL, and exits without stopping it. The stack serves application source through Vite with hot reload. It builds only the product module, seed bundle, and derived catalogue needed for startup; it does not build or serve the production web app.

| Command            | Behavior                                                   |
| ------------------ | ---------------------------------------------------------- |
| `just dev`         | Start or reuse this worktree's Vite stack                  |
| `just dev-status`  | Print its owner, URL, data directory, and log path         |
| `just dev-stop`    | Stop only its authenticated owner and children             |
| `just dev-restart` | Stop and rebuild it, preserving its databases and settings |

Application source edits use Vite's live reload. Restart for changes to the SpacetimeDB module, startup configuration, or the activated catalogue. `just check` and `just e2e` do not own the interactive preview. Leave it running for the user after verification; never use `pkill`, `killall`, or kill a listener merely because it occupies a familiar port.

The runner records its worktree, random owner token, service ports, settings, and readiness in `data-dev/active-preview.json`. A loopback control listener prevents concurrent starts from creating duplicate stacks. Status and stop verify the owner rather than trusting a PID or a generic application health response. `data-dev/dev.log` contains startup and application output. For an old record without controller identity, stop its original runner in its owning terminal and run `just dev`; the upgrade retains its settings and database name.

The first worktree tries app port 3000; if it is occupied, a new worktree selects an available port. Internal Vite and SpacetimeDB ports are allocated separately. Always use the reported URL. `LOCAL_APP_PORT`, `LOCAL_INTERNAL_PORT`, `LOCAL_SPACETIME_PORT`, `LOCAL_CONTROL_PORT`, `LOCAL_DATA_DIR`, and `LOCAL_PUBLIC_URL` provide explicit overrides; occupied explicit ports fail instead of incrementing. Changing a live preview's settings requires `just dev-restart`. Once data is initialized, its app port and public URL are fixed by the product database's authentication issuer; changing them requires a fresh `LOCAL_DATA_DIR` and leaves the original data untouched. A rare collision at the worktree's stable control port fails without touching the other owner; choose an explicit free `LOCAL_CONTROL_PORT` when starting that worktree.

Development data stays inside its worktree under `data-dev/hosted/` by default: SQLite accounts, local object files, SpacetimeDB data, and private generated build output. It survives restart, and its recorded product database name is retained. The first start seeds preview accounts, practice opponents, and example rosters, battles, and leagues. `SPACETIME_BIN` selects the pinned 2.7.0 CLI when it is outside its standard installation path. `pnpm auth:db:generate` creates auth migrations; startup applies checked-in migrations.

Both localhost and 127.0.0.1 work for local sign-in at the reported app port. Native development must use this URL too; set `EXPO_PUBLIC_APP_URL` when it differs from port 3000.

## Browser tests

`just e2e` runs Playwright against a separate production-mode test stack. Each invocation chooses available app, internal, SpacetimeDB, and readiness ports, creates a unique disposable `/tmp/praetorium-e2e-<id>` directory, and writes private build output there. Workers inherit that invocation's settings. Parallel worktrees do not share auth files, object directories, product databases, or generated builds. Startup refuses an existing test directory; it never resets another run's data. Shutdown stops the owned process groups before removing disposable data.

`just e2e-trace` records a trace; `just e2e-install` installs Chromium. Results default to a run-specific directory under `test-results/`. `PLAYWRIGHT_PORT`, `PLAYWRIGHT_INTERNAL_PORT`, `PLAYWRIGHT_SPACETIME_PORT`, `PLAYWRIGHT_READY_PORT`, `PLAYWRIGHT_DATA_ROOT`, and `PLAYWRIGHT_OUTPUT_DIR` support explicit configuration; a custom data root must be fresh and use the Praetorium test prefix directly under `/tmp`. Prefer automatic allocation locally.

The suite runs two workers per stack; each test creates its own players and data. CI splits the suite across eight runners using `e2e/durations.json`. `just e2e-durations <run id>` refreshes their recorded durations. CI retries once and still reports a retry-pass as flaky; local runs do not retry.

Native authentication uses its own temporary stack and requires exclusive ownership of its iOS Simulator. See [Mobile](mobile.md).

## Repository backup

`just repository-backup /absolute/destination` creates and verifies a Git bundle of every local ref. Keep the bundle outside this repository and separate from GitHub. It does not include uncommitted files.
