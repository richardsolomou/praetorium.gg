# Praetorium — Agent Guide

Setup and checks: [CONTRIBUTING.md](CONTRIBUTING.md). Code placement: [architecture](docs/development/architecture.md). Product intent: [PRODUCT.md](PRODUCT.md); visual system: [DESIGN.md](DESIGN.md).

Before changing a domain, read its guide in `docs/development/`:

- `catalogue-data`: points, legality, rules versions, saved lists, imports
- `battles`: command log, guests, undo, realtime, offline battles
- `groups-and-tournaments`: vocabulary, stored names, sealing, reveal, Swiss, leagues
- `game-rules`: stratagems, missions, scoring, terrain
- `combat-simulation`, `agent-reference` (MCP, plugin, crawlers), `telemetry`
- `interface`: screens, components, copy, saved app data
- `mobile`, `mobile-release`: native shell and store releases
- `running-locally`: dev servers, browser tests

Also `docs/deployment.md` (hosting, previews, releases) and `docs/product-design.md` (privacy contract).

## Rules

- No fetched upstream catalogues, copied rules prose, generated catalogues, or snapshots in Git; corrections follow [catalogue/patches](catalogue/patches/README.md). Report unsupported rules instead of inventing them.
- `src/core` is deterministic domain logic: no IO or framework imports except zod. Reuse the one existing authority for legality, pricing, visibility, and battle state.
- Battle state folds from its command log; never persist a score, phase, round, or mission beside it.
- Server reads use `rpc()`, mutations `mutationRpc()` with an origin check before state access.
- `src/components/ui` is vendored shadcn: generate via the CLI and wrap, never edit.
- Say group, league, hidden-list game, tournament and sealed event as `groups-and-tournaments` defines them; `scripts/checkVocabulary.ts` fails CI on the old words outside stored names.
- A change players can notice needs a changeset: one plain sentence per fix ([CONTRIBUTING.md](CONTRIBUTING.md#pull-requests-and-releases)).
- No outreach, acquisition, personal, or private analytics material in the repo. Docs cover the hosted service and local contribution only.

## Writing things down

- Add a test only when it guards behavior that could realistically break. CI time is limited: no tests that restate the implementation, can't fail, or duplicate existing coverage.
- Explain non-obvious code in a comment and the reason for a change in the commit.
- Explain player-facing behavior in the in-app docs (`src/client/features/docs/content`).
- Guides hold only constraints that span files and that code can't express.

## Local preview

Check `just dev-status` first. Run `just dev` after any checkout, pull, or merge and use the URL it prints; run `just teardown` after the PR merges. Never kill processes by port or broad name.
