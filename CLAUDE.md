# Muster — Agent Guide

Read [README.md](README.md) first for what the product does and why it cannot go out of step. This file covers what is easy to break.

## Product boundary

Live state for one game of Warhammer 40,000 between two players. Rosters are opaque text until a catalogue evaluator exists. No rules encyclopedia, no mission logic, no unit-level tracking, and no game data in this repository — an instance fetches community catalogues itself.

## Commands

- `pnpm check` — the full gate (format, lint, `db:check`, build, typecheck, tests). Build runs before typecheck because it generates `src/routeTree.gen.ts`; on a fresh clone typecheck fails until you build.
- Dev server: `DATA_DIR=./data-dev pnpm dev` (create the directory first).
- `pnpm test:e2e` builds and drives two browser contexts against the production server; `pnpm test:e2e:run` reuses the current build. Install Chromium once with `pnpm test:e2e:install`.
- Lint and format are oxlint + oxfmt, not ESLint/Prettier. Warnings are denied.
- Toolchain: Node 24.x and pnpm 11.15.0, as pinned in `package.json`.

## Load-bearing rules

- **No game data lives in this repository, ever.** `catalogue/sources.json` records where it comes from and pins a revision; `catalogue-data/` is fetched and gitignored. This is what lets the project be public without redistributing Games Workshop's content.
- **`src/core/evaluate.ts` never guesses.** A feature it does not understand goes into `unhandled`, and a condition group it cannot read fails closed. A confidently wrong points total is worse than an honest gap — an empty `and` group read as satisfied is what silently added 15 points to a third of the game.
- **A group is not a selection.** `countOf` sums what is inside a group, because the data asks a squad's size as "at least 6 selections of the Intercessors group". Treating a group as one selection prices every large squad as a small one, which was a third of all mismatches.
- **The Munitorum is the oracle, not a second opinion.** `pnpm catalogue:points` builds real units at real model counts and compares against Games Workshop's own printed points. It currently agrees on 95.0% of 1,555 checks. That number is a ratchet: a change that lowers it is a regression even if every unit test passes. Read the mismatch list before believing a refactor was safe.
- **`defaultSelection` over-counts and is not wired into the points check.** Building units with their mandatory wargear takes agreement from 95.0% down to 89.2%, so something in it adds cost the Munitorum does not. It is tested for what it does do and is the next thing to chase — do not wire it in until the number goes up rather than down.
- **Distinguish evaluator bugs from harness bugs.** The check script guesses how to place N models in a unit and reads the Munitorum's per-copy pricing ranges. Both have been wrong and both inflated the mismatch count. Before chasing a mismatch, confirm the harness built what it thinks it built.
- **Every roster records the data revision it was validated against, and a battle pins one for both.** Two clients on different revisions agree about the score and disagree about legality, which is exactly what players argue over.
- **`src/core/battle.ts` is the whole domain** — phases, the command union, the fold, legality, and `battleView`. It stays free of IO and framework imports. Nothing enforces that; you are the enforcement.
- **State is folded, never stored.** A column holding a score, a phase or a round is a regression: it would be a second copy of something the log already says, free to disagree. `reduceBattle` is the only way to learn what a battle currently is.
- **`validate` is the only authority on legality.** The server calls it to accept a command; the interface calls it (through `battleView`) to decide what to offer. Two implementations of "may this player do this" is the bug this design exists to prevent.
- **Reading history, judging a command and appending it happen in one transaction** (`Repository.submit`). Doing any part outside lets a command that was legal when it was checked land after one that made it illegal — exactly what two players tapping at once produces.
- **`expectedSeq` is the client's claim about what it has already seen.** A mismatch is `stale`, which is an answer and not an error: the client refetches and the player taps again. Never "fix" a stale result by re-sending with the fresh seq — that discards the condition the whole mechanism exists to enforce.
- **Undo is a command, not a rewrite.** It names the newest command still standing, and only its own author may send it; the fold skips what an undo names. History is only ever appended to, so an undone command still counts towards `seq` and a stale client is still caught.
- **A new `Command` kind must be handled in `validate` and `apply`.** Both end in a `never` assignment, so adding one breaks the build rather than being silently permitted.
- **`battleView` is the only place visibility is decided.** Nothing in a battle is secret today, but hidden information — a secondary still in hand, an undeployed reserve — arrives as a field held back there and nowhere else. Route components must not reassemble a view by hand.
- **Live updates are a nudge, never a payload.** `/api/events` sends `event: change` with a meaningless body; the page refetches and `battleView` decides what it may see. Putting battle state into the stream would put a second visibility decision next to the only one. `presence` is the exception and its entire vocabulary is names. The stream is players-only, and `StreamLimiter` bounds how many any player may hold open.
- **Presence lives in memory, never in SQLite.** `src/server/presence.ts` is the live state of the open streams: arriving and leaving _is_ a stream opening and closing, which is why there are no heartbeats and nothing to expire. A row would outlive the tab it describes.
- **Reads never seat anyone.** `MusterService.screen` answers an invitation to a stranger rather than joining them, because a link preview crawler must not be able to take the second chair. Joining is an explicit mutation.
- **A guest identity is durable.** The command log points at `players.id`, so an id outlives the cookie that proved it and an account can be attached to one later. Never re-key commands to anything else.
- **One process, one SQLite file, one instance.** Fan-out is an in-process `EventEmitter`. A second replica serves battles that never hear about each other's commands. Horizontal scaling means moving fan-out out of process (Postgres `LISTEN`/`NOTIFY`) _before_ adding the replica, not after.
- **Server functions wrap reads in `rpc()` and mutations in `mutationRpc()`** — a thrown `Response` otherwise reaches the client as a successful result, and mutations must check their origin before state access. CSRF protection is per-function, not middleware.
- **`APP_URL` is the canonical host, and `src/start.ts` enforces it.** `/api/health` is exempt and must stay exempt: the container checks itself over 127.0.0.1, and redirecting that would ask a different machine whether this one is alive.
- **`src/styles.css` owns the bridge from the `:root` tokens to Tailwind's colour utilities** (`@theme inline { --color-primary: var(--primary) … }`). Without that block every `bg-card`, `border-border` and `text-muted-foreground` inside the generated components silently resolves to nothing and the whole UI renders flat.
- **UI is shadcn (Base UI) under `src/components/ui`.** Generated by `pnpm dlx shadcn@latest add` and excluded from lint. Treat as vendored: never hand-patch, wrap instead.
- **The side tint is information, not decoration.** Every number on screen belongs to one player, and across a table the tint is what tells you whose it is before you have read the name. Controls appear only on the viewer's own panel, which is the ownership rule made visible.
- Migrations are generated (`pnpm db:generate`), never hand-edited once applied. `drizzle/` is copied into `.output/server/drizzle` by the build so the production server can run them.

## Known sharp edge

Every command is conditional on the whole battle's history, so an action that could not possibly conflict — scoring your own victory points while your opponent ends a phase — can still lose a race and need a second tap. The fix, when it starts annoying people, is per-command conditionality: order-dependent commands keep `expectedSeq`, order-independent ones state what they actually depend on. Removing `expectedSeq` is not the fix.

## Tests

`src/core/battle.test.ts` pins the turn sequence, the ownership rules and undo. `src/server/service.test.ts` drives the whole flow against an in-memory SQLite database and owns the race: two players holding the same seq, the loser's command staying out of the log entirely. A change to who may do what, or to when a round turns over, belongs in those files first.

Nothing in the unit suite covers what a browser does with a stream, so anything touching live updates needs driving in two real browser contexts: one page acts, the other must catch up without being touched. `e2e/live.spec.ts` is that test. Note that an open battle page holds a request open forever, so it never reaches network idle — waiting for `networkidle` there will hang until it times out. Wait for an element instead.
