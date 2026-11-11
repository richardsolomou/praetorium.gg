---
name: review-a-battle
description: Summarise one of a signed-in player's Praetorium battles from its report, such as how the score built up, which stratagems were used and the turning points. Use when someone asks how a game went or wants a write-up of it.
---

# Review a battle

These tools need the player's Praetorium account. If a tool asks for sign-in, explain that battles need their account and let them connect it.

1. Find the battle with `list_my_battles`. Ask when more than one could match.
2. Call `get_my_battle` for the result, final scores with their primary and secondary halves, and each army.
3. Call `get_my_battle_report` for what happened, in order. Follow `nextAfter` until it's null.
4. Summarise round by round: the score after each round, the secondaries drawn and scored, stratagems used, units destroyed, and any notes. Use the players' names as the report gives them.

Say only what the report records. It doesn't record dice or positions, so don't guess why something happened. Link the battle so the player can open its replay.
