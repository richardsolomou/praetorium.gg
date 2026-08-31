# Praetorium — Agent Guide

Read [README.md](README.md) for what the product is and [CONTRIBUTING.md](CONTRIBUTING.md) for how to run and check it. This file is the operational detail that is not obvious from either — and the rules that have already been learned the expensive way.

## Product boundary

Live state for one game of Warhammer 40,000 between opposing sides of up to four friends, the list building that feeds it, and simple organized-play registration with sealed roster reveal. A battle is watchable by default and a home page shows what an instance is playing, so an arriving player sees a game in progress rather than an empty shell. Forming a battle still needs a mutual friendship or a revealed league event, and the social scope stops there: no chat, feeds, groups, or matchmaking. No rules encyclopedia and **no game data in this repository** — an instance fetches the community catalogues itself.

Praetorium is presented as free and open source software that anyone can read, run and contribute to. That, rather than secrecy, is the promise the marketing makes.

## Where the detail lives

Each of these is a short read, and the one that matches what you are touching is worth reading in full before you touch it:

| Working on                                 | Read                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Points, legality, the picker, saved lists  | [docs/development/catalogue-data.md](docs/development/catalogue-data.md)                                     |
| The battle log, phases, undo, live updates | [docs/development/battles.md](docs/development/battles.md)                                                   |
| Leagues, entry approval, roster sealing    | [docs/development/leagues.md](docs/development/leagues.md)                                                   |
| Stratagems, missions, scoring              | [docs/development/game-rules.md](docs/development/game-rules.md)                                             |
| Any screen                                 | [docs/development/interface.md](docs/development/interface.md)                                               |
| Product scope and interface design         | [docs/product-design.md](docs/product-design.md)                                                             |
| Deploying, or the preview environments     | [docs/deployment.md](docs/deployment.md), [docs/development/pr-previews.md](docs/development/pr-previews.md) |
| The iOS or Android application shell       | [docs/development/mobile.md](docs/development/mobile.md)                                                     |
| Product analytics, errors, logs            | [docs/development/telemetry.md](docs/development/telemetry.md)                                               |

## Rules that hold everywhere

- **No game data lives in this repository.** `catalogue/sources.json` defines upstream locations. Active revisions, checksums, and bytes live in verified snapshots outside Git; `catalogue-data/` is fetched and gitignored.
- **Verify fetched data before rendered work.** Confirm the current snapshot contains every source the feature needs, inspect the exact data path instead of a fallback, and never claim parity from a degraded rendering.
- **Verify responsive roster changes before and after opening a unit.** Use the reported viewport and assert that the document and each affected pane have no horizontal overflow; a correct open pane does not prove the unopened roster is correct.
- **Verify loading frames before hydration.** A hydrated query cache does not prove the first frame is stable: inspect the JavaScript-disabled page at each responsive layout, reserve the final geometry for every asynchronous region, and verify first navigation separately from hard requests.
- **Test native WebView authentication with WebView headers.** Include a stale cookie and a missing or null `Origin` header. Browser headers do not represent WKWebView requests.
- **Test server request adapters with a foreign `Request` implementation.** Do not pass a framework request to `new Request(request)`. Rebuild it from its URL, fields, and body.
- **Test native authentication before TestFlight.** Run the container-backed proof handoff journey and a release-mode iOS simulator build. A TestFlight tester must not be the first person to execute an app-owned callback, proof exchange, cookie redirect, or WebView refresh.
- **Check the full loadout for duplicate controls.** When the catalogue and rules source can describe the same option, inspect below every model card and assert that the option appears once across the entire pane; a cropped model card can hide a second loose wargear choice.
- **`src/core` is the domain and stays free of IO and framework imports** (zod is its one sanctioned dependency, enforced by lint). `battle.ts` is the whole game — the log, `validate` and `apply` — with `battleView.ts` deciding what a player may see and `battleReport.ts` putting the log into English. `tableShape.ts` names the three shapes a table can take, for every surface that asks for one. `catalogue.ts` and `evaluate.ts` read and price the community data, and `roster.ts` turns a saved pick back into a unit with `definitions.ts`, `collective.ts`, `selection.ts`, `expand.ts`, `unitSize.ts`, `unitChoices.ts`, `unitSpread.ts`, `modelKinds.ts` and `wargear.ts` beneath it. Oxlint enforces the import boundary.
- **Never guess.** The evaluator puts what it does not understand into `unhandled` and fails a condition group closed; an unrecognised stratagem timing becomes `unlimited`; an unplaceable import is named back to the player. A confidently wrong answer is worse than an honest gap, and every rule in the topic docs is a variation on this.
- **State is folded, never stored.** A column holding a score, a phase, a round or a mission is a second copy of something the log or the lists already say, free to disagree. This is also why nothing caches a battle: a cached fold is that second copy with a shorter life.
- **Postgres holds everything; Valkey is optional and holds nothing that matters.** `DATABASE_URL` is required and is the only store to back up. `VALKEY_URL` carries sessions, the auth limiter and Centrifugo's engine, and only exists so more than one replica can run — an instance without it is a supported single-replica deployment. Every repository method is async, and a query per row is a round trip per row: batch with `inArray` and keep the reads in `src/db/repository.ts`.
- **One implementation of every decision.** `validate` alone says whether a command is legal, `battleView` alone decides what a player may see, `seatedScreen` alone assembles a seated view, `sides` alone folds seats into the two sides the interface draws, and `violations` alone decides whether a list is legal. Two implementations of one question is the bug this design exists to prevent.
- **League sealing is a legality boundary.** Enforce global rules the catalogue may not express when the snapshot is sealed: every roster outside 2v2 has exactly one eligible Warlord, while a 2v2 team has exactly one between its two rosters. Freeze catalogue-derived Warlord eligibility with the snapshot and revalidate persisted Warlord facts at reveal.
- **One seated device can referee the whole battle.** Every required live action prompt must be available from every seated player's device for either side. Preserve genuinely hidden choices inside the prompt with an explicit handoff rather than withholding the action from the device.
- **Nothing is typed that can be picked.** Stratagems, missions, secondaries, loadouts and list names all come from the data. The only free text is a player's own name. If a feature asks a player to type a game fact, the data source is the thing to fix.
- **A battle names its table when it is created.** `createBattle` refuses without an opponent and seats every named player in the same transaction. There is no invitation, no open seat, no join, and no way for a link holder to become a player — so the seat count always equals `battleCapacity`, and setup never changes the table shape.
- **An account is the only way to be anyone here.** A battle, a saved list and every command in a log point directly at a `user`. There is no guest path and nothing is kept in the browser. Reading is the exception: watching a battle and reading the home page need no account, because a product nobody can look at cannot show anybody why to join it.
- **A name is not a battle.** A player's profile is open to anybody; what `battleAudience` withholds is their games. Gating a name that is already on the leaderboard and on every watchable battle only made links that led nowhere.
- **`battleAudience` alone decides who may watch a battle.** A player answers once, in `battle_sharing`, and a battle takes the narrowest answer of everyone seated in it — so one player saying private makes the battle private for the table. The home-page feeds, the standings and the screen a link resolves to are the same question and must all read that one answer. Absence of a row is public: the default lives in `src/core/battleAudience.ts` and nowhere else. Watching is read-only and never claims a seat.
- **A standing is counted, never stored.** A leaderboard row is always a player, and a faction table ranks the players who fielded it rather than giving the army a record of its own — one `standings` call with a filter, so the tables cannot disagree. It counts finished battles anyone may watch, over a bounded window and a bounded number of logs; a concession loses whatever the points said, and battles involving a practice opponent do not count. Holding the answer for a minute is allowed because it is derived; a battle screen may never make that trade.
- **Server functions wrap reads in `rpc()` and mutations in `mutationRpc()`** — a thrown `Response` otherwise reaches the client as a successful result, and mutations must check their origin before state access. CSRF protection is per-function, not middleware.
- **UI is shadcn (Base UI) under `src/components/ui`**, generated by `pnpm dlx shadcn@latest add` and excluded from lint. Treat as vendored: never hand-patch, wrap instead.
- **Public documentation is cloud-first and portable.** Present `praetorium.gg` as the primary supported product. Keep self-hosting guidance accurate but secondary, and exclude provider-specific infrastructure, hostnames, credentials and maintained-deployment details.
- **The points ratchet is a ratchet.** `just points` matches 100% of the generated reference checks. A lower result is a regression unless the generated check set changed and the new baseline is explained.

## Commands

`just` lists them. `just check` is the gate, `just dev` runs the app and Centrifugo together, and `just e2e` drives real browsers against the container image. Each recipe wraps the `pnpm` script underneath, which is what CI calls. See [CONTRIBUTING.md](CONTRIBUTING.md) for the rest, including the two e2e traps that have each cost a round of fixes.

## Changesets and releases

Run `pnpm changeset` for released application behavior: `minor` for new capability and `patch` for fixes, with one imperative user-visible sentence. Documentation, tests, refactors, and tooling-only changes do not need one. A changeset merged to `main` releases immediately by updating the version and changelog and creating the matching tag and GitHub Release.
