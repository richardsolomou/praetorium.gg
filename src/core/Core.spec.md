# Core

Apply deterministic battle, roster, mission, and visibility rules without IO.

## invariants

- narrowest battle audience: A battle audience is the narrowest sharing choice of every seated player.
  over: zero, two, and four seats with public, friends, private, and unset choices
  via: battleAudience
  because: one private seat must narrow visibility for the whole battle
  crossing: persisted-record -> public-output
  refuted: made every nonempty battle public -> two of four battleAudience tests failed, then passed after restoration (2026-09-29)
  kinds: read
  checklist: scoped-reads dismissed: this function folds seat choices and does not query records
  checklist: redaction dismissed: this function returns one audience value rather than a filtered record
- secret mission visibility: An unrevealed Secret Mission does not expose its identity to an opponent or spectator.
  over: an unrevealed fixed Secret Mission viewed by its owner, opponent, and a spectator
  via: hides only the fixed card held as an unrevealed Secret Mission
  because: other seats and spectators must not learn a hidden choice before reveal
  crossing: persisted-record -> public-output
  refuted: revealed every secret card name -> the hidden mission view test failed, then passed after restoration (2026-09-29)
  kinds: output
  checklist: destination-confinement dismissed: the view follows no outbound destination
  checklist: redaction declared as secret mission visibility
  checklist: commit-ordered-effects dismissed: constructing a view issues no external effect
  checklist: circuit-breaker-policy dismissed: the view calls no dependency
  checklist: declared-target-coverage dismissed: the view has no fan-out registry
