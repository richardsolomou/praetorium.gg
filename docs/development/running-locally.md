# Running locally

Node 24.x, pnpm 11.15.0, and just 1.58.0 are pinned in `package.json` and `mise.toml`.

```sh
just install
just catalogue-sync
just dev
```

Sync before working on list building, mission matchups, or battlefield plans. Without it, the app can still serve existing battles and pasted rosters, but combined deployment-and-terrain choices stay unavailable until the current verified snapshot arrives.

`just dev` starts the app and Centrifugo. The Vite server proxies `/connection` so realtime traffic stays on the app origin.

Run `just` without a recipe to list all commands. Each recipe wraps a `pnpm` script. CI uses the `pnpm` scripts directly.

## Checks

`just check` runs formatting, lint, database checks, catalogue checks, the production build, type checking, and unit tests.

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

`just dev` starts Postgres and Valkey in containers alongside Centrifugo, applies migrations, then runs the app. Their data lives in named Docker volumes, so it survives between sessions; `just services-down` stops them.

Generate migrations with `just db-generate` and apply them with `just db-migrate`. Do not edit an applied migration. The build copies `drizzle/` into `.output/server/drizzle` for production, which is where both the app and the standalone migrate step look for it.

Unit tests run against PGlite, a real Postgres compiled to WebAssembly, so `pnpm test` needs no server and still exercises the same SQL and the same migrations as a deployment.
