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

`just e2e` owns isolated production-mode stacks with allocated ports, unique fresh `/tmp/praetorium-e2e-<id>` data/build output, and per-run results. Shutdown stops owned process groups before deleting their data. Concurrent worktrees never share test databases or reset each other's data.

`just e2e-install` installs Chromium; `just e2e-trace` records traces. Configuration and worker/retry/shard counts live in the Playwright config and CI. Prefer automatic allocation; explicit `PLAYWRIGHT_*` overrides require fresh data under the expected `/tmp` prefix. `just e2e-durations <run id>` refreshes shard timings.

[Native authentication](mobile.md#check-it) owns its separate stack and exclusive simulator reservation.

## Repository backup

`just repository-backup /absolute/destination` creates/verifies a bundle of every local Git ref. Keep it outside the repo and separate from GitHub. It excludes uncommitted files.
