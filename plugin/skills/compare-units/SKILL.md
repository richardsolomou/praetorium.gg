---
name: compare-units
description: Compare two Warhammer 40,000 units with Praetorium's combat simulator and explain the expected result. Use when someone asks how one unit does against another, which of two options hits harder, which wargear is best against a target, or what the odds are of destroying a target.
---

# Compare units

1. Find both units with `list_units` for their factions, and use the unit ids it returns. Ask which unit the player means when a name matches more than one.
2. To use a unit from one of the player's saved rosters, read it with `get_my_roster` and pass its pick's `entryId` as `unit`, with the pick's `models`, `choices` and `spreads` unchanged, for the unit and each attached unit. That fields the wargear they actually took.
3. Call `simulate_combat` with the attacker and defender. Add leaders or attached units, model counts, a side's detachment, enhancements, nearby units whose auras reach a side, or modifiers such as cover only when the player gives them. A modifier such as `charged` never switches on a rule: when the player says the unit charged or remained stationary, also choose the rules whose options need it.
4. Report expected models destroyed for shooting, melee, and shooting followed by melee, plus the chance to destroy the target. Use the numbers the tool returns; don't compute odds yourself.
5. List every rule the result marks `notCalculated`, and any refusal, in plain words. Don't estimate what they would change.
6. Share the returned simulator link so the player can change loadouts, rules and modifiers in Praetorium.

## Best loadout

When the player asks which wargear does most against a target, call `optimize_loadout` with the same sides you would give `simulate_combat`, and `mode` `ranged` or `melee` when they ask about one phase. Report `best` against `current`: each unit's wargear by name and the chance to destroy the target. Say it is the best loadout only when `exhaustive` is true; otherwise relay its `notes`. To field it, pass `best`'s `choices` and `spreads` to `simulate_combat` or into the roster's picks. For one option against another, call `get_unit_options` for the ids and `simulate_combat` once with each.

Without `choices`, the simulator uses default loadouts. A unit is at full strength unless you pass `modelsLost` or `woundsLost`. It refuses damage it cannot place exactly, such as models lost from a squad with mixed wargear; say so rather than guessing. The returned link opens every unit at full strength. Weapons with several profiles use the one that does most against the defender unless you pass `weaponModes`. A detachment, an enhancement, or another unit's aura applies only when you name it. Say so when the player's question depends on something else.
