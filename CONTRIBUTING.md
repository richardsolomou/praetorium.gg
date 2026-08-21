# Contributing to Praetorium

Thanks for helping with Praetorium. We aim to keep the battle tracker small, predictable, and easy to inspect. Check for an existing issue before starting a substantial change. Open an issue first if the scope or product direction needs discussion. Coding-agent instructions live in [AGENTS.md](AGENTS.md).

## Development setup

Install Node 24.x, pnpm 11.15.0, and just 1.58.0, then run:

```sh
just install
just catalogue-sync
just dev
```

The catalogue sync is optional unless you work on list building. The app can run without catalogue data and still serve battles.

See [Running locally](docs/development/running-locally.md) for individual commands and end-to-end test setup.

## Checks

Run the complete local check suite with:

```sh
just check
```

This checks formatting, lint, database migrations, catalogue source pins, the production build, types, and unit tests. The build runs before type checking because it generates `src/routeTree.gen.ts`.

Run `just e2e` for changes to rendered behavior or complete user flows. The command builds the production container and runs Playwright against it. Sync the catalogue first when a test uses list building.

Run `just points` after changes to points or roster legality. The result is a ratchet. A lower match rate is a regression unless the set of generated checks changed and the new baseline is explained.

Three browser-test details matter:

- Battle pages keep a live connection open, so they never reach network idle. Wait for a page element instead.
- Find unit cards with `data-unit` and roster rows with `data-roster`. CSS changes the displayed case, so visible-text matching is unreliable.
- Scope an assertion to the row or card it is about. `getByText` matches a substring case-insensitively, so a word on a row also matches the menu item that changes it, and the assertion can pass before the change lands.

## Layout

- `src/core` contains the domain model for battles, catalogues, evaluation, and rosters. It has no IO or framework imports.
- `src/db` contains the Drizzle repository, Postgres schema, and database connection.
- `src/server` contains application setup, authentication, server functions, catalogue loading, and realtime publishing.
- `src/client` contains React components, hooks, and query definitions.
- `src/routes` contains TanStack Router route files. Keep routes thin.
- `catalogue` records community source locations. Snapshot manifests outside Git pin their revisions and checksums; the repository contains no game data.
- `e2e` contains Playwright coverage against the production container.

## Conventions

- Implement each decision once, in the lowest layer that can own it. `validate` decides whether a command is legal. `violations` decides whether a roster is legal.
- Keep derived battle state out of the database. Fold scores, rounds, phases, and missions from the command log and attached lists.
- Treat unknown catalogue rules as unknown. Report them instead of guessing.
- Generate schema migrations with `just db-generate`. Do not edit an applied migration.
- Update `.env.example`, `docker-compose.yml`, and [the deployment guide](docs/deployment.md) together when an operator-facing setting changes.
- Inspect rendered changes in a browser at desktop and phone widths.
- Add tests for new behavior and negative paths.

## Pull requests

Use a conventional commit title and the repository pull request template. Branches in this repository receive a disposable preview linked from the pull request. See [Pull request previews](docs/development/pr-previews.md) for its lifecycle.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Release notes

Run `pnpm changeset` for changes to released application behavior. Choose `minor` for new capabilities and `patch` for fixes, then write one imperative, user-visible sentence. Documentation, tests, refactors, and tooling-only changes do not need a changeset.

When a changeset reaches `main`, CI updates `package.json` and `CHANGELOG.md`, then creates the matching tag and GitHub Release.
