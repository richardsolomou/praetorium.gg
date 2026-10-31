# Combat simulation

Engine: `src/core/combat*.ts`; server: `src/server/combat*.ts`; every entry point goes through `resolveCombatRequest`.

- Simulation never saves rosters, spends resources, or sends battle commands.
- Never cache roster documents, account data, partial runs, or failures in the shared answer cache.
- Other players' rosters open only through `sharedRoster` or `openSealedEventRoster`.
- Effects compile from source clauses, never card names. Unsupported mechanics refuse calculation rather than approximate.
- Compute exact distributions; never add phase probabilities or average damage. Timeouts and heuristic searches must not claim an exact optimum.
