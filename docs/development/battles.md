# Battles

`src/core/battle.ts` owns the log, `validate`, and `apply`. `battleView.ts` controls visibility. `battleReport.ts` renders the log. `src/server/service.ts` connects the domain to storage and realtime updates.

## Command log

- Store commands, not derived battle state. `reduceBattle` derives the score, round, phase, and unit state.
- Use `validate` as the only command-legality check. The server and `battleView` both depend on it.
- Read the log, validate the command, and append it in one `Repository.submit` transaction.
- Require `expectedSeq` on each command. Return `stale` when it does not match. Do not resend the command automatically with a new sequence number.
- Return the updated seated screen with a submitted command. `useCommand` writes that screen to the query cache before another command can use it.
- Implement every new `Command` kind in both `validate` and `apply`. Their exhaustive checks make missing cases fail the build.

Undo appends an `undo` command that names the latest active command. It does not delete history. Either player can undo the latest command, then continue rewinding active commands across turn boundaries.

A scoring-dialog confirmation is one `score-settlement` command, including every primary and secondary payout and any achieved-card status. Its report entry and undo target are therefore the whole settlement rather than each score inside it.

Live commands can name the affected player or army. Any seated player can operate either side. The log records the submitting player. Concessions remain personal. Undealt cards and hidden missions remain private.

After a turn changes, every seated player sees the prior-turn scoring owed to the incoming side and either player may settle it once. The affected side is named prominently. This acknowledgement is not a report entry or undo target. A helper cannot dismiss an apparently empty settlement because their view may be withholding a hidden mission; only its owner can conclude that no private work remains.

A roster attached to a battle is a historical snapshot. Battle-qualified roster links use the same read-only roster presentation for its frozen selections, grouped unit cards, loadouts and attachments from the command log rather than the mutable saved roster, so later edits or deletion cannot rewrite the battle. Applied datasheet details are rebuilt from those selections against the instance's verified catalogue. Older logs without selections show their frozen cards, and logs without roster-card details show their submitted text.

Setup settings, roster replacements, formation choices, painted-army bonuses, concessions, reopening, and setup resets are commands too. A reset clears rosters and battlefield choices without erasing the audit trail or the configured game size, mission pack or solo format. A finished battle remains reopenable; deletion is the only destructive operation and is restricted to the account that created the battle.

The current setup section is also a command-derived shared value. When one seated player moves forward or back, realtime updates move every device to that section; setup navigation is never private browser state.

Deployment and terrain are one battlefield choice. The three layouts for the armies' force dispositions each bind a deployment pattern to exact terrain geometry; `set-battlefield` records both IDs atomically. The setup and live tracker render that same plan, and a selected layout without its pinned geometry cannot start.

Solo practice battles have one signed-in participant and do not invent a guest or duplicate player identity. That participant remains the active player when a turn ends. Their link has no joinable seat.

A 2v1 battle has one player on the first side and two allied players on the second. Allies share a turn, command points, mission cards, and victory points. Each ally still attaches and controls a separate roster and its units.

## Cards

What an army brings is not a choice a player makes twice. The stratagems are the detachment's own plus the core ones every army has, and its primary comes from its ordered force-disposition matchup against the opposing side — both are recorded by `set-prep` as soon as they are known rather than offered as a picker. A solo battle pairs its one disposition against itself so that it still has a mission to score.

Secondaries are tactical unless a player says otherwise: the hand starts empty, the deck is the whole pack, and the tracker asks for the draw at the top of that player's command phase. Fixed play is the alternative, and the only case where cards are chosen up front.

Two cards are owed every one of a side's own turns, on top of whatever earlier cards are still unresolved — nothing is topped back up to a fixed size, and an unscored card is never replaced by drawing. The client requests every card owed for the turn together. The server chooses those cards while it holds the battle lock and stores the draw as one command. The server ignores the client's placeholder cards. Undo therefore returns the complete draw together, while a one-card draw — the other half already dealt, or a card put back mid-turn freeing its slot again — remains a one-card command.

Undoing a logged draw returns hidden random state to the deck, so both the draw prompt and the main turn control confirm that consequence first. Cancelling the confirmation does not append a command.

## Views and visibility

`battleView` in `src/core/battleView.ts` is the only place that decides what a player can see. Routes and realtime messages must not build a second view. An opponent can see drawn tactical missions but never the cards remaining in another player's deck.

A read never claims a battle seat. `PraetoriumService.screen` returns an invitation until the player sends the join mutation. This prevents link-preview crawlers from taking a seat.

## Realtime updates

- Realtime messages contain only the battle ID. The client refetches the battle through the normal read path.
- `/api/realtime/token` requires an account and a seat in the requested battle.
- Realtime channels use the internal battle ID, not the invitation token.
- A second channel is named after a player, so the list of battles hears about a battle the player has not opened yet.
- Every channel prefix needs a namespace in `realtime.json`. Centrifugo rejects a subscription to a prefix it was not configured with.
- Centrifugo subscription state provides presence. Do not store presence in the database.
- Caddy and the Vite development proxy serve Centrifugo on the app origin. Keep `connect-src 'self'`.

## Server boundaries

- More than one replica needs `VALKEY_URL`. Centrifugo then fans out through Valkey, so a command taken by one replica reaches a page connected to another. Without it, run one replica.
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

Battle coverage is split the way the domain is. `src/core/battle.test.ts` covers setup, turn order, ownership, undo, solo play, resets, concessions, reopening, deployment and battle settings. `src/core/battleCards.test.ts` covers stratagem costs including the ones the board makes dearer, and tactical decks. `src/core/battleView.test.ts` covers visibility, units and the models inside them, and `src/core/battleReport.test.ts` covers the account of the battle. All four build their games from `src/core/battle.fixtures.ts`.

`src/server/service.test.ts` covers persistence, deletion permissions, and concurrent submissions against an in-process Postgres. `src/client/sides.test.ts` covers the fold from seats to sides, and `e2e/team-battle.spec.ts` drives three devices through a 2v1 to prove the allied pair shares one pool.
