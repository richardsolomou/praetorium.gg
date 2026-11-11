# Praetorium

Praetorium is an open source Warhammer 40,000 army builder, combat simulator and battle tracker. This plugin connects an assistant to Praetorium's MCP server at `https://praetorium.gg/mcp` and adds these skills, which the MCP server also serves to assistants without the plugin:

- **build-a-roster** plans an army from the faction's current units, points and detachments, sets its Warlord, enhancements and wargear, checks and grades it, and saves it to your account when you confirm.
- **import-a-list** brings in a list pasted from the official app, New Recruit or another builder, and says what didn't match.
- **grade-a-roster** grades a list the way the roster builder does, explains what it does well and lacks, and tunes it with tested swaps.
- **compare-units** runs Praetorium's combat simulator for two units, including your saved wargear, a damaged unit or the best loadout, and explains the expected casualties and odds.
- **plan-a-matchup** compares your list against an opponent's unit by unit and plans who handles their threats and who plays the mission.
- **answer-a-rules-question** finds the rule in Praetorium's reference and links the source instead of answering from memory.
- **explain-a-mission-matchup** gives the missions, deployments and terrain for two Force dispositions in a mission pack.
- **choose-secondaries** weighs fixed against tactical secondary missions for a mission and opponent.
- **set-up-a-battle** starts a battle and sets the table in the order the game does.
- **track-a-battle** records what happens in one of your battles, with stratagem reminders, after you confirm each action.
- **review-a-battle** summarises a finished game from its report.
- **review-my-battles** looks back at your results, win rates and leaderboard places.
- **play-in-a-tournament** takes you through a tournament, hidden-list game or league: sealing a list, finding your table and reporting the score.

Reference lookups, list imports, checks and grades, and the simulator work without an account. Tools for your rosters, collection, battles, tournaments and groups ask you to sign in to Praetorium, which shows a consent page listing the access requested; you can revoke it later under Connected apps on your profile.

## What it sends

The plugin runs no local code. Your assistant sends tool requests to `https://praetorium.gg/mcp`, and nowhere else. Praetorium returns names, numbers, points and calculated results with links to its pages, never rules text. See the [privacy policy](https://praetorium.gg/privacy) for what Praetorium stores.

Praetorium is unofficial and not affiliated with or endorsed by Games Workshop. [Setup and help](https://praetorium.gg/docs/connect-an-assistant).
