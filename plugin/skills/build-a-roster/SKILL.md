---
name: build-a-roster
description: Plan a Warhammer 40,000 army list with Praetorium's units and points, and save it to the player's Praetorium account when they ask. Use when someone wants to build, draft, cost, or save an army or roster for a faction and battle size.
---

# Build a roster

## Ask first

You need a faction and a battle size before you start: 1,000, 2,000 or 3,000 points, or 600 for King of the Colosseum. Ask for a detachment only if the player has one in mind. Ask instead of guessing any of these.

## Plan the list

1. Call `list_units` once, with the faction, the battle size and any detachment. It returns every pickable unit, each unit size's cost, attachments, roster limits, and the detachment's enhancements and stratagems.
2. Pick units only from that response. Take each cost from the unit size you chose, and stay within the battle size and each unit's roster limit.
3. Show the player the list with a cost for each line and the running total before you save anything.

Never take points, unit sizes or limits from memory. `list_units` leaves out Legends and Crucible datasheets; pass `nonMatchedPlay` only when the player wants them. If it doesn't have a unit the player asks for, say so.

## Save it

Call `save_roster` only after the player confirms the list. It needs the player's Praetorium account; if the tool asks for sign-in, explain that saving needs their account and let them connect it. Leave visibility private unless the player asks for something else, because public rosters are visible to other players.

Pass the returned `id` to edit the same roster later instead of creating a copy. `save_roster` stores the list but doesn't confirm it's legal, so read it back with `get_my_roster`: its `summary` gives the total Praetorium priced and any problems that stop the list being fielded. Tell the player about any problems, then share the roster link.
