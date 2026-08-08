# Running locally

Node 24.x, pnpm 11.15.0 and just 1.58.0, all pinned — the first two in `package.json`, all three in `mise.toml`.

```sh
just install
just catalogue-sync    # optional, enables list building
just dev
```

`just dev` runs Centrifugo alongside the app and takes it down again on the way out, so live updates work without a second terminal and no stray container outlives the one you started it from. The dev server proxies `/connection` to it, which keeps the browser on one origin exactly as it is in production.

`just` with no recipe lists them all. Every recipe is a thin wrapper over the `pnpm` script underneath, so either works; CI uses the pnpm scripts directly, which is why they stay.

Without a synced catalogue the app starts and serves battles; it simply offers pasting a list instead of building one. The sync fetches about 130MB from three pinned community repositories into `catalogue-data/`, which is gitignored.

## Checks

`just check` is the whole gate, and it is what CI runs: format, lint, `db:check`, `catalogue:check`, build, typecheck, unit tests.

The build runs **before** typecheck because it generates `src/routeTree.gen.ts` — on a fresh clone typecheck fails until you have built once.

Lint and format are oxlint and oxfmt, not ESLint and Prettier. Warnings are denied. `scripts/**` is exempt from two rules that only make sense inside the app.

## Tests

- `just test` — Vitest, everything under `src`.
- `just e2e` — builds the container image, then drives real browsers against it. `just e2e-run` reuses the image already built, `just e2e-trace` records a trace, and `just e2e-install` fetches Chromium once. Docker is required, because Centrifugo and Caddy are part of how a request is served and a suite that skipped them would be testing a topology nobody deploys.
- `just points` — the points ratchet. Slow, and not part of `check`; CI runs it on its own.

The e2e container mounts `catalogue-data/`, so list building is exercised against the real data. Run `just catalogue-sync` first or those specs fail.

Two traps worth knowing before writing a spec:

- **An open battle page never reaches network idle** — it holds the event stream open forever. Waiting for `networkidle` hangs until it times out; wait for an element instead.
- **`data-unit` is how a spec finds a unit card.** CSS uppercases the names, so the DOM holds "Overlord" while the page shows "OVERLORD"; matching on visible text is a trap that has cost two rounds of spec fixes.

## Database

Migrations are generated with `just db-generate` and never hand-edited once applied. `drizzle/` is copied into `.output/server/drizzle` by the build so the production server can run them.
