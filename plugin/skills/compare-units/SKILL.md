---
name: compare-units
description: Compare two Warhammer 40,000 units with Praetorium's combat simulator and explain the expected result. Use when someone asks how one unit does against another, which of two options hits harder, or what the odds are of destroying a target.
---

# Compare units

1. Find both units with `list_units` for their factions, and use the unit ids it returns. Ask which unit the player means when a name matches more than one.
2. Call `simulate_combat` with the attacker and defender. Add leaders or attached units, model counts, a side's detachment, or modifiers such as cover only when the player gives them.
3. Report expected models destroyed for shooting, melee, and shooting followed by melee, plus the chance to destroy the target. Use the numbers the tool returns; don't compute odds yourself.
4. List every rule the result marks `notCalculated`, and any refusal, in plain words. Don't estimate what they would change.
5. Share the returned simulator link so the player can change loadouts, rules and modifiers in Praetorium.

The simulator uses default loadouts and full-strength units, and applies a detachment only when you name one for that side. Say so when the player's question depends on something else, such as specific wargear or a damaged unit.
