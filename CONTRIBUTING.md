# Contributing to Praetorium

Keep changes small and include tests for new behavior and failure paths. Discuss changes to product scope in an issue first. Coding-agent rules are in [AGENTS.md](AGENTS.md).

## Start the app

Install Node 24.x, pnpm 11.15.0, and just 1.58.0, then run:

```sh
just install
just catalogue-sync
just dev
```

`just catalogue-sync` is needed for list building, missions, and battlefields. It reuses a release-pinned snapshot across worktrees. [Running locally](docs/development/running-locally.md) covers the cache, services, and individual commands.

## Coherence

Codex hooks read the project lexicon, specs, and verification journal at session start. Coherence is a linked checkout rather than a package dependency. After `just install`, clone it beside this project and link its executable:

```sh
git clone git@github.com:PostHog/coherence.git ../coherence
npm --prefix ../coherence ci
ln -s ../../../coherence/src/cli.ts node_modules/.bin/coherence
```

If the sibling checkout already exists, use its path for the install and executable link. The direct link keeps npm from installing a second dependency tree over pnpm's locked packages. Run `node_modules/.bin/coherence spec --check`, `node_modules/.bin/coherence run --session <session-id> --agent <name>`, and `node_modules/.bin/coherence scope` to inspect the declared rules and their latest verification. The Codex Stop hook checks vocabulary in changed files. Run `node_modules/.bin/coherence lexicon --check <changed-files>` to check selected files earlier; it reports older uses in those files too.

## Check a change

```sh
just check
```

This runs formatting, lint, documentation and database checks, a production build, type checking, and tests. Use `just test-unit` for a fast loop, `just test-integration` for database and service boundaries, and `just e2e` for browser flows. Run `just points` separately after points or roster-legality changes.

Browser tests wait for page elements rather than `networkidle` on live battle pages. Locate unit cards with `data-unit` and roster rows with `data-roster`; scope assertions to the card or row so a menu item cannot satisfy them before the change takes effect.

## Pull requests and releases

Use a conventional commit title and the [pull request template](.github/pull_request_template.md). Branches receive a disposable [preview](docs/development/pr-previews.md).

Released application changes need a `pnpm changeset` entry for `praetorium.gg`: `minor` for a new capability, `patch` for a fix, and one imperative sentence describing the player-visible change. Documentation, tests, refactors, and tooling-only changes need no changeset. Merging a changeset to `main` triggers the version update, changelog, tag, and GitHub Release.

Report vulnerabilities through [SECURITY.md](SECURITY.md).
