# Battles

`src/core/battle.ts` contains the battle domain. `src/server/service.ts` connects it to persistence and realtime updates.

## Command log

- Store commands, not derived battle state. `reduceBattle` derives the score, round, phase, and unit state.
- Use `validate` as the only command-legality check. The server and `battleView` both depend on it.
- Read the log, validate the command, and append it in one `Repository.submit` transaction.
- Require `expectedSeq` on each command. Return `stale` when it does not match. Do not resend the command automatically with a new sequence number.
- Return the updated seated screen with a submitted command. `useCommand` writes that screen to the query cache before another command can use it.
- Implement every new `Command` kind in both `validate` and `apply`. Their exhaustive checks make missing cases fail the build.

Undo appends an `undo` command that names the latest active command. It does not delete history. Only the original author can undo that command.

## Views and visibility

`battleView` is the only place that decides what a player can see. Routes and realtime messages must not build a second view.

A read never claims a battle seat. `PraetoriumService.screen` returns an invitation until the player sends the join mutation. This prevents link-preview crawlers from taking a seat.

## Realtime updates

- Realtime messages contain only the battle ID. The client refetches the battle through the normal read path.
- `/api/realtime/token` requires an account and a seat in the requested battle.
- Realtime channels use the internal battle ID, not the invitation token.
- Centrifugo subscription state provides presence. Do not store presence in SQLite.
- Caddy and the Vite development proxy serve Centrifugo on the app origin. Keep `connect-src 'self'`.

## Server boundaries

- Run one application replica while SQLite is the database.
- Wrap server-function reads with `rpc()` and mutations with `mutationRpc()`.
- Keep `/api/health` outside canonical-host redirects so container health checks remain local.
- Keep sign-in `next` values as paths on this instance. Absolute redirect targets create an open redirect.

## Accounts

An account maps to one `players` row through `playerForUser`. The command log uses the stable player ID, so an account name can change without changing history.

Better Auth owns the `user`, `session`, `account`, `verification`, and `rateLimit` tables. Add product data to Praetorium tables instead of changing those schemas.

## Concurrency limit

`expectedSeq` applies to the full battle log. Independent commands from both players can still race, and one player may need to submit again. Keep this behavior until commands declare narrower dependencies. Do not remove `expectedSeq`.

## Tests

`src/core/battle.test.ts` covers turn order, ownership, visibility, and undo. `src/server/service.test.ts` covers persistence and concurrent submissions against SQLite.
