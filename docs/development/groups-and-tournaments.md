# Groups and tournaments

## Vocabulary

Who plays decides the kind of thing; how they play is its format. A new feature fits as a format of one of the two kinds, or it is discussed before it gets a new noun.

| Term             | Means                                                                                                                             | Code             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| group            | People who play together repeatedly, from a fixed set of friends to a shop's open night; admission settings tell those apart      | `group`          |
| tournament       | An official one-off people sign up for, with an organizer, admission and a player limit                                           | `tournament`     |
| league           | A group's round robin over weeks, with fixtures                                                                                   | `groupLeague`    |
| hidden-list game | A group's one-off game where everyone seals a list in secret before the reveal; shown on the group's overview, not a tab          | `hiddenListGame` |
| sealed event     | The engine a tournament and a hidden-list game share; never shown to players, whose copy names the tournament or hidden-list game | `sealedEvent`    |
| battle           | One game played                                                                                                                   | `battle`         |

The navigation files groups and tournaments under "Events"; "community" already means the Discord and social links.

Players never read "club", "season" or "sealed game", and copy names a tournament or a hidden-list game rather than an event; only the shared engine's refusals in `src/core/sealedEvent.ts` and `src/server/services/sealedEventService.ts` still say "event", since they serve both. `scripts/checkVocabulary.ts` fails CI on those words outside the links below.

The old words survive only where links already shared spell them: `/clubs/…` and `/leagues/…` addresses redirect, and the roster page's `?league=` and the simulator's `league` roster source still read as a sealed event.

## Sealed events

`src/core/sealedEvent.ts` owns decisions; `src/server/services/sealedEventService.ts` owns operations.

- A sealed event (`sealed_events`) is the shared engine: entries, picks, pairings and battles key on its id. Exactly one host holds it: a tournament (`tournaments`, with its own name, listing, admission, limit and admins) or a hidden-list game (`hidden_list_games`), which has none of those and is run by its group's organizers for its group's members.
- A host's token is its address and what its battles' `lock-sealed-event-rosters` name beside the event's token; a hidden-list game's is its event's. Old logs name a retired league's token, which is now its group's.
- Each retired league became a group with the same token, and each of its events one of that group's hidden-list games, so the tournaments route resolves every old league link.
- Sealing stores a repriced, legality-checked snapshot; saved-list edits never change it. Alerts are the player's, not the list's: sealing leaves them out, and a sealed event's battle fields each player's current alerts onto their snapshot (`withCurrentAlerts`).
- Before reveal, only `readsSealedRoster` and `readsAlliedSealedEventRoster` grant roster access, organizers included.
- After the first seal an event's format, size, pairing and duel points total lock; points per army, shared points and allowances may change only while every sealed list still fits (`sealedListsFit` in `spacetimedb/src/index.ts`).
- With `sharedPoints`, a pair's lists spend twice the seat's points between them, so seal, reveal, battle creation and `teamArmyProblems` each read a list beside its partner's (`sealedEventSeatRefusal`'s `pair`), and allies need not save the same points total. Sealing therefore skips a roster's own points limit (`frozenRoster`'s `sealing`); the seal command checks points for every format, a duel against the list's saved total.
- Reveal is irreversible. A Force Disposition chosen before reveal stays fixed, so a resealed list must keep it on offer.
- Battle creation copies snapshots and locks rosters in one transaction.
- A Swiss table's result locks once a later round is paired: `swissResultLocked` decides, and `submitBattle` refuses `reopen-battle` or a post-finish `undo` unless the sender runs the tournament. An organizer without a seat may send only `reopen-battle` to a finished table (`commandRefusal`'s `organizer`), and the fold applies a reopen without a seat, so the log replays it. Its players then correct the result. A correction recomputes standings and never re-pairs.
- Swiss results fold from `round_pairings` and the battles they link, never a stored score. A dropped entrant (`droppedAt`) keeps their entry and results but is never paired again; their unfinished table scores as a bye for the opponent in `src/core/swiss.ts`, and the module unlinks any battle still going there so it can't change the round afterwards.

## Swiss rounds

Swiss is a Praetorium house format for one-on-one tournaments, not a copy of any named event pack, so it promises no compatibility with one. `src/core/swiss.ts` owns pairing and standings; each round's tables are rows of `round_pairings`.

- Publishing: `pair-round` in `sealedEventCommand` (`spacetimedb/src/index.ts`) accepts only the next round, once every table of the last one has finished, with every sealed entrant seated once and at most one bye.
- Pairing reads the tournament's battles through `pairSealedEventRound` in `src/server/service.ts` and refuses when that read is partial, since an unread battle would score as unplayed.
- Starting a game: `src/shared/sealedEventBattle.ts` refuses a Swiss battle against anyone but the paired opponent.
- Deleting a table's battle frees its pairing (`deleteBattle` in `spacetimedb/src/index.ts`), so the pair can start again.
- Withdrawing and dropping: after reveal a player can withdraw themselves and an organizer can drop a no-show (`drop` in `sealedEventCommand`); a table with a dropped player counts as finished, so the next round can be paired without them.

## Groups

`src/core/group.ts` owns decisions; `src/server/services/groupService.ts` owns operations, and the group table is `groupStandings` in `src/server/service.ts`.

- A battle counts for a group through `set-battle-group` in its log, which names the group's internal id: every battle is public, and a group's token is its invite link. A hidden-list game's battles count through the event its lock names.
- `group_battles` indexes that choice for reads. The module rewrites it from the folded log on `set-battle-group` and `undo`, and the table still checks each log, so the log stays the authority.
- Membership needs IO, so the module refuses a non-member group; the core refuses guests, practice opponents, sealed event and manual battles.
- A hidden-list game's lifecycle is shared by every reader: a new game permanently supersedes earlier games; a scheduled game expires at the end of its scheduled day, an undated one at the end of its reveal day. The creator's timezone is captured automatically; existing games without one use UTC. Past games refuse mutations except deletion and roster-sharing preferences; existing battles and revealed roster access remain available.
- A league (`group_leagues`, at most one per group) is not a sealed event, but keys its fixtures in `round_pairings` and its battles in `event_battles` by its id, as an event does. A draft stores only a seed and its players; `leagueDraw` draws its fixtures on every read, and publishing writes them once. Published fixtures are never redrawn. A battle links to its fixture as it starts, and the module refuses any other pair. Void is derived: a fixture whose player withdrew counts only if its battle finished. Withdrawal unlinks an unfinished battle, which keeps counting for the group.
