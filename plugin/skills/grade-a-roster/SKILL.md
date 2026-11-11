---
name: grade-a-roster
description: Grade a Warhammer 40,000 army list with Praetorium, explain what it does well and lacks, and tune it with tested swaps. Use when someone asks how good their list is, what it is missing, how to improve it, or before handing over a list you built.
---

# Grade a roster

## Grade it

1. Get the list. For a saved roster, call `list_my_rosters` and `get_my_roster`, and use its `roster`. For a list you are drafting, use the draft in the shape `save_roster` takes.
2. Call `check_roster` and tell the player about any `problems`. A list that cannot be fielded still grades, but the grade means little.
3. Call `grade_roster` with the same list.
4. Report the overall score and grade, then each category's grade with its weakest rows and their `detail`. Name the reference targets in `missing`, and say which tournament lists `comparedWith` places it among. A typical tournament list scores about 70.
5. List anything a row marks `notCalculated`.

The grades measure what the list can do: board control, mobility, damage and durability, from the simulator at full strength with passive rules only. They don't predict who wins and don't know the opponent or mission, so never present them as a win rate.

## Tune it

When the player wants a better list, or you built it and it shows gaps:

1. Pick the one or two weakest rows that matter for what the list is for. A gap can be a deliberate trade-off, such as a melee list scoring low on deployment options; say so rather than fixing it.
2. Find what frees points: a unit that the grades name nowhere, or a costly unit that overlaps another's job.
3. Propose one or two swaps, using only units and sizes `list_units` offers in the list's detachment, within the points the swap frees.
4. Test each swap on the job the gap names. For a damage gap, call `simulate_combat` with the new unit against that reference target, such as a Rhino or 20 Termagants. For the other categories, compare the rows' `detail`.
5. Call `check_roster` and `grade_roster` on the changed list. Show the score and the changed rows before and after. Keep a swap only if it closes its gap without opening a worse one.

Never predict a score; grade the changed list instead.
