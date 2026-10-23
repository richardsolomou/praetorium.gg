# Praetorium — Agent Guide

`AGENTS.md` links to this file. Keep one project instruction source. [README.md](README.md) describes the product; [CONTRIBUTING.md](CONTRIBUTING.md) owns setup and checks.

## Read for the task

Read the relevant guide and section before changing its behavior. Read [Architecture](docs/development/architecture.md) for code placement. Topic guides own their domain and verification rules; do not copy them here or read every guide for an unrelated change. Large guides are a short page plus area guides; read the page, then only the area the task touches.

| Working on                                          | Read                                                       |
| --------------------------------------------------- | ---------------------------------------------------------- |
| Local servers, ports, databases, browser tests      | [Running locally](docs/development/running-locally.md)     |
| Points, legality, picker, saved lists               | [Catalogue data](docs/development/catalogue-data.md)       |
| Battle log, phases, undo, live updates, standings   | [Battles](docs/development/battles.md)                     |
| Leagues, entry approval, sealed rosters             | [Leagues](docs/development/leagues.md)                     |
| Stratagems, missions, scoring, terrain, rules pages | [Game rules](docs/development/game-rules.md)               |
| Combat simulation                                   | [Combat simulation](docs/development/combat-simulation.md) |
| Screens, components, responsive verification        | [Interface](docs/development/interface.md)                 |
| Product scope                                       | [Product design](docs/product-design.md)                   |
| Agent and crawler reference access                  | [Agent reference](docs/development/agent-reference.md)     |
| Hosted deployment and PR previews                   | [Deployment](docs/deployment.md)                           |
| Native shell and authentication                     | [Mobile](docs/development/mobile.md)                       |
| Native distribution and store setup                 | [Mobile release](docs/development/mobile-release.md)       |
| Analytics, errors, logs                             | [Telemetry](docs/development/telemetry.md)                 |

## Where knowledge goes

Before writing anything down, put it in the first place that fits; a guide is the last resort.

| What you learned                                                    | Where it goes                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| A rule a test can enforce                                           | The test                                                          |
| Why one function or file works the way it does                      | A comment on that code                                            |
| What broke and how it was fixed                                     | The commit message and pull request                               |
| How players use a feature                                           | The in-app docs (`src/client/features/docs/content`)              |
| A constraint spanning files that code can't express and still holds | The owning guide, replacing what it supersedes; name entry points |

Guides keep durable constraints, code entry points, and verification, and state required steps apart from descriptions of automation. `pnpm docs:budget` (part of `just check`) caps each guide file and the total; when a guide needs room, remove or move something rather than raising the cap.

## Shared constraints

- Keep acquisition strategy, outreach targets and drafts, personal/location context, private analytics links, and operational measurement plans in private notes. Public issues and documentation retain reproducible product problems, implementation contracts, and technical verification.
- Keep fetched upstream catalogues, copied rules prose, generated catalogues, and snapshots out of Git. Authored source corrections belong in `catalogue/patches/`, with minimal upstream context and verified provenance; a correction that adds rules text beyond a single quoted sentence is a commit on a fork branch of its source. Use the verified fetched snapshot, inspect the exact source required by the change, and report missing or unsupported semantics rather than inventing rules.
- Keep deterministic domain decisions in `src/core`, without IO or framework imports except zod. Reuse the existing authority for legality, pricing, visibility, and battle state; a second implementation of the same decision is a bug.
- Fold battle state from its command log. Do not persist a second score, phase, round, or mission that can disagree with it.
- Server reads use `rpc()` and mutations use `mutationRpc()`. Mutations check their origin before state access; CSRF protection is per function.
- Treat generated `src/components/ui` as vendored shadcn Base UI: generate through the CLI and wrap instead of hand-patching.
- Public documentation describes the supported hosted service and local contribution. The repository does not maintain a self-hosted deployment.

## Working preview

Check the thread's browser status and `just dev-status` before starting local services. Follow [Running locally](docs/development/running-locally.md#development-lifecycle): run `just dev` after any checkout, pull, or merge, use its reported URL, and run `just teardown` once the branch's pull request has merged, released or not. Never kill a process by a shared port or a broad process-name match.

When the user is testing, preserve their tab and inspect in a hidden tab on the same origin. Add corrections to the owning topic guide instead of growing this root file with feature-specific regression notes.
