---
name: set-up-a-battle
description: Start a Praetorium battle for a signed-in player and set the table in the order the game does, from opponent and armies to the first turn. Use when someone wants to start, create or set up a game to track.
---

# Set up a battle

These tools need the player's Praetorium account. If a tool asks for sign-in, explain that battles need their account and let them connect it.

## Create the battle

1. Call `list_my_opponents`. Ask who they're playing: a friend or a practice opponent from that list by `id`. Every seat belongs to an account: an opponent without one signs up and accepts a friend invite first, and a game tracked alone uses a practice opponent.
2. Ask for the battle size and mission pack (`list_reference` lists packs), and whether they want guided tracking (the default) or `manual`.
3. Confirm the seats, size and pack, then call `create_battle`. Keep the `token` it returns.

## Set the table

Call `get_my_battle` and follow `next.steps` from the top. Each step says whether it's `done` and which command answers it. Before every write, tell the player what you'll record and wait for them to confirm. Send each with `submit_battle_action`, using the battle's current `seq` as `expectedSeq`.

1. **Format.** `configure-battle` with only the fields to change, such as `missionPackId`.
2. **Armies.** `list_my_rosters`, then `attach-saved-roster` for each seat. A practice opponent fields one of the player's own rosters; pass its seat as `playerId`. `set-painted` for each battle-ready army.
3. **Warlord** and **Mission**, allied sides only: `set-side-warlord` and `set-side-disposition` from the choices on that side's players.
4. **Battlefield.** The player picks one of `next.battlefields`; send `set-battlefield` with its `patternId` and `terrainLayoutId`.
5. **Defender.** The players roll off at the table. Record the attacker with `set-attacker`; the other side defends and deploys first.
6. **Secondaries.** For each side, `set-secondaries` with `mode` `tactical` or `fixed`; fixed also takes two keys from `next.secondaryOptions` where `fixed` is true. Use the `choose-secondaries` skill if they want help choosing.
7. **Reserves.** Only for units not starting on the battlefield: `set-unit-formation`.
8. **Deploy.** Nothing to record. The defender deploys first at the table.
9. **First turn.** The players roll off. Record the winner with `set-first-turn`.
10. When `next.begin.refusal` is null, send `next.begin.send` (`begin-battle`). Until then, tell the player what the refusal says is missing.

Read the battle again after each write; `next` updates. Use `track-a-battle` once it begins. Link the battle at `/battles/<token>` so they can open it at the table.
