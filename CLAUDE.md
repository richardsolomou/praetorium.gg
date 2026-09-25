# Praetorium — Agent Guide

Use this guide for project constraints. [README.md](README.md) describes the product; [CONTRIBUTING.md](CONTRIBUTING.md) covers setup and checks.

## Product boundary

Praetorium covers list building, live battles between up to four players, and league registration with sealed roster reveal. Battles are watchable by default, and the home page and leaderboard show watchable play. Shared battles require mutual friendship or a revealed league event. There is no chat, feed, group, or matchmaking. Rules come only from fetched community documents; **no game data lives in this repository**.

Present Praetorium as free and open source software that anyone can read, run, and contribute to.

## Where the detail lives

Read the guide for the area you are changing:

| Working on                                 | Read                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Points, legality, the picker, saved lists  | [docs/development/catalogue-data.md](docs/development/catalogue-data.md)                                     |
| The battle log, phases, undo, live updates | [docs/development/battles.md](docs/development/battles.md)                                                   |
| Leagues, entry approval, roster sealing    | [docs/development/leagues.md](docs/development/leagues.md)                                                   |
| Stratagems, missions, scoring, rules pages | [docs/development/game-rules.md](docs/development/game-rules.md)                                             |
| Combat simulation                          | [docs/development/combat-simulation.md](docs/development/combat-simulation.md)                               |
| Any screen                                 | [docs/development/interface.md](docs/development/interface.md)                                               |
| Product scope and interface design         | [docs/product-design.md](docs/product-design.md)                                                             |
| Agent and crawler reference access         | [docs/development/agent-reference.md](docs/development/agent-reference.md)                                   |
| Deploying, or the preview environments     | [docs/deployment.md](docs/deployment.md), [docs/development/pr-previews.md](docs/development/pr-previews.md) |
| The iOS or Android application shell       | [docs/development/mobile.md](docs/development/mobile.md)                                                     |
| Product analytics, errors, logs            | [docs/development/telemetry.md](docs/development/telemetry.md)                                               |

## Rules that hold everywhere

- **Combat simulation uses one compact matchup view.** Keep its inputs and previous estimates stable through edits, calculate both phases automatically, and fail closed on unsupported rules.
- **Simulator explanations distinguish printed and effective saves.** Apply AP before explaining why an invulnerable save changes nothing, and keep ineffective selections as quiet cues rather than warnings in the calculation summary.
- **The simulator picker shows distinct datasheets.** A chapter import with different leaders or support is still the same datasheet; list it under its owning faction and show a chapter copy only when the source defines a separate entry.
- **No game data lives in this repository.** `catalogue/sources.json` defines upstream locations. Active revisions, checksums, and bytes live in verified snapshots outside Git; `catalogue-data/` is fetched and gitignored.
- **Verify fetched data before rendered work.** Confirm the current snapshot contains every source the feature needs, inspect the exact data path instead of a fallback, and never claim parity from a degraded rendering.
- **Verify responsive roster changes before and after opening a unit.** Use the reported viewport and assert that the document and each affected pane have no horizontal overflow; a correct open pane does not prove the unopened roster is correct.
- **Verify loading frames before hydration.** A hydrated query cache does not prove the first frame is stable: inspect the JavaScript-disabled page at each responsive layout, reserve the final geometry for every asynchronous region, and verify first navigation separately from hard requests.
- **Test native WebView authentication with WebView headers.** Include a stale cookie and a missing or null `Origin` header. Browser headers do not represent WKWebView requests.
- **Test server request adapters with a foreign `Request` implementation.** Do not pass a framework request to `new Request(request)`. Rebuild it from its URL, fields, and body.
- **Test native authentication before TestFlight.** Run the container-backed proof handoff journey and a release-mode iOS simulator build. A TestFlight tester must not be the first person to execute an app-owned callback, proof exchange, cookie redirect, or WebView refresh.
- **Reuse managed iOS signing credentials in ephemeral CI.** Freeze credentials during local EAS builds so a clean GitHub runner cannot create or revoke Apple certificates. Expose Bundler's pinned Fastlane executable on `PATH`, because the EAS local builder invokes it directly. Automatic Xcode signing with an App Store Connect key is not a durable release path.
- **Never distribute a pull-request revision through a native channel.** Canary and stable deliveries start only after the revision is merged to `main`; pull requests only validate the delivery configuration.
- **Check the full loadout for duplicate controls.** When the catalogue and rules source can describe the same option, inspect below every model card and assert that the option appears once across the entire pane; a cropped model card can hide a second loose wargear choice.
- **Keep loadout details visible and edits consistent.** Show weapon profiles and source replacement instructions, keep alternate profiles together, and avoid duplicate controls. Verify limits and swaps for one and multiple carriers through save, reload, preview, and view mode.
- **`src/core` owns deterministic domain decisions without IO or framework imports** (except zod). `battle.ts` owns the log and command legality, `battleView.ts` controls visibility, and `evaluate.ts` prices catalogue data.
- **Never guess.** The evaluator puts what it does not understand into `unhandled` and fails a condition group closed; an unrecognised stratagem timing becomes `unlimited`; an unplaceable import is named back to the player. A confidently wrong answer is worse than an honest gap, and every rule in the topic docs is a variation on this.
- **State is folded, never stored.** A column holding a score, a phase, a round or a mission is a second copy of something the log or the lists already say, free to disagree. This is also why nothing caches a battle: a cached fold is that second copy with a shorter life.
- **Postgres holds everything; Valkey is optional and holds nothing that matters.** `DATABASE_URL` is required and is the only store to back up. `VALKEY_URL` carries sessions, the auth limiter and Centrifugo's engine, and only exists so more than one replica can run — an instance without it is a supported single-replica deployment. Every repository method is async, and a query per row is a round trip per row: batch with `inArray` and keep the reads in `src/db/repository.ts`.
- **One implementation of every decision.** `validate` alone says whether a command is legal, `battleView` alone decides what a player may see, `seatedScreen` alone assembles a seated view, `sides` alone folds seats into the two sides the interface draws, and `violations` alone decides whether a list is legal. Two implementations of one question is the bug this design exists to prevent.
- **League sealing is a legality boundary.** Enforce global rules the catalogue may not express when the snapshot is sealed: every roster outside 2v2 has exactly one eligible Warlord, while a 2v2 team has exactly one between its two rosters. Freeze catalogue-derived Warlord eligibility with the snapshot and revalidate persisted Warlord facts at reveal.
- **One seated device can referee the whole battle.** Every required live action prompt must be available from every seated player's device for either side. Preserve genuinely hidden choices inside the prompt with an explicit handoff rather than withholding the action from the device.
- **Advance battle phases through the shared E2E helper.** A separate reminder visibility check followed by a phase click races an asynchronous modal prompt.
- **The rules pages are the source's own words.** `rulesCore.ts` reads whatever documents the snapshot's datacards `core` directory declares, `ruleMarkup.ts` reads the source's markup rather than handing it to the browser, a rule is addressed by the number the source prints against it, and a number nothing prints links nowhere. The printed rulebook's photography is not republished.
- **Nothing is typed that can be picked.** Stratagems, missions, secondaries, loadouts and list names all come from the data. The only free text is a player's own name. If a feature asks a player to type a game fact, the data source is the thing to fix.
- **A battle names its table when it is created.** `createBattle` refuses without an opponent and seats every named player in the same transaction. There is no invitation, no open seat, no join, and no way for a link holder to become a player — so the seat count always equals `battleCapacity`, and setup never changes the table shape.
- **An account is the only way to be anyone here.** A battle, a saved list and every command in a log point directly at a `user`, and no row exists without one. Reading is the exception: watching a battle and reading the home page need no account, because a product nobody can look at cannot show anybody why to join it. Trying the builder is the other: a visitor's `/rosters` is the builder rather than a library, for one unsaved list held only in that tab's `sessionStorage` and priced by the same server functions, and saving it goes through sign-in, after which `saveRoster` stores it under the account by the draft's own id so a repeated claim cannot duplicate it. A session cookie scoped to `/rosters` says only that the tab holds one, so the server's first frame is the builder rather than the setup. No other game state is kept in the browser for a visitor, nothing is stored on the server before sign-in, and no server function relaxes its account check for it.
- **Battle visibility has one authority.** A profile name is public, but its battles, record, and rank are narrowed by `watchable`; `battleAudience` and `maySpectate` decide which games the reader may see. A battle uses the narrowest sharing choice of its seats, defaults to public, and watching never claims a seat. Standings are derived from bounded, watchable, finished non-practice battles, ranked by wins and then win rate.

- **Server functions wrap reads in `rpc()` and mutations in `mutationRpc()`** — a thrown `Response` otherwise reaches the client as a successful result, and mutations must check their origin before state access. CSRF protection is per-function, not middleware.
- **UI is shadcn (Base UI) under `src/components/ui`**, generated by `pnpm dlx shadcn@latest add` and excluded from lint. Treat as vendored: never hand-patch, wrap instead.
- **Public documentation is cloud-first and portable.** Present `praetorium.gg` as the primary supported product. Keep self-hosting guidance accurate but secondary, and exclude provider-specific infrastructure, hostnames, credentials and maintained-deployment details.
- **Keep the points ratchet at 100%.** A lower `just points` result is a regression unless the generated reference set changed and the new baseline is explained.
