# Running locally

Node 24.x and pnpm 11.15.0, both pinned in `package.json`.

```sh
pnpm install
mkdir -p data-dev
pnpm catalogue:sync                                     # optional, enables list building
CATALOGUE_DIR=./catalogue-data DATA_DIR=./data-dev pnpm dev
```

Without a synced catalogue the app starts and serves battles; it simply offers pasting a list instead of building one. The sync fetches about 130MB from three pinned community repositories into `catalogue-data/`, which is gitignored.

## Checks

`pnpm check` is the whole gate, and it is what CI runs: format, lint, `db:check`, `catalogue:check`, build, typecheck, unit tests.

The build runs **before** typecheck because it generates `src/routeTree.gen.ts` — on a fresh clone typecheck fails until you have built once.

Lint and format are oxlint and oxfmt, not ESLint and Prettier. Warnings are denied. `scripts/**` is exempt from two rules that only make sense inside the app.

## Tests

- `pnpm test` — Vitest, everything under `src`.
- `pnpm test:e2e` — builds, then drives real browsers against the production server. `pnpm test:e2e:run` reuses the current build; install Chromium once with `pnpm test:e2e:install`.
- `pnpm catalogue:points` — the points ratchet. Slow, and not part of `check`; CI runs it on its own.

The e2e server is pointed at `catalogue-data/`, so list building is exercised against the real data. Run `pnpm catalogue:sync` first or those specs fail.

Two traps worth knowing before writing a spec:

- **An open battle page never reaches network idle** — it holds the event stream open forever. Waiting for `networkidle` hangs until it times out; wait for an element instead.
- **`data-unit` is how a spec finds a unit card.** CSS uppercases the names, so the DOM holds "Overlord" while the page shows "OVERLORD"; matching on visible text is a trap that has cost two rounds of spec fixes.

## Database

Migrations are generated with `pnpm db:generate` and never hand-edited once applied. `drizzle/` is copied into `.output/server/drizzle` by the build so the production server can run them.
