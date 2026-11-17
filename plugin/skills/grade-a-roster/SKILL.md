---
name: grade-a-roster
description: Grade a Warhammer 40,000 army list with Praetorium, explain what it does well and lacks, compare it with winning tournament lists, and tune it with tested swaps. Use when someone asks how good their list is, what it is missing, how to improve it, or before handing over a list you built.
---

# Grade a roster

## What the grade can and can't say

The grades measure coverage: which jobs a list can do (board control, mobility, damage and durability), measured by the simulator at full strength with passive rules only. Detachment rules are rarely passive, so grades rarely tell detachments apart. They don't measure how strong the list is.

Praetorium checked them against tournament games where both lists were known:

- The players decided far more than the lists did.
- The overall grade went with winning only slightly.
- Of the list measures, more units and an even spread of points went with winning most, by about 5 points of win rate for a typical difference.
- Fielding more of the units the army's winning lists share went with winning by about 3 points.
- A missing damage target did not go with losing, and neither did being out-damaged in the simulator.

Those games were 2,000-point lists. At any other battle size, `calibration.lists` is `drawn`: the list is placed among lists drawn from 2,000-point tournament lists, and nothing shows that more units or an even spread win at that size. Say so before you report a grade, and weigh those two measures as untested.

So never call a list competitive or weak from its grade, and never present a grade or a simulation as a win rate.

Board presence counts units. A character joined to a unit counts inside that unit, so its buffs never show as its own job, and swapping it for another unit always raises board presence. What it adds is in its unit's `attached` instead: for each target, the share of one target the unit takes in a turn with it and without it.

Be straight with the player. Base every judgement of a unit or the list on a number from a tool, and lead with what the list lacks. If the player disagrees without new information, keep your assessment and explain it again rather than softening it. If they built the list for fun, for theme or from the models they own, judge it against that goal. Say where it departs from what wins rather than pretending it doesn't.

## Grade it

1. Ask how the list means to win, unless the player already said: its Force disposition, how many objectives it plans to hold, and whether it scores by holding ground or by killing. A list that plans to hold its home objective and one more needs less board presence than one that spreads across the table, so judge Board presence and Even spread against that plan.
2. Get the list. For a saved roster, call `list_my_rosters` and `get_my_roster`, and use its `roster`. For a list you are drafting, use the draft in the shape `save_roster` takes.
3. Call `check_roster` and tell the player about any `problems`. A list that cannot be fielded still grades, but the grade means little. Name any `freeWargearLeftOut` too: it costs nothing to take.
4. Call `grade_roster` with the same list.
5. Report what it lacks first:
   - Board presence and Even spread when they grade low and the plan needs them. At 2,000 points they went with winning most.
   - `missing`: the reference targets nothing in the list can take half of alone. It's worth knowing, but it didn't decide games on its own.
   - Each category's weakest rows and their `detail`, and anything a row marks `notCalculated`.
6. Then report the overall score and grade, each category's grade, and which tournament lists `comparedWith` places it among. A typical tournament list scores about 70.
7. For each unit with wargear choices, call `optimize_loadout` against the target its job names. A saved list often keeps a unit's default wargear, which can be its weakest option, so report any `best` that is `better`.
8. Use `units` to say what each unit is for, and `attached` to say what each leader or support character adds to its unit. A unit with no `jobs` may still earn its points through an aura or a stratagem the grades can't see, so ask what it's for.

## Compare it with winning lists

`grade_roster`'s `tournament` sets the list beside its army's top-four lists. Report facts, not a verdict:

- `stapleShare`: how much of its points are in datasheets at least 3 in 10 of those lists field.
- `leftOut`: the staples it does without.
- `unproven`: the datasheets it takes that no winning list fields.

For their detachments and shapes, and to read one, call `list_winning_lists` and `get_winning_list`. Always say how many lists the comparison rests on (`lists`). Departing from the staples is fine when there is a reason; ask for it, or give one.

## Tune it

When the player wants a better list, or you built it and it shows gaps:

1. Pick the one or two gaps that matter most for what the list is for. A gap can be a deliberate trade-off, such as a melee list scoring low on deployment options; say so rather than fixing it.
2. Find what frees points: a unit with no job and no other reason to be there, a costly unit that overlaps another's job, or an upgrade that doesn't help its unit's job. Never cut a leader or support character on its grade alone. Read what it adds in its unit's `attached`, and set that beside what the replacement would do. A character's defensive rules aren't in `attached`, so simulate its unit as the defender with and without it too.
3. Propose one or two swaps, using only units and sizes `list_units` offers in the list's detachment, within the points the swap frees. Prefer a staple from `tournament.leftOut` when one does the missing job, or more units for the same points when the plan needs more of the table.
4. Change one thing per comparison, so each result says what that one change did. Test each swap on the job the gap names. For a damage gap, call `simulate_combat` with the new unit against that reference target, such as a Rhino or 20 Termagants. For the other categories, compare the rows' `detail`. To choose an enhancement, call `compare_enhancements` against the target the unit is for, with `points` set to what the list has spare. An enhancement marked `notCalculated` can't be compared that way, so say so.
5. Call `check_roster` and `grade_roster` on the changed list. Show the score, gaps and changed rows before and after. Keep a swap only if it closes its gap without opening a worse one.

Never predict a score; grade the changed list instead.
