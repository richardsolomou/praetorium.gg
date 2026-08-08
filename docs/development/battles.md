# Battles

`src/core/battle.ts` is the domain, `src/server/service.ts` is the only way in, and the concurrency design is the product. Read [the README](../../README.md) for why it cannot go out of step; this is what breaks if you change it.

## The log and the fold

- **`src/core/battle.ts` is the whole domain** — phases, the command union, the fold, legality, and `battleView`. It stays free of IO and framework imports. Nothing enforces that; you are the enforcement.
- **State is folded, never stored.** A column holding a score, a phase or a round is a regression: it would be a second copy of something the log already says, free to disagree. `reduceBattle` is the only way to learn what a battle currently is.
- **`validate` is the only authority on legality.** The server calls it to accept a command; the interface calls it (through `battleView`) to decide what to offer. Two implementations of "may this player do this" is the bug this design exists to prevent.
- **Reading history, judging a command and appending it happen in one transaction** (`Repository.submit`). Doing any part outside lets a command that was legal when it was checked land after one that made it illegal — exactly what two players tapping at once produces.
- **`expectedSeq` is the client's claim about what it has already seen.** A mismatch is `stale`, which is an answer and not an error: the client refetches and the player taps again. Never "fix" a stale result by re-sending with the fresh seq — that discards the condition the whole mechanism exists to enforce.
- **A command's answer carries the battle it produced** (`SubmitAnswer`), and `useCommand` writes it straight into the cache. The sender's next command is conditional on this one, and the refetch behind a command lands a round trip after the command does — so a page told to wait for it acts on a view older than its own last action: sending a seq from before it, and naming the wrong command to undo. Both were invisible on localhost and ordinary across the internet, where setting a battle up is several commands in a row. This is not the stream growing a payload: it is one answer to one caller, built by the same `battleView` a read goes through, and it is why `seatedScreen` is the only place a seated view is assembled.
- **Undo is a command, not a rewrite.** It names the newest command still standing, and only its own author may send it; the fold skips what an undo names. History is only ever appended to, so an undone command still counts towards `seq` and a stale client is still caught.
- **A new `Command` kind must be handled in `validate` and `apply`.** Both end in a `never` assignment, so adding one breaks the build rather than being silently permitted.
- **`battleView` is the only place visibility is decided.** Nothing in a battle is secret today, but hidden information — a secondary still in hand, an undeployed reserve — arrives as a field held back there and nowhere else. Route components must not reassemble a view by hand.
- **A unit is its owner's to report lost**, the same as their command points are theirs to spend. `set-unit` checks the key belongs to the sender.

## Live updates

- **Live updates are a nudge, never a payload.** `/api/events` sends `event: change` with a meaningless body; the page refetches and `battleView` decides what it may see. Putting battle state into the stream would put a second visibility decision next to the only one. `presence` is the exception and its entire vocabulary is names. The stream is players-only, and `StreamLimiter` bounds how many any player may hold open.
- **Presence lives in memory, never in SQLite.** `src/server/presence.ts` is the live state of the open streams: arriving and leaving _is_ a stream opening and closing, which is why there are no heartbeats and nothing to expire. A row would outlive the tab it describes.

## Serving

- **One process, one SQLite file, one instance.** Fan-out is an in-process `EventEmitter`. A second replica serves battles that never hear about each other's commands. Horizontal scaling means moving fan-out out of process (Postgres `LISTEN`/`NOTIFY`) _before_ adding the replica, not after.
- **Server functions wrap reads in `rpc()` and mutations in `mutationRpc()`** — a thrown `Response` otherwise reaches the client as a successful result, and mutations must check their origin before state access. CSRF protection is per-function, not middleware.
- **`APP_URL` is the canonical host, and `src/start.ts` enforces it.** `/api/health` is exempt and must stay exempt: the container checks itself over 127.0.0.1, and redirecting that would ask a different machine whether this one is alive.

## Identity

- **Reads never seat anyone.** `PraetoriumService.screen` answers an invitation to a stranger rather than joining them, because a link preview crawler must not be able to take the second chair. Joining is an explicit mutation.
- **A player is an account, and `playerForUser` is the only place one comes into existence.** `players.userId` is mandatory and unique. The row stays separate from `user` because the command log points at `players.id` and better-auth owns the shape of its own tables — so a name can change and a log still means what it meant.
- **better-auth owns its five tables** (`user`, `session`, `account`, `verification`, `rateLimit`). Their shapes come from better-auth, so never add product columns to them; `players.userId` hangs off `user.id` instead.
- **Everything needs an account, and joining a battle is no exception.** Email verification is still off deliberately: an inbox round trip at the table would be the wrong trade, and the account is there to hold your lists, not to prove who you are.
- **`next` on the sign-in page is a path on this instance and nothing else.** An invite link sends a signed-out visitor through sign-in and back to the battle, and a redirect target that could be absolute would make that an open redirect.

## Known sharp edge

Every command is conditional on the whole battle's history, so an action that could not possibly conflict — scoring your own victory points while your opponent ends a phase — can still lose a race and need a second tap. Only genuine cross-player races do: a page no longer loses to itself. The fix, when the remaining case starts annoying people, is per-command conditionality: order-dependent commands keep `expectedSeq`, order-independent ones state what they actually depend on. Removing `expectedSeq` is not the fix.

## Tests

`src/core/battle.test.ts` pins the turn sequence, the ownership rules and undo. `src/server/service.test.ts` drives the whole flow against an in-memory SQLite database and owns the race: two players holding the same seq, the loser's command staying out of the log entirely. A change to who may do what, or to when a round turns over, belongs in those files first.
