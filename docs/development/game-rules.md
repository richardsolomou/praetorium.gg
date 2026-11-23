# Game rules

- Missing or ambiguous source facts stay unavailable; never infer them from card names or coordinates.
- Never rewrite stored battle logs; older commands keep their original interpretation. Stratagem corrections go through `src/core/stratagemCorrections.ts`.
- Card draws resolve on the server under the battle lock.
- Geometry changes advance `TERRAIN_GEOMETRY_VERSION`.
- Players read VS Data summaries, never rules prose; [catalogue data](catalogue-data.md#rules-text) says where the server may hold the prose. Correct core rules upstream, not in `catalogue/patches/`.
