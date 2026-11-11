---
name: build-a-roster
description: Plan a Warhammer 40,000 army list from Praetorium's current units, points and detachments, weigh what each detachment gives a unit, and save the list to the player's Praetorium account when they ask. Use when someone wants to build, draft, improve, cost or save an army or roster, choose a detachment, or asks how a unit fits a list.
---

# Build a roster

Praetorium holds current matched play data: the latest datasheets, detachments and Munitorum Field Manual points. Points, unit sizes, limits and detachment contents change with every data update, and your memory of earlier editions is wrong about them. Take every number from the tools, and read a rule's wording before you describe what it does.

## Ask first

You need a faction and a battle size before you start. Ask instead of guessing either. Ask for a detachment only if the player has one in mind. Also ask what the list is for if it isn't clear: a tournament, a casual game, or the models the player already owns.

For a list from models they own, call `get_my_collection` with the faction first. Its entry ids match `list_units` ids; a datasheet's `models` caps what you field of it, and `countsAs` names the other datasheets those models can stand in for. If they want a list to bring to an event, finish with `export_roster` and give them its `text` to submit.

## How a list is put together

Praetorium's builder checks all of this, and so does `get_my_roster`:

- **Battle size** sets the points limit and every other limit: King of the Colosseum 600, Incursion 1,000, Strike Force 2,000 and Onslaught 3,000 points. Pass it to `list_units`, because unit limits depend on it.
- **Detachments**: a list takes up to three, or one at King of the Colosseum. Each costs detachment points (DP). With more than one detachment the list may spend 2 DP at Incursion and 3 DP at Strike Force, with no limit at Onslaught. Each detachment brings its rules, enhancements, upgrades and stratagems. It can also allow units the faction can't otherwise take, and change what a unit costs or must take.
- **Force disposition**: each detachment offers one or more. The list plays one disposition from those its detachments offer, and that choice decides its primary mission. Taking a second detachment can add a disposition.
- **Warlord**: exactly one Character is the Warlord.
- **Enhancements** go on Characters and come from a detachment the list took. Some datasheets cannot take one.
- **Attachments**: a leader joins a unit it `canLead`, and a support unit joins one it `canSupport`.
- **Allies**: an allied unit names its faction under `alliedFaction`. Some allies have a points cap.
- **Army rule**: a faction's army rule is the ability of `kind` `faction` on each of its datasheets. Read it from any datasheet's `get_reference_record`.

## Plan the list

1. **Survey.** Call `list_units` with the faction and battle size and no detachment. Besides the units, it lists every detachment the faction can take, with its DP, Force dispositions, rule names and enhancement costs. For a large faction such as a Space Marine chapter, pass `query` to narrow the units. A chapter can also take its codex's detachments.
2. **Read the rules that matter.** Read the army rule. Then pick two or three detachments that fit the player's models or style and read each one's rules: `get_reference` with its `referenceId`, then fetch the wording from its `textSources`. For each detachment, note which keywords and unit types its rules, enhancements and stratagems name, in which phase they apply, and whether they apply in your turn or the opponent's. If you could not read a rule's wording, say so instead of describing it.
3. **Choose a detachment.** Recommend one and say why: what the army rule and detachment rule reward, which units benefit, and which Force disposition the list plays. Then call `list_units` again with that detachment. It lists only the units the detachment allows, prices each unit in it, and adds its stratagems by CP, phase and timing.
4. **Build around characters.** Pick each Character with the unit it leads, from `canLead`, and choose its enhancement. A leader's abilities, an enhancement and the detachment rule together usually decide what a unit is for.
5. **Set the Warlord, enhancements and wargear.** Call `get_unit_options` with the faction, battle size, detachment and the units you picked, with their sizes. Put its `roster` ids into the draft's `catalogueId`, `detachmentIds` and `disposition`. For each pick, copy ids straight from it: the Warlord toggle as `toggles: {key: 1}` on exactly one Character, each enhancement as `choices: {key: optionId}`, and each wargear or upgrade change in `choices` or `spreads`, as that choice's `set` says. Leave out what stays at its default. Set `attachedTo` on a leader to the index of the unit it joins. To pick wargear for a job, use `optimize_loadout` against a typical target rather than guessing.
6. **Cover the jobs a list needs.** Praetorium's roster grades measure these:
   - Board control: enough units to hold objectives and take actions, including cheap ones (about 70 points or less) to screen, take actions or sit on a home objective, and units with Objective Control 10 or more.
   - Mobility: units that move fast, or deploy with Deep Strike, Scouts or Infiltrators.
   - Damage: something able to remove each kind of target, from hordes and elite infantry to vehicles, heavy armour and monsters.
   - Durability: points spread across the list rather than in two big units.
7. **Test key matchups.** Call `simulate_combat` for the matchups the list relies on, such as the main damage unit against a vehicle or elite infantry. Name the detachment and choose the rules that would be active. Don't estimate damage yourself, and report any rule it marks `notCalculated`.
8. **Price and check it.** Take each cost from the unit size you chose in the detachment you chose, and stay within the battle size and each unit's `limit`. Then call `check_roster` with the draft in the shape `save_roster` takes. Its `summary` is the total Praetorium priced, and `problems` lists everything that stops the list being fielded. Fix each problem before going on. Never call a list legal from your own arithmetic.
9. **Grade it before you present it.** Call `grade_roster`. If it shows gaps or weak categories, follow the grade-a-roster skill to tune the list before you hand it over.
10. **Present it.** Show the list with a cost for each line, its detachment, Force disposition, Warlord and enhancements, the total, and its grade.

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
