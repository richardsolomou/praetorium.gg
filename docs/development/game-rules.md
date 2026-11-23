# Game rules

- Missing or ambiguous source facts stay unavailable; never infer them from card names or coordinates.
- Never rewrite stored battle logs; older commands keep their original interpretation. Stratagem corrections go through `src/core/stratagemCorrections.ts`, keyed by both the Game Datacards IDs saved battles hold and the VS Data IDs current ones do.
- Stratagems and the mission pack are VS Data's typed facts (`src/server/vsDataStratagems.ts`, `src/server/vsDataMissions.ts`), keyed by VS Data IDs; Praetorium never reads timing, limits, awards or when-drawn rules from words. A part VS Data leaves `unresolved` stays unavailable: a scoring window is not scheduled, and an untyped when-drawn rule is the player's to judge from the card's summary.
- Battle logs, saved rosters, simulator links and table battlefields keep the Game Datacards IDs they were saved with. Read them through the frozen maps in `catalogue/legacy-ids/` (`currentMissionId` and `sameMissionId` in `src/core/legacyIds.ts`, `currentStratagemId` in `src/core/legacyStratagemIds.ts`) wherever they meet current rules; `scripts/freezeLegacyIds.ts` only adds entries. The Stratagem map is large, so only the battle, print and simulator pages import it.
- Card draws resolve on the server under the battle lock.
- Geometry changes advance `TERRAIN_GEOMETRY_VERSION`.
- Players read VS Data summaries, never rules prose; [catalogue data](catalogue-data.md#rules-text) says where the server may hold the prose. Correct core rules upstream, not in `catalogue/patches/`.
