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

Live commands can name the affected player or army. Any seated player can operate either side, including bringing an army and settling a side's cards during setup. The log records the submitting player. Concessions remain personal, and only a side may put one of its own cards face down or reveal it.

What the active side still owes before a turn moves on — cards to draw, a previous turn to settle, a secret mission to answer — is a prompt and never a refusal. One person refereeing for the table can do all of it, so refusing them the turn only stopped the game they were running.

After a turn changes, every seated player sees the prior-turn scoring owed to the incoming side and either player may settle it once. The affected side is named prominently. This acknowledgement is not a report entry or undo target. A helper cannot dismiss an apparently empty settlement because their view may be withholding a hidden mission; only its own side can conclude that no private work remains. A side of practice opponents has no such seat, so the table playing it concludes that instead.

Losing models is a command like any other. `wound-unit` takes models off a unit one at a time, `damage-unit` takes wounds off the model currently taking them, and `set-unit` takes the whole unit. None of the three can disagree with the others, because what a unit has left is one number of wounds and where the model line falls inside it is division: `apply` folds a damage command to `alive` and `damage` together, and losing the last wound is losing the model is losing the unit. All three are in the report and all three are undoable, and either seated player may record either army's losses — nothing about a unit is hidden from anyone.

What one model of a unit can take is frozen into the log by `attach-roster`, beside its points and its model count, and is read from the catalogue exactly once — at the moment the list is attached, never on the pricing path the builder runs on every keystroke. A datasheet whose kinds of model state different wounds records none: a unit is one row here, so there is no honest single answer for a sergeant standing with his veterans, and `validate` refuses `damage-unit` for it rather than picking one of them. Those units, and every battle logged before this was recorded, are counted in models alone.

A roster attached to a battle is a historical snapshot. Battle-qualified roster links use the same read-only roster presentation for its frozen selections, grouped unit cards, loadouts and attachments from the command log rather than the mutable saved roster, so later edits or deletion cannot rewrite the battle. Applied datasheet details are rebuilt from those selections against the instance's verified catalogue. Older logs without selections show their frozen cards, and logs without roster-card details show their submitted text.

A battle created from a revealed league starts with both accepted entrants seated and their exact stored league snapshots attached. A server-only `lock-league-rosters` command records the league token in the fold and prevents either roster, or the battle size that validates them, from changing. The league page is the authority for starting this 1v1, so league opponents do not also need a friendship.

Setup settings, roster replacements, formation choices, painted-army bonuses, concessions, reopening, and setup resets are commands too. A reset clears rosters and battlefield choices without erasing the audit trail or the configured game size, mission pack or format. A finished battle remains reopenable; deletion is the only destructive operation and is restricted to the account that created the battle.

The current setup section is also a command-derived shared value. When one seated player moves forward or back, realtime updates move every device to that section; setup navigation is never private browser state.

Deployment and terrain are one battlefield choice. The three layouts for the armies' force dispositions each bind a deployment pattern to exact terrain geometry; `set-battlefield` records both IDs atomically. The setup and live tracker render that same plan, and a selected layout without its pinned geometry cannot start.

A 2v1 battle has one player on one side and two allied players on the other. Which side the pair is on is the creator's to choose: `createBattle` takes an `allyId` who joins their side and `opponentIds` who face them, so either player of an allied pair can be the one who opens the game. The creator always keeps the first seat on side 0, because deleting a battle is theirs alone and the earliest seat on that side is what says so — an ally sits on side 0 too, so the side by itself does not.

Allies share a turn, command points, mission cards, stratagems, and victory points. Each ally still attaches and controls a separate roster and its units.

## Practice opponents

An instance seats two practice opponents: accounts with no credentials behind them, so neither can ever sign in. Playing one is therefore an ordinary 1v1, and a 2v1 with one in it is an ordinary 2v1 — there is no practice format, only who is in the seats. `practice_opponents` names them and the seat query marks them `automated`.

Everything they need follows from having no player behind the seat:

- They need no friendship. `PraetoriumService.opponents` answers "who may this player open a battle with" once, for both the picker and the check that guards creation, and they are excluded from the strangers the friends page offers.
- They own no lists. The table brings the army a practice opponent fields from its own library, through `attach-roster` naming that seat, and settles its cards through `set-prep` naming its side.
- Their cards are the table's to play. `battleView` shows a side's undrawn deck to the people playing it — its own players, or anyone at all when nobody signs in to it — and the tracker deals its hand and settles its turns from the device facing it.
- They never concede, and nothing badges their seat: the account is named after what it is, so saying so again told nobody anything.

`draw-secondary` and `draw-secondaries` name their side, and the server resolves whose deck to deal from through `commandArmy` rather than from the submitting player, so cards cannot come off one deck and be recorded against another.

There is no solo format. A battle is between two sides, and a side nobody signs in to is what practice means here. Logs from before that carry a `solo` flag in their `configure-battle` command; the schema no longer reads it, so it is dropped on the way in. Those battles keep folding — the round ledger and the turns still come out right for a log with one seat — but a one-seat battle can no longer be started, and a matchup with only one disposition has no mission, so `seatedScreen` leaves the primary each side's own `set-prep` recorded rather than replacing it with nothing.

## Cards

What an army brings is not a choice a player makes twice. The stratagems are every detachment the side fields plus the core ones every army has, and its primary comes from its ordered force-disposition matchup against the opposing side — both are recorded by `set-prep` as soon as they are known rather than offered as a picker.

A side is one stratagem pool, so a 2v1 pools both allies' detachments into it, keyed by the dataset's own stratagem id. Only the seat the domain folds a side's resources onto writes that pool: `set-prep` targets the side captain, and letting both allies write their own left the survivor down to whichever request landed last. `sideStratagems` in `src/client/sideRules.ts` assembles it, and `armyRulesRequest` beside it is the one derivation of what an army's rules are looked up by.

Secondaries are tactical unless a player says otherwise: the hand starts empty, the deck is the whole pack, and the tracker asks for the draw at the top of that player's command phase. Fixed play is the alternative, and the only case where cards are chosen up front.

Two cards are owed every one of a side's own turns, on top of whatever earlier cards are still unresolved — nothing is topped back up to a fixed size, and an unscored card is never replaced by drawing. The client requests every card owed for the turn together. The server chooses those cards while it holds the battle lock and stores the draw as one command. The server ignores the client's placeholder cards. Undo therefore returns the complete draw together, while a one-card draw — the other half already dealt, or a card put back mid-turn freeing its slot again — remains a one-card command.

Undoing a logged draw returns hidden random state to the deck, so both the draw prompt and the main turn control confirm that consequence first. Cancelling the confirmation does not append a command.

## Views and visibility

`battleView` in `src/core/battleView.ts` is the only place that decides what a player can see. Routes and realtime messages must not build a second view.

One thing in the game is genuinely hidden: a card a side playing fixed secondaries has put face down, until it reveals it. Everything else about the cards is public, because the log already says it — every draw, put-back and discard is named to both sides in the report. What a side has left in its deck is therefore withheld only from the sides playing against it, and for one reason: the pack is public, so the deck minus what is held would name the face-down card.

A read never claims a battle seat. `PraetoriumService.screen` returns an invitation until the player sends the join mutation. This prevents link-preview crawlers from taking a seat.

## Realtime updates

- Realtime messages contain only the battle ID. The client refetches the battle through the normal read path. A subscription token carries its subject and its channel and nothing else — nothing on a screen is drawn from a connection, so nothing needs to be.
- `/api/realtime/token` requires an account and a seat in the requested battle.
- Realtime channels use the internal battle ID, not the invitation token.
- A second channel is named after a player, so the list of battles hears about a battle the player has not opened yet.
- Every channel prefix needs a namespace in `realtime.json`. Centrifugo rejects a subscription to a prefix it was not configured with.
- Caddy and the Vite development proxy serve Centrifugo on the app origin. Keep `connect-src 'self'`.

## Server boundaries

- More than one replica needs `VALKEY_URL`. Centrifugo then fans out through Valkey, so a command taken by one replica reaches a page connected to another. Without it, run one replica.
- Wrap server-function reads with `rpc()` and mutations with `mutationRpc()`.
- Keep `/api/health` outside canonical-host redirects so container health checks remain local.
- Keep sign-in `next` values as paths on this instance. Absolute redirect targets create an open redirect.

## Accounts

Battle seats, commands, saved lists, collections, and friendships reference `user.id` directly. Names and profile pictures remain account data, so profile edits appear everywhere without synchronizing a second identity.

Shared battles can only be created with mutually confirmed friends. Friend requests are directional until the recipient accepts; either player can later remove the connection. A practice opponent needs no friendship.

Better Auth owns the `user`, `session`, `account`, `verification`, and `rateLimit` tables. Add product data to Praetorium tables instead of changing those schemas.

## Concurrency limit

Starting the battle is not undoable: `begin-battle` leaves nothing for `undo` to name. Player-scoped commands may carry a `playerId`; omitting it retains the submitting player's meaning for existing log entries. Roster selection remains the owner's choice, and concessions cannot be submitted for another player.

`expectedSeq` applies to the full battle log. Independent commands from both players can still race, and one player may need to submit again. A stale or refused command discards the rest of the UI batch built on the same sequence, while commands produced by a newer realtime screen remain queued. Keep this behavior until commands declare narrower dependencies. Do not remove `expectedSeq`.

## Tests

Battle coverage is split the way the domain is. `src/core/battle.test.ts` covers setup, turn order, ownership, undo, resets, concessions, reopening, deployment and battle settings. `src/core/battleCards.test.ts` covers stratagem costs including the ones the board makes dearer, and tactical decks. `src/core/battleView.test.ts` covers visibility, units and the models inside them, and `src/core/battleReport.test.ts` covers the account of the battle. All four build their games from `src/core/battle.fixtures.ts`.

`src/server/service.test.ts` covers persistence, deletion permissions, seating either side of a 2v1, and concurrent submissions against an in-process Postgres. `src/client/sides.test.ts` covers the fold from seats to sides, `src/client/sideRules.test.ts` covers the stratagem pool a side plays with, and `e2e/team-battle.spec.ts` drives a 2v1 from each side of it to prove the allied pair shares one pool.
