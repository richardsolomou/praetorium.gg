# Contributing to Praetorium

Keep changes small and include tests for new behavior and failure paths. Discuss changes to product scope in an issue first. Coding-agent rules are in [AGENTS.md](AGENTS.md).

## Start the app

Install Node 24.x, pnpm 11.28.5, just 1.58.0, and SpacetimeDB CLI 2.7.0, then run:

```sh
just install
just catalogue-sync
just dev
```

`just dev` prints the URL of a persistent Vite server; leave it running while testing. Use `just dev-status`, `just dev-stop`, and `just dev-restart` to manage only this worktree's stack. `just catalogue-sync` is needed for list building, missions, and battlefields. It reuses a release-pinned snapshot across worktrees. [Running locally](docs/development/running-locally.md) covers the cache, local databases, and individual commands.

## Check a change

Before committing, format the touched files and run checks that cover the changed behavior and its callers. For a small application change, run lint, type checking, the relevant unit or integration tests, and the complete affected browser scenarios, including reloads and restored state. Use `just test-unit <test-file>` for unit tests, `just test-integration <test-file>` for database and service boundaries, and `just e2e <spec-file>` for browser flows. [Running locally](docs/development/running-locally.md#browser-tests) covers failure artifacts, repeated test-only debugging, build reuse, and startup timings. Documentation-only changes need formatting and Markdown lint. Run `just points` after points or roster-legality changes.

CI runs the `just check` steps as parallel lanes (static checks, unit tests, integration tests, build with type checking) and the browser suites. `just check` includes formatting, lint, documentation and database checks, a production build, type checking, and tests; run it locally for dependency, build, startup, or broad changes, or when investigating a CI failure. Do not routinely duplicate the complete CI suite locally for a small change. Once a check passes, rerun it only when a subsequent edit affects what it checks or a failure leaves its result uncertain.

For rendered changes, inspect the running preview at the relevant widths and exercise the complete behavior. Repeat on the hosted preview when the change depends on hosted configuration or when local and CI evidence leave a deployment-specific question. After release, verify the deployed revision and health; repeat the feature flow when it depends on production services.

Browser tests wait for page elements rather than `networkidle` on live battle pages. Locate unit cards with `data-unit`, roster rows with `data-roster`, and players with `data-person`; scope assertions to the card or row so a menu item cannot satisfy them before the change takes effect.

## Pull requests and releases

Use a conventional commit title and the [pull request template](.github/pull_request_template.md). Branches receive a disposable [preview](docs/deployment.md#pull-request-previews).

A change players can notice needs a `pnpm changeset` entry for `praetorium.gg`: `minor` for a new capability, `patch` for a fix, and one sentence saying what a player sees, not how it was done. What's new and the update notice show these sentences to players. Changes players cannot notice need no changeset and deploy on merge without one: documentation, tests, refactors, tooling, CI, deployment and images, analytics and error reporting, and server internals such as caching, memory, or query counts. Merging a changeset to `main` triggers the version update, changelog, tag, and GitHub Release in a release commit on `main`, without a release pull request; [Hosted deployment](docs/deployment.md#delivery) describes it.

Report vulnerabilities through [SECURITY.md](SECURITY.md).
