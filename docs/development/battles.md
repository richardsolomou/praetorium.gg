# Battles

`src/core/battle.ts` contains the battle domain. `src/server/service.ts` connects it to persistence and realtime updates.

## Command log

- Store commands, not derived battle state. `reduceBattle` derives the score, round, phase, and unit state.
- Use `validate` as the only command-legality check. The server and `battleView` both depend on it.
- Read the log, validate the command, and append it in one `Repository.submit` transaction.
- Require `expectedSeq` on each command. Return `stale` when it does not match. Do not resend the command automatically with a new sequence number.
- Return the updated seated screen with a submitted command. `useCommand` writes that screen to the query cache before another command can use it.
- Implement every new `Command` kind in both `validate` and `apply`. Their exhaustive checks make missing cases fail the build.

Undo appends an `undo` command that names the latest active command. It does not delete history. Either player can undo the latest command, then continue rewinding active commands across turn boundaries.

Live commands may name the player or army they affect, so anyone seated at the table can keep either side moving. The log still records the player who submitted the command, and reports name both players when they differ. Concessions remain personal. Undealt tactical cards and hidden missions remain private. When a turn changes hands, the incoming side captain settles any scoring owed by the previous turn before another player can advance their command phase; that acknowledgement is coordination metadata rather than a report entry or undo target.

Setup settings, roster replacements, formation choices, painted-army bonuses, concessions, reopening, and setup resets are commands too. A reset clears rosters and battlefield choices without erasing the audit trail or the configured game size, mission pack or solo format. A finished battle remains reopenable; deletion is the only destructive operation and is restricted to the account that created the battle.

The current setup section is also a command-derived shared value. When one seated player moves forward or back, realtime updates move every device to that section; setup navigation is never private browser state.

Deployment and terrain are one battlefield choice. The three layouts for the armies' force dispositions each bind a deployment pattern to exact terrain geometry; `set-battlefield` records both IDs atomically. The setup and live tracker render that same plan, and a selected layout without its pinned geometry cannot start.

Solo practice battles have one signed-in participant and do not invent a guest or duplicate player identity. That participant remains the active player when a turn ends. Their link has no joinable seat.

A 2v1 battle has one player on the first side and two allied players on the second. Allies share a turn, command points, mission cards, and victory points. Each ally still attaches and controls a separate roster and its units.

## Cards

What an army brings is not a choice a player makes twice. The stratagems are the detachment's own plus the core ones every army has, and its primary comes from its ordered force-disposition matchup against the opposing side — both are recorded by `set-prep` as soon as they are known rather than offered as a picker. A solo battle pairs its one disposition against itself so that it still has a mission to score.

Secondaries are tactical unless a player says otherwise: the hand starts empty, the deck is the whole pack, and the tracker asks for the draw at the top of that player's command phase. Fixed play is the alternative, and the only case where cards are chosen up front.

## Views and visibility

`battleView` is the only place that decides what a player can see. Routes and realtime messages must not build a second view. An opponent can see drawn tactical missions but never the cards remaining in another player's deck.

A read never claims a battle seat. `PraetoriumService.screen` returns an invitation until the player sends the join mutation. This prevents link-preview crawlers from taking a seat.

## Realtime updates

- Realtime messages contain only the battle ID. The client refetches the battle through the normal read path.
- `/api/realtime/token` requires an account and a seat in the requested battle.
- Realtime channels use the internal battle ID, not the invitation token.
- A second channel is named after a player, so the list of battles hears about a battle the player has not opened yet.
- Every channel prefix needs a namespace in `realtime.json`. Centrifugo rejects a subscription to a prefix it was not configured with.
- Centrifugo subscription state provides presence. Do not store presence in SQLite.
- Caddy and the Vite development proxy serve Centrifugo on the app origin. Keep `connect-src 'self'`.

## Server boundaries

- Run one application replica while SQLite is the database.
- Wrap server-function reads with `rpc()` and mutations with `mutationRpc()`.
- Keep `/api/health` outside canonical-host redirects so container health checks remain local.
- Keep sign-in `next` values as paths on this instance. Absolute redirect targets create an open redirect.

## Accounts

Battle seats, commands, saved lists, collections, and friendships reference `user.id` directly. Names and profile pictures remain account data, so profile edits appear everywhere without synchronizing a second identity.

Shared battles can only be created with mutually confirmed friends. Friend requests are directional until the recipient accepts; either player can later remove the connection. Solo battles need no friendship.

Better Auth owns the `user`, `session`, `account`, `verification`, and `rateLimit` tables. Add product data to Praetorium tables instead of changing those schemas.

## Concurrency limit

Starting the battle is not undoable: `begin-battle` leaves nothing for `undo` to name. Player-scoped commands may carry a `playerId`; omitting it retains the submitting player's meaning for existing log entries. Roster selection remains the owner's choice, and concessions cannot be submitted for another player.

`expectedSeq` applies to the full battle log. Independent commands from both players can still race, and one player may need to submit again. A stale or refused command discards the rest of the UI batch built on the same sequence, while commands produced by a newer realtime screen remain queued. Keep this behavior until commands declare narrower dependencies. Do not remove `expectedSeq`.

## Tests

`src/core/battle.test.ts` covers turn order, ownership, visibility, undo, solo play, resets, concessions, reopening, stratagem costs including the ones the board makes dearer, tactical decks, and battle settings. `src/server/service.test.ts` covers persistence, deletion permissions, and concurrent submissions against SQLite. `src/client/sides.test.ts` covers the fold from seats to sides, and `e2e/team-battle.spec.ts` drives three devices through a 2v1 to prove the allied pair shares one pool.
