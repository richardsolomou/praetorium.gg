---
name: choose-secondaries
description: Help a Warhammer 40,000 player choose between Tactical and Fixed secondary missions for a mission and opponent, from the secondary cards in Praetorium's reference. Use when someone asks which secondaries to take, or whether to go fixed or tactical.
---

# Choose secondaries

1. You need the mission pack, both force dispositions, and what the player and opponent are fielding. In a battle, `get_my_battle` gives the missions in its `Mission` step and the cards on offer in `next.secondaryOptions`.
2. Call `get_mission_matchup` for the player's primary and its caps, including the cap on each fixed secondary.
3. Find the candidate cards with `search_reference` (kind `mission`) and read each with `get_reference_record`. A card's record gives its fixed and tactical scoring. Fetch its `textSources` for the conditions themselves. Never describe a card from memory.
4. Weigh the cards against the opponent's list (`get_my_roster`, or ask what they're fielding). For example, a card that pays for destroying a unit type is worth less when the opponent fields few of them.
5. Recommend fixed or tactical. With fixed, name two cards that can be taken fixed, and say what each needs to score and its cap. Make clear it's a judgement from the card's scoring, not a guarantee.

In a battle, record the choice with `set-secondaries` once the player confirms, as `set-up-a-battle` describes.
