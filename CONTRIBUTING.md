# Contributing to Praetorium

Praetorium's contribution model favours small, predictable, inspectable changes. Existing issues carry prior discussion, while changes to product scope begin in a new issue. Coding-agent rules are in [AGENTS.md](AGENTS.md).

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

Run the full local check suite:

```sh
just check
```

This command checks formatting, lint, documentation, database migrations, catalogue sources, the production build, types, and unit tests. The build generates `src/routeTree.gen.ts` before type checking.

Run `just e2e` for rendered behavior or complete user flows. It builds the production container and runs Playwright. Sync the catalogue before list-building tests.

Run `just points` after changes to points or roster legality. The result is a ratchet. A lower match rate is a regression unless the set of generated checks changed and the new baseline is explained.

Browser tests account for three repository behaviours:

- Battle pages keep a live connection open and never reach network idle; page elements provide the readiness signal.
- Unit cards expose `data-unit` and roster rows expose `data-roster`. CSS changes displayed case, making visible-text matching unreliable.
- Assertions are scoped to their row or card. `getByText` matches substrings case-insensitively, so an unscoped word can also match the menu item that changes it and pass before the change lands.

## Layout

- `src/core` contains the domain model for battles, catalogues, evaluation, and rosters. It has no IO or framework imports.
- `src/db` contains the Drizzle repository, Postgres schema, and database connection.
- `src/server` contains application setup, authentication, server functions, catalogue loading, and realtime publishing.
- `src/client` contains React components, hooks, and query definitions.
- `src/routes` contains thin TanStack Router route files.
- `catalogue` records community source locations. Snapshot manifests outside Git pin their revisions and checksums; the repository contains no game data.
- `e2e` contains Playwright coverage against the production container.

## Conventions

- Each decision has one implementation in the lowest layer that can own it. `validate` decides whether a command is legal, while `violations` decides whether a roster is legal.
- Derived battle state stays out of the database. Scores, rounds, phases, and missions fold from the command log and attached lists.
- Unknown catalogue rules remain unknown and are reported rather than guessed.
- `just db-generate` creates schema migrations, and an applied migration is immutable.
- An operator-facing setting appears together in `.env.example`, `docker-compose.yml`, and [the deployment guide](docs/deployment.md).
- Reference documentation describes current behavior in the present tense. Imperative wording is reserved for procedures, checklists, and required contributor actions.
- Rendered changes are inspected at desktop and phone widths.
- New behavior and negative paths have test coverage.

## Pull requests

Pull requests use a conventional commit title and the repository template. Branches in this repository receive a disposable preview linked from the pull request. [Pull request previews](docs/development/pr-previews.md) describes its lifecycle.

Vulnerability reports follow the private process in [SECURITY.md](SECURITY.md).

## Release notes

Changes to released application behavior carry a `pnpm changeset` entry for the exact package name from `package.json` (`praetorium.gg`). New capabilities use `minor`, fixes use `patch`, and the note is one imperative, user-visible sentence. Documentation, tests, refactors, and tooling-only changes need no changeset.

When a changeset reaches `main`, CI updates `package.json` and `CHANGELOG.md`, then creates the matching tag and GitHub Release.
