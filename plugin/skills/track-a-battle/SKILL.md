---
name: track-a-battle
description: Read a Praetorium battle and record what happens during play for a signed-in player, such as phases, command points, stratagems, scoring, casualties and undo. Use when someone asks about the score or state of their battle, or wants to record something that happened in it.
---

# Track a battle

These tools need the player's Praetorium account. If a tool asks for sign-in, explain that battles need their account and let them connect it. To set up a battle that hasn't begun, use `set-up-a-battle`.

## Read the battle

1. Call `list_my_battles` and find the battle the player means. Ask when more than one could match.
2. Call `get_my_battle` with its token. Report the score, battle round, phase and whose turn it is from that response, not from earlier in the conversation. `next` says what the battle expects now.

## Record an action

1. Read the battle with `get_my_battle` right before you record anything, and use its `seq` as `expectedSeq`.
2. Tell the player exactly what you will record, and wait for them to confirm. Battles can be public, and an opponent may be playing at the same table.
3. Call `submit_battle_action` once with that command. Any seat may record for another with `playerId`.
4. Handle the outcome:
   - `appended`: confirm what changed.
   - `stale`: someone else recorded something first. Read the battle again, show the player what changed, and ask whether their action still applies before you send it again.
   - `refused`: tell the player the reason it gives. Don't work around it with a different command.

Never resend a command after an error or a lost response without reading the battle first; it may already have been recorded.

## What to record when

`next.allowed` lists the turn commands the battle accepts now, and `next.advanceRefusal` says why the phase can't end yet.

- **Start of the Command phase.** If `next.settlement` names a side, its cards may have scored at the end of the opponent's turn: record those points with `score-settlement` and that `round`, then `settle-opponent-turn`. A tactical side then sends `draw-secondaries`: random by default, or the exact `keys` drawn at the table. Then send `acknowledge-draw`. Both sides gain their Command phase CP automatically.
- **Extra command points.** `adjust-cp` with `delta` 1, at most once a round. Discarding a tactical card for CP is `resolve-tactical-hand` with `gainCp`.
- **Stratagems.** `next.stratagems` lists each side's stratagems usable right now, with their cost. When a phase starts, remind the player of their usable ones by name and cost. Record a use with `use-stratagem`, or `cp` if the board changed its cost.
- **Ending a phase.** If `next.scoringDue` lists cards, send `request-advance`. Ask what each card paid, then send `score-settlement` with one entry per card that scored, or `acknowledge-scoring` if none did. Then `advance`. With nothing due, `advance` alone ends the phase, and from the end phase it passes the turn.
- **Casualties.** `wound-unit` removes whole models (negative `delta`). `damage-unit` removes wounds (negative `delta`). `set-unit` marks a unit destroyed. `set-unit-formation` with `battlefield` brings a reserve onto the table.
- **Notes.** `add-note` records a rules call. Anyone who can watch the battle can read it.
- **The last turn.** After the final turn of round five, a guided battle stays open with `next.settlement` naming the side that went first: record its end-of-game points with `score-settlement` and that `round`, then send `settle-opponent-turn`, which finishes the battle. A manual battle finishes on its final `advance`.
- **Ending early.** `end-battle` with `reason` `conceded` and `concededBy`.

## Mistakes

Use `undo` with the battle's `undoable` seq to take back the latest command, not the opposite command. For a total that was wrong several commands ago, use `correct-player`.
