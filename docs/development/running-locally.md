# Running locally

Node 24.x, pnpm 11.15.0, and just 1.58.0 are pinned in `package.json` and `mise.toml`.

```sh
just install
just catalogue-sync
just dev
```

List building, mission matchups, and battlefields require the synced catalogue. Without it, the app still serves battles and pasted rosters, while deployment and terrain choices remain unavailable.

`just dev` starts the app and Centrifugo. The Vite server proxies `/connection` so realtime traffic stays on the app origin.

`just` lists the available commands. Each recipe wraps a `pnpm` script; the `check` job in CI runs `just check` itself, and the sharded e2e jobs call the same `pnpm` scripts the recipes wrap.

## Checks

`just check` runs formatting, lint, documentation checks, database checks, catalogue checks, the production build, type checking, and unit tests.

The build runs before type checking because it generates `src/routeTree.gen.ts`.

The repository uses oxlint and oxfmt. Lint warnings fail the check.

## Tests

- `just test` runs the Vitest unit tests.
- `just e2e` builds the production container and runs Playwright. `just e2e-run` reuses the image, `just e2e-trace` records a trace, and `just e2e-install` installs Chromium.
- `just points` runs the points ratchet. It is not part of `just check`.

The end-to-end container mounts `catalogue-data/`, making a catalogue sync a prerequisite for list-building, mission, and battlefield tests.

Two Playwright behaviours affect tests:

- An open battle page keeps the event stream active and never reaches `networkidle`; page elements provide the readiness signal.
- Unit cards expose `data-unit` because CSS changes their displayed case and makes visible-text selectors unreliable.

## Database

`just dev` starts Postgres, Valkey, Centrifugo, and the app. It applies migrations first. Named Docker volumes preserve service data. `just services-down` stops the services.

`just db-generate` creates migrations and `just db-migrate` applies them. Applied migrations are immutable. The build copies `drizzle/` into `.output/server/drizzle` for production, which is where both the app and the standalone migrate step read it.

Unit tests use PGlite, which runs Postgres in WebAssembly. `pnpm test` needs no server. It uses the production SQL and migrations.
