---
name: explain-a-mission-matchup
description: Explain which primary missions, deployments and terrain two Warhammer 40,000 force dispositions get in a mission pack, from Praetorium. Use when someone asks what mission they play against an opponent's disposition, or how to set up a game in the current pack.
---

# Explain a mission matchup

1. You need a mission pack and both players' force dispositions. If the player names a detachment instead, find its disposition with `search_reference` (kind `disposition`). Ask for anything you can't find.
2. Call `get_mission_matchup` with the pack and both dispositions. If it refuses a name, use one of the options it lists.
3. Report each side's primary mission with its scoring caps, the deployment and terrain options for the pairing, and the matchup link.
4. For a mission's scoring or actions, read its record with `get_reference_record` and fetch its `textSources` if the wording matters.

Don't describe a mission card from memory. If the pack doesn't pair those dispositions, say so.
