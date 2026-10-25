# Leagues

`src/core/league.ts` owns decisions; `src/server/services/leagueService.ts` owns operations.

- Sealing stores a repriced, legality-checked snapshot; saved-list edits never change it.
- Before reveal, only `readsSealedLeagueRoster` and `readsAlliedLeagueRoster` grant roster access, organizers included.
- Reveal is irreversible. A Force Disposition chosen before reveal stays fixed, so a resealed list must keep it on offer.
- League battle creation copies snapshots and locks rosters in one transaction.

## Clubs

`src/core/club.ts` owns decisions; `src/server/services/clubService.ts` owns operations, and the club table is `clubStandings` in `src/server/service.ts`.

- A battle counts for a club through `set-battle-club` in its log, which names the club's internal id: every battle is public, and a club's token is its invite link.
- `club_battles` indexes that choice for reads. The module rewrites it from the folded log on `set-battle-club` and `undo`, and the table still checks each log, so the log stays the authority.
- Membership needs IO, so the module refuses a non-member club; the core refuses guests, practice opponents, league and manual battles.
