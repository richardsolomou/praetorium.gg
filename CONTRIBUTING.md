# Contributing to Praetorium

Keep changes small, with tests for behavior that could realistically break. Discuss product-scope changes in an issue first. Agent rules: [AGENTS.md](AGENTS.md).

## Start the app

Open the repository in a GitHub Codespace or a dev container, then run `just dev`. The container has the pinned tools and runs `just install` when it is created.

To set up without a container, install Node 24.x, pnpm 12.13.0, just 1.59.0, and SpacetimeDB CLI 2.14.0, then run `just install` and `just dev`. Startup stops on any other SpacetimeDB CLI version.

No credentials are needed. See [running locally](docs/development/running-locally.md).

## Check a change

Run the checks covering your change: `just test-unit <file>`, `just test-integration <file>`, `just e2e <spec>`, and `just points` after points or legality changes. `just test-spacetime` runs the integration tests that need a real SpacetimeDB against a throwaway server and fails if any of them skips. `just check` runs formatting, lint, the database and catalogue checks, the build, typecheck and every Vitest and Python test; use it for broad changes. CI also runs the browser tests, the SpacetimeDB bindings check, points, catalogue coverage and the reference evaluation. Look at rendered changes in the running app.

## Pull requests and releases

Use a conventional commit title and the [PR template](.github/pull_request_template.md). A change players can notice needs a `pnpm changeset` (`minor` feature, `patch` fix), one entry per fix: one sentence on what a player can now see or do, with no technical terms, services, or file names. Markdown emphasis and code show as formatting on What's new. Invisible changes need none.

Report vulnerabilities through [SECURITY.md](SECURITY.md).
