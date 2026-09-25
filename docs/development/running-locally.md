# Running locally

Setup and checks are in [Contributing](../../CONTRIBUTING.md). Run `just` to list all commands.

## Catalogue

`just catalogue-sync` downloads the release-pinned snapshot into `CATALOGUE_CACHE_DIR`, or the platform cache directory by default, and points `catalogue-data/` at it. Set `CATALOGUE_CACHE_DIR=off` for a worktree-local copy. `just catalogue-latest` follows the hourly publisher.

The app can run without a snapshot, but list building, mission matchups, and battlefields need one. Sync before the corresponding browser tests; the end-to-end container mounts `catalogue-data/`.

## Services and database

`just dev` starts Postgres, Valkey, Centrifugo, and the app, and applies migrations. The Vite server proxies `/connection` for realtime traffic. Named Docker volumes retain service data; `just services-down` stops the services.

`just db-generate` creates migrations and `just db-migrate` applies them. Applied migrations are immutable. The production build copies `drizzle/` to `.output/server/drizzle`, where both the app and the standalone migration step read it. Unit tests use PGlite and need no server.

## Browser tests

`just e2e` builds the production container and runs Playwright. `just e2e-run` reuses the image, `just e2e-trace` records a trace, and `just e2e-install` installs Chromium.

## Repository backup

`just repository-backup /absolute/destination` creates and verifies a Git bundle of every local ref. Keep the bundle outside this repository and separate from GitHub. It does not include uncommitted files.
