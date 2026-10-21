# Contributing to Praetorium

Keep changes small and include tests for new behavior and failure paths. Discuss changes to product scope in an issue first. Coding-agent rules are in [AGENTS.md](AGENTS.md).

## Start the app

Install Node 24.x, pnpm 12.13.0, just 1.58.0, and SpacetimeDB CLI 2.12.0, then run:

```sh
just install
just dev
```

`just dev` prepares a missing catalogue and prints the URL of a persistent Vite server; leave it running while testing. No private credentials are needed: setup builds from pinned public sources when the release snapshot is unavailable, omitting only historical editions stored exclusively in the private bucket. Use `just dev-status`, `just dev-stop`, and `just dev-restart` to manage only this worktree's stack. [Running locally](docs/development/running-locally.md) covers catalogue preparation, local databases, and individual commands.

## Check a change

Before committing, format the touched files and run checks that cover the changed behavior and its callers. For a small application change, run lint, type checking, the relevant unit or integration tests, and the complete affected browser scenarios, including reloads and restored state. Use `just test-unit <test-file>` for unit tests, `just test-integration <test-file>` for database and service boundaries, and `just e2e <spec-file>` for browser flows. [Running locally](docs/development/running-locally.md#browser-tests) covers failure artifacts, repeated test-only debugging, build reuse, and startup timings. Documentation-only changes need formatting and Markdown lint. Run `just points` after points or roster-legality changes.

CI runs the `just check` steps as parallel lanes (static checks, unit tests, integration tests, build with type checking) and the browser suites. `just check` includes formatting, lint, documentation and database checks, a production build, type checking, and tests; run it locally for dependency, build, startup, or broad changes, or when investigating a CI failure. Do not routinely duplicate the complete CI suite locally for a small change. Once a check passes, rerun it only when a subsequent edit affects what it checks or a failure leaves its result uncertain.

For rendered changes, inspect the running preview at the relevant widths and exercise the complete behavior. Repeat on the hosted preview when the change depends on hosted configuration or when local and CI evidence leave a deployment-specific question. After release, verify the deployed revision and health; repeat the feature flow when it depends on production services.

Browser tests wait for page elements rather than `networkidle` on live battle pages. Locate unit cards with `data-unit`, roster rows with `data-roster`, and players with `data-person`; scope assertions to the card or row so a menu item cannot satisfy them before the change takes effect.

## Pull requests and releases

Use a conventional commit title and the [pull request template](.github/pull_request_template.md). Branches receive a disposable [preview](docs/deployment.md#pull-request-previews).

A change players can notice needs a `pnpm changeset` entry for `praetorium.gg`: `minor` for a new capability, `patch` for a fix. What's new and the update notice show each entry to players as written, so it is one sentence saying what a player can now see or do, not how it was done. Before adding one, ask whether a player reading What's new would notice the change or care about it; if not, add none. When a change mixes visible and technical work, the entry describes only the visible part. Entries never mention telemetry, analytics, traces, metrics or logs; caching, memory, workers or server functions; deploys, migrations or backups; services such as PostHog or SpacetimeDB; file names; or integrations players do not use themselves, such as AI assistants. Changes players cannot notice need no changeset and deploy on merge without one: documentation, tests, refactors, tooling, CI, deployment and images, analytics and error reporting, and server internals such as caching, memory, or query counts. A faster screen is visible; faster builds, deploys or server internals are not. Merging a changeset to `main` triggers the version update, changelog, tag, and GitHub Release in a release commit on `main`, without a release pull request; [Hosted deployment](docs/deployment.md#delivery) describes it.

Report vulnerabilities through [SECURITY.md](SECURITY.md).

## Managed dependencies and tools

Select configured integrations and tools in `ras.config.ts`. RAS owns their tested versions and supplies the Vite plugins, Tailwind imports, compiler settings, and linter presets for the selections. Keep app-specific Vite overrides in `defineViteConfig` from `ras-stack/vite`; the app still imports `src/styles.css`. Plain libraries such as Zod remain in `package.json`. Selected packages are ordinary application dependencies, with build/test tools and type definitions in development dependencies. RAS shares runtime SDKs through optional peers. `pnpm-lock.yaml` is the only lockfile. The application Query client uses `createQueryClient` from `ras-stack/query` while retaining its mutation callbacks and cache policy.

Run `pnpm exec ras sync` after changing selections. RAS writes exact runtime and development dependencies into the ordinary manifest, records their ownership in `ras.managedDependencies`, regenerates committed `.ras/` presets, maintains Dependabot ignores, and runs pnpm install. Commit the resulting manifest, configuration, policy files, and lockfile. Fresh clones and CI use ordinary `pnpm install --frozen-lockfile`; `ras sync --check` detects unsynchronized selections without writing.

Upgrade the complete stack with `pnpm exec ras update`, optionally followed by a release version or tag. The command runs the target release's sync and native installation. Correct an installation failure and rerun the same command. Plain libraries remain application-owned. Consumer lockfiles pin transitives for frozen installs; deliberate application updates can still move shared transitives.

Dependabot ignores RAS and selected package names through generated `Managed by RAS.` entries. Existing handwritten rules remain intact. These ignores cover the entire root npm rule, including the same names in other workspace manifests; independent upgrades for those names require a deliberate update. Vulnerability alerts remain visible, and managed security fixes require a coordinated RAS upgrade.

This draft pins the published `ras-stack@5.0.0-next.1` candidate. Replace it with the stable v5 release and run `ras sync` before merging.
