# Game rules

- Missing or ambiguous source facts stay unavailable; never infer them from card names or coordinates.
- Never rewrite stored battle logs; older commands keep their original interpretation. Stratagem corrections go through `src/core/stratagemCorrections.ts`.
- Card draws resolve on the server under the battle lock.
- Geometry changes advance `TERRAIN_GEOMETRY_VERSION`.
- Never put rules prose in a server response, snapshot, or offline bundle; the browser loads it from the pinned upstream URL. Correct core rules upstream, not in `catalogue/patches/`.
