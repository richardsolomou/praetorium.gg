# Contributing

## Layout

```text
src/core      the domain: battles, the catalogue evaluator, roster building. No IO, no framework.
src/db        SQLite through drizzle. Generated migrations, never hand-edited once applied.
src/server    services, server functions, the event stream, catalogue loading.
src/client    React components and TanStack Query.
src/routes    TanStack Router route files, which stay thin.
catalogue/    where the community data comes from — pinned revisions, no data.
```

The rule that shapes all of it: a decision is implemented once, in the lowest layer that can hold it, and everything above consults it. `validate` decides legality for both the server and the buttons; `violations` decides whether a list is legal for both the builder and the battle.

## Running it

See [docs/development/running-locally.md](docs/development/running-locally.md) for setup, the checks, the test commands, and the traps in each.

Short version: `just install`, `just catalogue-sync`, `just dev`, and `just check` before you push. `just` on its own lists every recipe.

## Changes that need more than code

- **A new `Command` kind** must be handled in `validate` and `apply`; both end in a `never` assignment, so the build tells you.
- **Anything touching points or legality** runs `just points` and reports the number. It is a ratchet.
- **Anything rendered** gets looked at in a browser, not reasoned about from the diff.
- **A schema change** is a generated migration (`just db-generate`), never an edit to an applied one.
- **Anything an operator configures** moves together: `.env.example`, `docker-compose.yml`, and [docs/deployment.md](docs/deployment.md).

## Pull requests

Titles are conventional commits. The body follows `.github/pull_request_template.md`.

Every pull request from a branch here gets [its own deployed instance](docs/development/pr-previews.md) to click through, linked from a comment on the pull request.

## Security

See [SECURITY.md](SECURITY.md).
