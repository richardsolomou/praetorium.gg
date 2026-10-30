These tools are public. The assistant picks which to call; you just ask in plain language.

## Look things up

The assistant can search missions, rules, detachments and datasheets by name, rule number, keyword, weapon or ability, then read the full record for the best match. It can also list the available factions, mission packs and rules documents, and narrow a search to one faction, pack or document when a name is ambiguous.

For example:

- "Using Praetorium, what's the Toughness and Save of a Space Marines Intercessor squad?"
- "Which detachments do Aeldari have, and what does each enhancement cost?"
- "What's the deployment and terrain layout for this mission in the current mission pack?"

Missions come back as structured cards, deployments and terrain layouts, so the assistant can describe a setup without guessing at it. Assistants that support MCP prompts also offer two ready-made ones from Praetorium: **Answer a game-rules question**, and **Explain a mission matchup**, which takes a mission pack and both players' force dispositions.

## Plan an army

For list building, the assistant can pull a whole faction's pickable units in one go: costs at each unit size, composition, which leaders and support units can join which units, how many of a unit you may take, roles, keywords and links. Give it a battle size and it uses the limits for that size; give it a detachment and it also gets that detachment's rules, enhancements, upgrades and stratagems by name, cost and timing. Legends and Crucible datasheets are left out unless you ask for them. For a faction with many units, such as a Space Marine chapter, the assistant may ask for units by name or keyword instead of the whole list.

> Using Praetorium, plan a 2,000-point Necrons list around two units of Immortals, and tell me which detachments suit it.

The assistant's arithmetic isn't Praetorium's legality check. Build or paste the result into [Rosters](/rosters), which checks points and the construction restrictions it supports; see [Start a list](/docs/start-a-list) and [Import a list](/docs/import-a-list).

## Simulate combat

The assistant can run Praetorium's combat simulator for one attacking unit, with up to two attached leaders or support units, against one defending unit at full strength. It reports shooting, melee, and shooting followed by melee: expected models destroyed, expected wounds lost, the chance to wipe the unit, cumulative odds and the weapons used. Every result includes a link that opens the same matchup on the [simulator](/simulator) page.

> Using Praetorium, how many Intercessors do ten Necron Warriors kill in shooting, and what if the Intercessors are in cover?

It can apply situational modifiers the simulator page offers, such as cover, a hit modifier, having charged or a defender's invulnerable save, and you can ask it to switch a rule or weapon profile on or off and run it again. Datasheet rules that always apply are on by default; stratagems and conditional rules stay off until you ask for them.

It uses each unit's default loadout. Name a detachment for either side and it also applies that detachment's rules and offers its stratagems; otherwise it uses none. To compare specific wargear, use the simulator page directly; see [Set up a matchup](/docs/set-up-a-matchup).
