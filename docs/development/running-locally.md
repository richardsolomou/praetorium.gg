# Running locally

Node 24.x, pnpm 11.15.0, and just 1.58.0 are pinned in `package.json` and `mise.toml`.

```sh
just install
just catalogue-sync
just dev
```

Sync before work on lists, mission matchups, or battlefields. Without data, the app still serves battles and pasted rosters. Deployment and terrain choices remain unavailable.

`just dev` starts the app and Centrifugo. The Vite server proxies `/connection` so realtime traffic stays on the app origin.

Run `just` to list commands. Each recipe wraps a `pnpm` script; the `check` job in CI runs `just check` itself, and the sharded e2e jobs call the same `pnpm` scripts the recipes wrap.

## Checks

`just check` runs formatting, lint, documentation checks, database checks, catalogue checks, the production build, type checking, and unit tests.

The build runs before type checking because it generates `src/routeTree.gen.ts`.

The repository uses oxlint and oxfmt. Lint warnings fail the check.

## Tests

- `just test` runs the Vitest unit tests.
- `just e2e` builds the production container and runs Playwright. Use `just e2e-run` to reuse the image, `just e2e-trace` to record a trace, and `just e2e-install` to install Chromium.
- `just points` runs the points ratchet. It is not part of `just check`.

The end-to-end container mounts `catalogue-data/`. Sync the catalogue before running list-building, mission, or battlefield tests.

Two Playwright rules matter:

- An open battle page keeps the event stream active. Wait for a page element instead of `networkidle`.
- Find unit cards with `data-unit`. CSS changes the displayed case, so visible-text selectors are unreliable.

## Database

`just dev` starts Postgres, Valkey, Centrifugo, and the app. It applies migrations first. Named Docker volumes preserve service data. `just services-down` stops the services.

Generate migrations with `just db-generate` and apply them with `just db-migrate`. Do not edit an applied migration. The build copies `drizzle/` into `.output/server/drizzle` for production, which is where both the app and the standalone migrate step look for it.

Unit tests use PGlite, which runs Postgres in WebAssembly. `pnpm test` needs no server. It uses the production SQL and migrations.
