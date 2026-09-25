# Core

Apply deterministic battle, roster, mission, and visibility rules without IO.

## invariants

- narrowest battle audience: A battle audience is the narrowest sharing choice of every seated player.
  over: zero, two, and four seats with public, friends, private, and unset choices
  via: battleAudience
  because: one private seat must prevent public or friends visibility for the whole table
  crossing: persisted-record -> public-output
  refuted: made every nonempty table public -> two of four battleAudience tests failed, then passed after restoration (2026-09-25)
  kinds: read
  checklist: scoped-reads dismissed: this calculation chooses an audience but does not query shared records
  checklist: redaction dismissed: this calculation returns a visibility choice rather than a filtered representation
- secret mission visibility: An unrevealed Secret Mission does not expose its identity to an opponent or spectator.
  over: a fixed Secret Mission viewed by its owner, opponent, and a spectator
  via: hides only the fixed card held as an unrevealed Secret Mission
  because: face-down choices must remain private while other seated devices can still operate the battle
  crossing: persisted-record -> public-output
  refuted: returned the hidden card name to every viewer -> the Secret Mission view test failed, then passed after restoration (2026-09-25)
  kinds: output
  checklist: destination-confinement dismissed: this view returns data to its caller and follows no destination
  checklist: redaction declared as secret mission visibility
  checklist: commit-ordered-effects dismissed: constructing a view issues no external effect
  checklist: circuit-breaker-policy dismissed: the view calls no dependency
  checklist: declared-target-coverage dismissed: the view has no fan-out registry
