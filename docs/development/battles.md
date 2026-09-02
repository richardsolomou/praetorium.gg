# Battles

`src/core/battle.ts` owns the log, `validate`, and `apply`. `battleView.ts` controls visibility. `battleReport.ts` renders the log. `src/server/service.ts` connects the domain to storage and realtime updates.

## Command log

- The log stores commands rather than derived battle state. `reduceBattle` derives the score, round, phase, and unit state.
- `validate` is the only command-legality check used by the server and `battleView`.
- `Repository.submit` reads the log, validates the command, and appends it in one transaction.
- Every command carries `expectedSeq`. A mismatch returns `stale`, and the client does not automatically resend the command under a new sequence number.
- A successful submission returns the updated seated screen. `useCommand` writes that screen to the query cache before another command can use it.
- Every `Command` kind has a case in both `validate` and `apply`; their exhaustive checks make an omitted case fail the build.

Undo appends an `undo` command that names the latest active command. It does not delete history. Either player can undo the latest command, then continue rewinding active commands across turn boundaries.

A scoring-dialog confirmation is one `score-settlement` command, including every primary and secondary payout and any achieved-card status. Its report entry and undo target are therefore the whole settlement rather than each score inside it.

Live commands can name the affected player or army. Any seated player can operate either side, including bringing an army, settling its cards, and selecting or revealing its Secret Mission. The log records the submitting player. Concessions remain personal.

What the active side still owes before a turn moves on — cards to draw or review, a previous turn to settle, mission scoring, a tactical hand, or a secret mission to answer — is a shared prompt and an advance guard. Any seated player can complete it for either side, so the guard prevents omissions without preventing one person from refereeing the table.

Every required live prompt is shared. A phase or turn advance opens the same scoring and tactical-discard sequence on every seated device, and either player may complete it once. Tactical draws and prior-turn scoring work the same way. Prompt requests and acknowledgements are folded from the log so reloads and realtime updates preserve them, but they are not battle report entries or undo targets.

Every required live prompt also carries the latest undo action. Rewinding into an earlier scoring, discard, draw, or Secret Mission prompt therefore leaves undo available to continue through the preceding actions.

After a turn changes, the prior-turn scoring owed to the incoming side is settled before its tactical draw. A helper cannot dismiss an apparently empty settlement because their view may be withholding a hidden mission; only its own side can conclude that no private work remains. A side of practice opponents has no such seat, so the table playing it concludes that instead.

Losing models is a command like any other. `wound-unit` takes models off a unit one at a time, `damage-unit` takes wounds off the model currently taking them, and `set-unit` takes the whole unit. None of the three can disagree with the others, because what a unit has left is one number of wounds and where the model line falls inside it is division: `apply` folds a damage command to `alive` and `damage` together, and losing the last wound is losing the model is losing the unit. All three are in the report and all three are undoable, and either seated player may record either army's losses — nothing about a unit is hidden from anyone.

What one model of a unit can take is frozen into the log by `attach-roster`, beside its points and its model count, and is read from the catalogue exactly once — at the moment the list is attached, never on the pricing path the builder runs on every keystroke. A datasheet whose kinds of model state different wounds records none: a unit is one row here, so there is no honest single answer for a sergeant standing with his veterans, and `validate` refuses `damage-unit` for it rather than picking one of them. Those units, and every battle logged before this was recorded, are counted in models alone.

A roster attached to a battle is a historical snapshot. Battle-qualified roster links use the same read-only roster presentation for its frozen selections, grouped unit cards, loadouts and attachments from the command log rather than the mutable saved roster, so later edits or deletion cannot rewrite the battle. Seated players and revealed-event spectators may open that link because both can already read the snapshot in the battle view. Applied datasheet details are rebuilt from those selections against the instance's verified catalogue. Older logs without selections show their frozen cards, and logs without roster-card details show their submitted text.

The Armies setup step loads saved-roster summaries when the table reaches it. Choosing one sends only its ID; the server checks ownership, loads its picks, reprices it, freezes its wounds, and refuses points, detachment, disposition, or catalogue legality errors before appending the snapshot. Incomplete catalogue validation remains a warning and does not prevent play. Plain-text rosters remain usable when no catalogue data is available.

A battle created from a revealed league event starts with the selected accepted entrants seated and their exact stored event snapshots attached. A 1v1 seats two equal-size entries. A 2v1 seats one solo-size entry against two allied-size entries, whichever role opened the battle. A 2v2 seats the creator beside their fixed teammate against the selected opposing fixed team; every roster is half the 2,000-point force size. A server-only `lock-league-rosters` command records the league and event tokens in the fold and prevents any selected roster, or the battle size and sides that validate them, from changing. The event page is the authority for starting the battle, so league opponents do not also need a friendship.

Setup settings, roster replacements, formation choices, painted-army bonuses, concessions, reopening, and setup resets are commands too. A reset clears rosters and battlefield choices without erasing the audit trail or the configured game size, mission pack or format. A finished battle remains reopenable; deletion is the only destructive operation and is restricted to the account that created the battle.

The current setup section is also a command-derived shared value. When one seated player moves forward or back, realtime updates move every device to that section; setup navigation is never private browser state.

Deployment and terrain are one battlefield choice. The three layouts for the armies' force dispositions each bind a deployment pattern to exact terrain geometry; `set-battlefield` records both IDs atomically. The setup and live tracker render that same plan, and a selected layout without its pinned geometry cannot start.

A 2v1 battle has one player on one side and two allied players on the other. Which side the pair is on is the creator's to choose: `createBattle` takes an `allyId` who joins their side and `opponentIds` who face them, so either player of an allied pair can be the one who opens the game. The creator always keeps the first seat on side 0, because deleting a battle is theirs alone and the earliest seat on that side is what says so — an ally sits on side 0 too, so the side by itself does not.

The battle index loads eligible opponents when the New battle dialog opens and game references only when the player submits it. Manual creation offers one Solo vs pair table shape, then asks whether the opener is solo or on the pair before showing only the seats that role needs. A live two-side preview confirms who will sit together. Returning to an existing battle does not need either read.

Allies share a turn, command points, mission cards, stratagems, and victory points. Each ally still attaches and controls a separate roster and its units. A four-seat Doubles battle has two armies on both sides but still only one resource and scoring state per side.

## Practice opponents

An instance seats two practice opponents: accounts with no credentials behind them, so neither can ever sign in. Playing one is therefore an ordinary 1v1, and a 2v1 with one in it is an ordinary 2v1 — there is no practice format, only who is in the seats. `practice_opponents` names them and the seat query marks them `automated`.

Everything they need follows from having no player behind the seat:

- They need no friendship. `PraetoriumService.opponents` answers "who may this player open a battle with" once, for both the picker and the check that guards creation, and they are excluded from the strangers the friends page offers.
- They own no lists. The table brings the army a practice opponent fields from its own library, through `attach-roster` naming that seat, and settles its cards through `set-prep` naming its side.
- Their cards are the table's to play. Every seated device can deal their hand and settle their turns.
- They never concede, and nothing badges their seat: the account is named after what it is, so saying so again told nobody anything.

`draw-secondary` and `draw-secondaries` name their side, and the server resolves whose deck to deal from through `commandArmy` rather than from the submitting player, so cards cannot come off one deck and be recorded against another.

There is no solo format. A battle is between two sides, and a side nobody signs in to is what practice means here. Logs from before that carry a `solo` flag in their `configure-battle` command; the schema no longer reads it, so it is dropped on the way in. Those battles keep folding — the round ledger and the turns still come out right for a log with one seat — but a one-seat battle can no longer be started, and a matchup with only one disposition has no mission, so `seatedScreen` leaves the primary each side's own `set-prep` recorded rather than replacing it with nothing.

## Cards

What an army brings is not a choice a player makes twice. The stratagems are every detachment the side fields plus the core ones every army has, and its primary comes from its ordered force-disposition matchup against the opposing side — both are recorded by `set-prep` as soon as they are known rather than offered as a picker. Mission cards freeze their server-verified payouts and timing into that command, so a rules refetch cannot change or erase a live battle's next scoring moment.

A side is one stratagem pool, so a 2v1 pools both allies' detachments into it, keyed by the dataset's own stratagem id. Only the seat the domain folds a side's resources onto writes that pool: `set-prep` targets the side captain, and letting both allies write their own left the survivor down to whichever request landed last. `sideStratagems` in `src/client/sideRules.ts` assembles it, and `armyRulesRequest` beside it is the one derivation of what an army's rules are looked up by.

Secondaries are tactical unless a player says otherwise: the hand starts empty, the deck is the whole pack, and the tracker asks for the draw at the top of that player's command phase. Fixed play is the alternative, and the only case where cards are chosen up front.

Two cards are owed every one of a side's own turns, on top of whatever earlier cards are still unresolved — nothing is topped back up to a fixed size, and an unscored card is never replaced by drawing. The client requests every card owed for the turn together. The server chooses those cards while it holds the battle lock and stores the draw as one command. The server ignores the client's placeholder cards. Undo therefore returns the complete draw together, while a one-card draw — the other half already dealt, or a card put back mid-turn freeing its slot again — remains a one-card command.

Undoing a logged draw returns hidden random state to the deck, so both the draw prompt and the main turn control confirm that consequence first. Cancelling the confirmation does not append a command.

## Views and visibility

`battleView` in `src/core/battleView.ts` is the only place that decides what a player can see. Routes and realtime messages consume that view rather than building another.

One thing in the game is genuinely hidden: the identity of a fixed Secret Mission played face down, until it is revealed. Everything else about the cards is public, including both tactical decks, because every draw, put-back and discard is named to both sides in the report. After a Secret Mission is selected, its side's remaining deck is withheld from the opposing side because the public pack minus that deck would identify the hidden card.

A read never claims a battle seat, and nothing else does either. A battle names its whole table when it is created: `createBattle` refuses without an opponent, and `insertBattle` seats every named player in the same transaction as the battle row. There is no invitation, no open seat and no join mutation — a link is a way to read a battle, never a way into one. That also settles the link-preview crawler, which now has nothing it could take.

Because the seats are filled at creation, the number of them always equals `battleCapacity`. Setup never changes the table shape: the Format step carries `teamBattle` and `playerCount` forward untouched, and who is playing is decided in the create dialog.

## Who may watch

`src/core/battleAudience.ts` is the only place that decides who may read a battle they hold no seat in. A player stores one answer in `battle_sharing` — anyone, friends, or nobody — and a battle takes the narrowest answer of its seats, so one player choosing private makes the battle private for everyone at that table. A player with no row is public; the default lives in the domain rather than as a column default, so there is one copy of it.

The home-page feeds and battle links both read that fold. `Repository.publicBattles` and `battlesByFriends` express it as the absence of a seat that refused, because a player who has never answered has no row to agree with. `PraetoriumService.mayWatch` folds the same answers for one battle, and only reads friendships when the fold actually turns on one.

`screen` answers one of three ways. A seated player gets the battle. Anyone the fold allows gets the read-only spectator screen, including a signed-out visitor, since a public battle found on the home page has to open. Everyone else gets `unavailable`, which offers sign-in rather than a flat refusal — a seated player whose session lapsed reaches it too, and telling them their own battle does not exist would be a lie.

## Home-page activity

The home page shows three lists of battles. A player sees their own unfinished games, their friends' games, and the public ones; a visitor with no account sees the public ones. The server removes the viewer's own battles from the public list rather than the client filtering them, so a page of ten is ten rows the reader has not already seen above.

The friends' and public lists are ordered by when a battle was started, newest first, and carry finished games alongside running ones — they are read to find a game to watch or to read back through. Ordering them by activity made the page reshuffle under a reader whenever anybody anywhere took a turn, and buried a battle that finished an hour ago beneath one nobody had moved in since. A player's own list still orders by activity, because that one is for getting back to a game rather than browsing.

The feeds poll rather than subscribe. A player's own battles are announced over realtime because their device holds a seat, but nothing names a reader of somebody else's table, and a channel every visitor subscribed to would broadcast the whole instance for a list that reads fine a few seconds late.

## Realtime updates

- Realtime messages contain only the battle ID, plus the log's new sequence number when one command caused them. The client refetches the battle through the normal read path — never state from the message — and a client whose cached screen already carries the announced sequence skips the refetch it would only repeat, which is how the submitter avoids fetching the screen `submit` just returned. A subscription token carries its subject and its channel and nothing else — nothing on a screen is drawn from a connection, so nothing needs to be.
- `/api/realtime/token` requires an account and a seat in the requested battle.
- Realtime channels use the internal battle ID, not the shared token.
- A second channel is named after a player, so the list of battles hears about a battle the player has not opened yet. The home page listens on it for the same reason.
- Spectators poll. Nothing on a public feed names the person reading it, so there is no channel to give them.
- Every channel prefix has a namespace in `realtime.json`; Centrifugo rejects an unconfigured prefix.
- Caddy and the Vite development proxy serve Centrifugo on the app origin, so `connect-src 'self'` remains sufficient.

## Server boundaries

- A deployment with more than one replica requires `VALKEY_URL`. Centrifugo then fans out through Valkey, allowing a command handled by one replica to reach a page connected to another. A deployment without Valkey supports one replica.
- Server-function reads use `rpc()` and mutations use `mutationRpc()`.
- `/api/health` sits outside canonical-host redirects so container health checks remain local.
- Sign-in `next` values are paths on the current installation. Absolute redirect targets would create an open redirect.

## Accounts

A player's name and picture are open to anybody, signed in or not. A name is already on every battle its players allow to be watched, so gating the page showing that same name produced links that led nowhere. What a player withholds is their battles, which `battleAudience` governs. The profile page still lists only the battles the reader shares with them.

Battle seats, commands, saved lists, collections, and friendships reference `user.id` directly. Names and profile pictures remain account data, so profile edits appear everywhere without synchronizing a second identity.

Shared battles can only be created with mutually confirmed friends. Friend requests are directional until the recipient accepts; either player can later remove the connection. A practice opponent needs no friendship.

Better Auth owns the `user`, `session`, `account`, `verification`, and `rateLimit` tables. Product data belongs to Praetorium tables rather than those schemas.

## Concurrency limit

Starting the battle is not undoable: `begin-battle` leaves nothing for `undo` to name. Player-scoped commands may carry a `playerId`; omitting it retains the submitting player's meaning for existing log entries. Roster selection remains the owner's choice, and concessions cannot be submitted for another player.

`expectedSeq` applies to the full battle log. Independent commands from both players can still race, and one player may need to submit again. A stale or refused command discards the rest of the UI batch built on the same sequence, while commands produced by a newer realtime screen remain queued. This behavior remains necessary while commands lack narrower dependency declarations.

## Tests

Battle coverage is split the way the domain is. `src/core/battle.test.ts` covers setup, turn order, ownership, undo, resets, concessions, reopening, deployment and battle settings. `src/core/battleCards.test.ts` covers stratagem costs including the ones the board makes dearer, and tactical decks. `src/core/battleView.test.ts` covers visibility, units and the models inside them, and `src/core/battleReport.test.ts` covers the account of the battle. All four build their games from `src/core/battle.fixtures.ts`.

`src/core/battleAudience.test.ts` covers the fold from seats to an audience. `src/server/service.test.ts` covers persistence, deletion permissions, seating either side of a 2v1, concurrent submissions, and who each feed and each link answers, against an in-process Postgres. `e2e/home-activity.spec.ts` drives the home page from a signed-in player and a signed-out visitor at once and proves the link stops answering when the player withholds it. `src/client/sides.test.ts` covers the fold from seats to sides, `src/client/sideRules.test.ts` covers the stratagem pool a side plays with, and `e2e/team-battle.spec.ts` drives a 2v1 from each side of it to prove the allied pair shares one pool.
