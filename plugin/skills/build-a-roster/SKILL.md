---
name: build-a-roster
description: Plan a Warhammer 40,000 army list from Praetorium's current units, points and detachments, weigh what each detachment gives a unit, and save the list to the player's Praetorium account when they ask. Use when someone wants to build, draft, improve, cost or save an army or roster, choose a detachment, or asks how a unit fits a list.
---

# Build a roster

Praetorium holds current matched play data: the latest datasheets, detachments and Munitorum Field Manual points. Points, unit sizes, limits and detachment contents change with every data update, and your memory of earlier editions is wrong about them. Take every number from the tools, and read a rule's wording before you describe what it does.

## Ask first

You need a faction and a battle size before you start. Ask instead of guessing either. Ask for a detachment only if the player has one in mind. Also ask what the list is for if it isn't clear: a tournament, a casual game, or the models the player already owns. For a group or event, ask which Force dispositions it plays and whether it waives or adds any rules, such as Epic Heroes or toughness limits; pass a waiver in the draft's `waivedRules` rather than assuming one.

A preference such as "durable" or "fast" limits the list; it doesn't replace what the faction does best. Build on the faction's strengths first and meet the preference within them.

For a list from models they own, call `get_my_collection` with the faction first. Its entry ids match `list_units` ids; a datasheet's `models` caps what you field of it, and `countsAs` names the other datasheets those models can stand in for. If they want a list to bring to an event, finish with `export_roster` and give them its `text` to submit.

## How a list is put together

Praetorium's builder checks all of this, and so does `get_my_roster`:

- **Battle size** sets the points limit and every other limit: King of the Colosseum 600, Incursion 1,000, Strike Force 2,000 and Onslaught 3,000 points. Pass it to `list_units`, because unit limits depend on it.
- **Detachments**: a list takes up to three, or one at King of the Colosseum. Each costs detachment points (DP). With more than one detachment the list may spend 2 DP at Incursion and 3 DP at Strike Force, with no limit at Onslaught. A list with one detachment, including every King of the Colosseum list, takes it whatever its DP, so DP is no reason to prefer or reject one there. Each detachment brings its rules, enhancements, upgrades and stratagems. It can also allow units the faction can't otherwise take, and change what a unit costs or must take.
- **Force disposition**: each detachment offers one or more, and the card a player plays decides their primary mission. They choose one before each battle, or when sealing the list for a tournament, so a list need not name one. Taking a second detachment can add a disposition.
- **Warlord**: exactly one Character is the Warlord.
- **Enhancements** go on Characters and come from a detachment the list took. Some datasheets cannot take one.
- **Attachments**: a leader joins a unit it `canLead`, and a support unit joins one it `canSupport`.
- **Allies**: an allied unit names its faction under `alliedFaction`. Some allies have a points cap.
- **Army rule**: a faction's army rule is the ability of `kind` `faction` on each of its datasheets. Read it from any datasheet's `get_reference_record`.

## Plan the list

1. **Survey.** Call `list_units` with the faction and battle size and no detachment. Besides the units, it lists every detachment the faction can take, with its DP, Force dispositions, rule names and enhancement costs. For a large faction such as a Space Marine chapter, pass `query` to narrow the units. A chapter can also take its codex's detachments.
2. **See what wins.** Call `list_winning_lists` with the faction. `detachments` and `datasheets` show which detachments and units top-four lists take and how often, and each list shows its shape. Call it again with a detachment once you have one in mind. Treat it as evidence, not a template:
   - Say how many lists it rests on (`of`). A handful of lists is a small sample, and a placing reflects the player and the field as much as the list.
   - `battleSizes` says which sizes the lists come from. When none are at the player's size, say so, and take only which units the faction favours from them, not their shape.
   - Lists from before `latestUpdate` were built for other points. When `sinceLatestUpdate` is large enough, call it again with `since` set to that date.
   - Learn the staples and the shape, such as how many units and cheap units the lists take, rather than copying one list.
   - Treat the staples, the datasheets at least 3 in 10 lists field at any battle size, as a checklist: say whether the list takes each and why. `grade_roster` only compares with lists of the same size, so at a size with none it won't name a staple you left out. Give the reason too when you take a unit no top list fields, such as the player's models or a job nothing else does.
   - When the player asks for a particular list, read it with `get_winning_list`, then grade and adapt that draft.
3. **Read the rules that matter.** Read the army rule. Then pick two or three detachments that fit the player's models or style and read each one's rules: `get_reference` with its `referenceId`, then fetch the wording from its `textSources`. For each detachment, note which keywords and unit types its rules, enhancements and stratagems name, in which phase they apply, and whether they apply in your turn or the opponent's. For a rule with a condition, such as a unit below Starting Strength, estimate how soon a typical game meets it before judging the rule; losing one model is often enough. Flag a rule whose value depends on the opponent's choices, such as one that needs enemy units somewhere they can avoid. When a rule scales with battle size but doesn't name the player's, say so and ask how their group plays it. If you could not read a rule's wording, say so instead of describing it.
4. **Choose a detachment.** Grades switch on only passive rules, so they rarely tell detachments apart; compare the shortlist on the units you plan to take, as What each detachment gives one unit below describes. Simulate a conditional rule in the state that meets it, such as with `modelsLost`, and choose it in `rules`. When the simulator doesn't offer a rule, you may stand its effect in with `modifiers`, but say you did; don't reject a detachment because a rule couldn't be simulated. Recommend one and say why: what the army rule and detachment rule reward, which units benefit, which Force disposition suits it, and how often it appears in winning lists. Then call `list_units` again with that detachment. It lists only the units the detachment allows, prices each unit in it, and adds its stratagems by CP, phase and timing.
5. **Read the mission.** Call `get_mission_matchup` with the Force disposition the list will play and a common opponent's, taking both names from the detachments `list_units` lists rather than from memory, and say which you assumed. Note what the primary scores, so the list has enough units to stand on objectives and take actions in the turns that need them. When either card scores destroying units, cheap, fragile units hand the opponent easy kills.
6. **Build around characters.** Pick each Character with the unit it leads, from `canLead`, and choose its enhancement. A leader's abilities, an enhancement and the detachment rule together usually decide what a unit is for.
7. **Give every unit a job.** Each unit should hold objectives, screen or take actions, kill a kind of target, carry other units, or make a named unit better at its job. Say what each one is for.
8. **Set the Warlord, enhancements and wargear.** Call `get_unit_options` with the faction, battle size, detachment and the units you picked, with their sizes. Put its `roster` ids into the draft's `catalogueId`, `detachmentIds` and `disposition`. For each pick, copy ids straight from it: the Warlord toggle as `toggles: {key: 1}` on exactly one Character, each enhancement as `choices: {key: optionId}`, and each wargear or upgrade change in `choices` or `spreads`, as that choice's `set` says. Leave out what stays at its default. Set `attachedTo` on a leader to the index of the unit it joins. Defaults are often far from a unit's best loadout, and many options cost nothing, so call `optimize_loadout` against a typical target for every unit with wargear choices rather than guessing. `optimize_loadout` measures only damage against that one target, so also take every optional choice that costs no points and replaces nothing, such as an extra weapon or an icon.
9. **Cover the jobs a list needs.** Praetorium's roster grades measure these:
   - Board control: enough units to hold objectives and take actions, including cheap ones (about 70 points or less) to screen, take actions or sit on a home objective, and units with Objective Control 10 or more.
   - Mobility: units that move fast, or deploy with Deep Strike, Scouts or Infiltrators.
   - Damage: something able to remove each kind of target, from hordes and elite infantry to vehicles, heavy armour and monsters.
   - Durability: points spread across the list rather than in one or two big units; at small battle sizes, one unit near half the points is a list the opponent beats by killing it.
10. **Test key matchups.** Call `simulate_combat` for the matchups the list relies on, such as the main damage unit against a vehicle or elite infantry. Name the detachment and choose the rules that would be active. Don't estimate damage yourself, and report any rule it marks `notCalculated`.
11. **Price and check it.** Take each cost from the unit size you chose in the detachment you chose, and stay within the battle size and each unit's `limit`. Then call `check_roster` with the draft in the shape `save_roster` takes. Its `summary` is the total Praetorium priced, and `problems` lists everything that stops the list being fielded. Fix each problem before going on. Tell the player each `unchecked` restriction too: Praetorium could not evaluate it, so they check it in the source rules. Never call a list legal from your own arithmetic.
12. **Grade it before you present it.** Call `grade_roster` and follow the grade-a-roster skill. Explain each gap it names, and compare the list with `tournament`.
13. **Present it.** Show the list with a cost and job for each line, its detachment, Force disposition, Warlord and enhancements, the total and its grade. Name the staples it leaves out with the reason for each. Then give its weaknesses: the gaps the grade names, the threats it struggles with, and anything it depends on going right. Never call a list competitive or strong on its grade alone.

Grades at sizes other than 2,000 points compare with lists drawn from 2,000-point tournament lists (`calibration.lists` is `drawn`), so treat them as a rougher guide there.

`list_units` leaves out Legends and Crucible datasheets. Pass `nonMatchedPlay` only when the player wants them. If it doesn't have a unit the player asks for, say so.

## What each detachment gives one unit

When the player asks how a unit fits, or which detachment suits it:

1. Call `list_units` with the faction and battle size and no detachment for the detachment overview.
2. For each detachment worth comparing, call `list_units` with that detachment and `query` set to the unit's name. A missing unit means the detachment doesn't allow it. Compare its cost across detachments.
3. Read the detachment rules, the stratagems and, for a Character, the enhancements. Check which of them name one of the unit's keywords or roles, or apply in a phase the unit acts in.
4. Call `simulate_combat` for the same matchup once without a detachment and once with each one, choosing the detachment rules and stratagems the unit would use.
5. Report for each detachment whether it allows the unit, what the unit costs, which rules and stratagems apply to it and when, and how much the simulated result changes.

## Save it

Call `save_roster` only after the player confirms the list. It needs the player's Praetorium account. If the tool asks for sign-in, explain that saving needs their account and let them connect it. Leave visibility private unless the player asks for something else, because public rosters are visible to other players.

Pass the returned `id` to edit the same roster later instead of creating a copy, and share the roster link it returns. If the player asks what changed in a points update, call `list_data_updates` for the faction.
