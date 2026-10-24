# Leagues

`src/core/league.ts` owns decisions; `src/server/services/leagueService.ts` owns operations.

- Sealing stores a repriced, legality-checked snapshot; saved-list edits never change it.
- Before reveal, only `readsSealedLeagueRoster` and `readsAlliedLeagueRoster` grant roster access, organizers included.
- Reveal is irreversible. A Force Disposition chosen before reveal stays fixed, so a resealed list must keep it on offer.
- League battle creation copies snapshots and locks rosters in one transaction.
