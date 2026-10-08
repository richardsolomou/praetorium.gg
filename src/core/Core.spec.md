# Core

Deterministic domain decisions (legality, pricing, visibility, battle state, standings) with no IO or framework imports except zod.

## invariants

- secret mission secrecy: A reader who does not hold a face-down Secret Mission never learns which card it is.
  over: the battle views battleView projects for every viewer that does not hold the face-down card
  via: hides only the fixed card held as an unrevealed Secret Mission
  because: a Secret Mission is played face down; showing it to the opponent or a spectator decides the game for them
  crossing: product store -> visitor
  refuted: mayNameCard named a face-down Secret Mission to every viewer -> hides only the fixed card held as an unrevealed Secret Mission failed (2026-10-06)
  kinds: output
  checklist: destination-confinement dismissed: the view is returned to the requesting reader only; nothing is delivered onward
  checklist: redaction declared as secret mission secrecy
  checklist: commit-ordered-effects dismissed: projecting a view has no external effect
  checklist: circuit-breaker-policy dismissed: no dependency is called
  checklist: declared-target-coverage dismissed: there is no fan-out
- narrowest battle audience: A battle is watchable by no wider audience than the narrowest one any seated player chose.
  over: the seat preferences battleAudience folds for a table
  via: lets one player withhold a battle everyone else would have shared
  because: one player keeping their battles private must keep the whole table private, or their games leak through an opponent's public setting
  crossing: product store -> visitor
  refuted: narrower kept the wider audience -> lets one player withhold a battle everyone else would have shared failed (2026-10-06)
  kinds: read
  checklist: scoped-reads declared as narrowest battle audience
  checklist: redaction dismissed: the audience admits or refuses a whole battle; field hiding is secret mission secrecy's
