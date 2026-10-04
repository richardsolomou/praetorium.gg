# Praetorium — Agent Guide

`AGENTS.md` links to this file. Keep one project instruction source. [README.md](README.md) describes the product; [CONTRIBUTING.md](CONTRIBUTING.md) owns setup and checks.

## Read for the task

Read the relevant guide and section before changing its behavior. Read [Architecture](docs/development/architecture.md) for code placement. Topic guides own their domain and verification rules; do not copy them here or read every guide for an unrelated change. Keep guides to durable constraints, code entry points, and verification. Link to code, tests, and workflows for changing implementation details; replace stale guidance rather than appending a history of fixes. State required steps explicitly and distinguish them from descriptions of automation.

| Working on                                          | Read                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Local servers, ports, databases, browser tests      | [Running locally](docs/development/running-locally.md)                           |
| Points, legality, picker, saved lists               | [Catalogue data](docs/development/catalogue-data.md)                             |
| Battle log, phases, undo, live updates, standings   | [Battles](docs/development/battles.md)                                           |
| Leagues, entry approval, sealed rosters             | [Leagues](docs/development/leagues.md)                                           |
| Stratagems, missions, scoring, terrain, rules pages | [Game rules](docs/development/game-rules.md)                                     |
| Combat simulation                                   | [Combat simulation](docs/development/combat-simulation.md)                       |
| Screens, components, responsive verification        | [Interface](docs/development/interface.md)                                       |
| Product scope                                       | [Product design](docs/product-design.md)                                         |
| Agent and crawler reference access                  | [Agent reference](docs/development/agent-reference.md)                           |
| Hosted deployment and PR previews                   | [Deployment](docs/deployment.md), [PR previews](docs/development/pr-previews.md) |
| Native shell and authentication                     | [Mobile](docs/development/mobile.md)                                             |
| Native distribution and store setup                 | [Mobile release](docs/development/mobile-release.md)                             |
| Analytics, errors, logs                             | [Telemetry](docs/development/telemetry.md)                                       |

## Shared constraints

- Keep fetched upstream catalogues, copied rules prose, generated catalogues, and snapshots out of Git. Authored source corrections belong in `catalogue/patches/`, with minimal upstream context and verified provenance. Use the verified fetched snapshot, inspect the exact source required by the change, and report missing or unsupported semantics rather than inventing rules.
- Keep deterministic domain decisions in `src/core`, without IO or framework imports except zod. Reuse the existing authority for legality, pricing, visibility, and battle state; a second implementation of the same decision is a bug.
- Fold battle state from its command log. Do not persist a second score, phase, round, or mission that can disagree with it.
- Server reads use `rpc()` and mutations use `mutationRpc()`. Mutations check their origin before state access; CSRF protection is per function.
- Treat generated `src/components/ui` as vendored shadcn Base UI: generate through the CLI and wrap instead of hand-patching.
- Public documentation describes the supported hosted service and local contribution. The repository does not maintain a self-hosted deployment.

## Working preview

Check the thread's browser status and `just dev-status` before starting local services. `just dev` starts or reuses this worktree's persistent Vite stack and prints its URL. Leave it running when the task ends. Use its reported URL; never kill a process by a shared port or a broad process-name match. Restart only through `just dev-restart` when the product module or startup configuration changed. Application source edits use hot reload. Browser tests own disposable stacks and must not replace the interactive preview.

When the user is testing, preserve their tab and inspect in a hidden tab on the same origin. Inspect rendered changes at the relevant widths and observe a complete cycle for behavior that changes over time. Add corrections to the owning topic guide instead of growing this root file with feature-specific regression notes.
