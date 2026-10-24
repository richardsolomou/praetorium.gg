---
name: track-a-battle
description: Read a Praetorium battle and record actions in it for a signed-in player, such as scoring, command points, damage, phase changes and undo. Use when someone asks about the score or state of their battle, or wants to record something that happened in it.
---

# Track a battle

These tools need the player's Praetorium account. If a tool asks for sign-in, explain that battles need their account and let them connect it.

## Read the battle

1. Call `list_my_battles` and find the battle the player means. Ask when more than one could match.
2. Call `get_my_battle` with its token. Report the score, battle round, phase and whose turn it is from that response, not from earlier in the conversation.

## Record an action

1. Read the battle with `get_my_battle` right before you record anything, and use its `seq` as `expectedSeq`.
2. Tell the player exactly what you will record, and wait for them to confirm. Battles can be public, and an opponent may be playing at the same table.
3. Call `submit_battle_action` once with that command.
4. Handle the outcome:
   - `appended`: confirm what changed.
   - `stale`: someone else recorded something first. Read the battle again, show the player what changed, and ask whether their action still applies before you send it again.
   - `refused`: tell the player the reason it gives. Don't work around it with a different command.

Never resend a command after an error or a lost response without reading the battle first; it may already have been recorded. To take something back, use the battle's undo instead of recording the opposite.
