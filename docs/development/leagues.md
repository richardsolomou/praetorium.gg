# Leagues

`src/core/league.ts` owns decisions; `src/server/services/leagueService.ts` owns operations.

- A sealed event (`sealed_events`) is the shared engine: entries, picks, pairings and battles key on its id. Exactly one host holds it: a tournament (`tournaments`, with its own name, listing, admission, limit and admins) or a club game (`club_games`), which has none of those and is run by its club's organizers for its club's members.
- A host's token is its address and what its battles' `lock-league-rosters` name beside the event's token; a club game's is its event's. Old logs name an old league's token, which is now its club's.
- `leagues`, `league_events` and `league_admins` are retired: only the startup migration reads them, and it turns each league into a club and each event into one of its games. The tournaments route resolves every old link.
- Sealing stores a repriced, legality-checked snapshot; saved-list edits never change it.
- Before reveal, only `readsSealedLeagueRoster` and `readsAlliedLeagueRoster` grant roster access, organizers included.
- Reveal is irreversible. A Force Disposition chosen before reveal stays fixed, so a resealed list must keep it on offer.
- League battle creation copies snapshots and locks rosters in one transaction.
- A Swiss table's result locks once a later round is paired: `swissResultLocked` decides, and `submitBattle` refuses `reopen-battle` or a post-finish `undo` unless the seat belongs to the tournament's owner or an admin. Only seated players submit battle commands, so an organizer who didn't play the table can't correct it today. A correction recomputes standings and never re-pairs.
- Swiss results fold from `league_round_pairings` and the battles they link, never a stored score. A dropped entrant (`droppedAt`) keeps their entry and results but is never paired again; their unfinished table scores as a bye for the opponent in `src/core/swiss.ts`, and the module unlinks any battle still going there so it can't change the round afterwards.

## Swiss rounds

Swiss is a Praetorium house format for one-on-one tournaments, not a copy of any named event pack, so it promises no compatibility with one. `src/core/swiss.ts` owns pairing and standings; each round's tables are rows of `league_round_pairings`.

- Publishing: the `pair-round` reducer in `spacetimedb/src/index.ts` accepts only the next round, once every table of the last one has finished, with every sealed entrant seated once and at most one bye.
- Pairing reads the event's battles through `pairLeagueRound` in `src/server/service.ts` and refuses when that read is partial, since an unread battle would score as unplayed.
- Starting a game: `src/shared/leagueBattle.ts` refuses a Swiss battle against anyone but the paired opponent.
- Deleting a table's battle frees its pairing (`deleteBattle` in `spacetimedb/src/index.ts`), so the pair can start again.
- Withdrawing and dropping: after reveal a player can withdraw themselves and an organizer can drop a no-show (`drop` in `leagueCommand`); a table with a dropped player counts as finished, so the next round can be paired without them.

## Clubs

`src/core/club.ts` owns decisions; `src/server/services/clubService.ts` owns operations, and the club table is `clubStandings` in `src/server/service.ts`.

- A battle counts for a club through `set-battle-club` in its log, which names the club's internal id: every battle is public, and a club's token is its invite link. A club game's battles count through the event its lock names.
- `club_battles` indexes that choice for reads. The module rewrites it from the folded log on `set-battle-club` and `undo`, and the table still checks each log, so the log stays the authority.
- Membership needs IO, so the module refuses a non-member club; the core refuses guests, practice opponents, league and manual battles.

- A club game's lifecycle is shared by every reader: a new game permanently supersedes earlier games; a scheduled game expires at the end of its scheduled day, an undated one at the end of its reveal day. The creator's timezone is captured automatically; existing games without one use UTC. Past games refuse mutations except deletion and roster-sharing preferences; existing battles and revealed roster access remain available.
