- add a battle command: A new battle command kind is validated, folded, undone, hidden and replayed the same way as every other, so the command log stays the only battle state.
  when: edit src/core/battle.ts adding case '
  step: add the kind to the command schema and cover it in both validate and apply in src/core/battle.ts; persist only the command, never a score, phase, round, mission or casualty beside it
  step: decide its undo shape: one atomic undo target, part of a grouped operation that one undo reverses whole, or outside the undo chain like start and shared prompt bookkeeping
  step: decide what battleView shows each viewer, so a face-down Secret Mission or a deck that would identify it stays hidden
  step: test apply, undo across the turn boundary it can cross, each viewer's view, and a replay of every prefix that includes it
  leaves: adjacent tests in src/core/battle.test.ts and src/core/battleView.test.ts
  pitfall: drawing two tactical cards made two undo targets, so one undo left the first card in hand (693a912c)
  learned: 693a912c, a3d448f3
  invariants: secret mission secrecy
  because: battle state is folded from the command log, so a command that one of validate, apply, undo, view or replay forgets makes the fold disagree with what players saw
