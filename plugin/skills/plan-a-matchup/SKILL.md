---
name: plan-a-matchup
description: Plan how a player's Warhammer 40,000 list takes on one opponent with Praetorium's simulator and mission data. Use when someone asks how to play their list against an army, which of their units handle the opponent's threats, or who should play the objectives.
---

# Plan a matchup

## Ask first

You need the player's list, the opponent's faction or list, and both Force dispositions. Ask for any you don't have. For a saved list, call `get_my_roster` and use its `summary` and `roster`.

## Plan it

1. Call `get_mission_matchup` with the mission pack and both dispositions. Note what each side's primary mission scores and the deployment and terrain options.
2. When you have both lists, call `compare_rosters` with the player's list attacking and again with the opponent's list attacking. Each call runs every unit against every unit, so don't call `simulate_combat` once per pairing. Use `bestAttackerOf` to see which of the player's units answers each enemy unit, and the reversed call's `bestTargetOf` to see what each enemy unit threatens. If a result is `partial`, use its finished pairings and say which are missing.
3. Name the opponent's key threats: the two or three units most likely to hurt the player's list or hold objectives. When you only know their army, pick them from `list_units` for their faction and call `simulate_combat` for each threat against the player's units that could answer it, and for the threat attacking the units it is most likely to reach.
4. To look closer at one pairing, such as with a stratagem, a charge, cover or losses, call `simulate_combat`. Field a saved unit with its pick's `entryId`, `models`, `choices` and `spreads`, its attached picks, and each side's detachment.
5. Decide jobs: which units answer each threat, which play the primary mission, and which screen or take actions. Base it on the simulated numbers and what the mission scores.
6. Report the plan with the numbers it rests on, each pairing or rule the simulator could not calculate, and the simulator links.

Don't estimate damage yourself or describe a mission card from memory. Simulations are at full strength, `compare_rosters` with passive rules only and `simulate_combat` with the rules you chose, so say what they leave out, such as range, terrain and the order units act in.
