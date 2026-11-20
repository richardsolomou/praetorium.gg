---
name: play-in-a-tournament
description: Take a signed-in player through a tournament, hidden-list game or group league: join, seal a list, find their table, start the battle and report the score. Use when someone asks what's due, wants to seal a list, or asks who they play next.
---

# Play in a tournament

These tools need the player's Praetorium account. If a tool asks for sign-in, explain that tournaments need their account and let them connect it. Use the player's view for their own tasks. If an organizer asks for changes, identify the tournament and affected players or tables and wait for confirmation. Praetorium checks their organizer permissions. Call it a tournament or a hidden-list game when you talk to the player, never an event.

## Find it

1. Call `list_my_events`. It lists the player's groups, tournaments and hidden-list games. If they name one they're not in, or have an invite link, take the token from the link (`/tournaments/<token>` or `/groups/<token>`), or call it again with `includeOpen` for public ones.
2. Call `get_my_event` for a tournament or hidden-list game, or `get_my_group` for a group and its league. Ask when more than one could match.
3. Tell the player what `todo` says, with any deadline (`sealBy`, `roundEndsAt`, a league round's `deadline`). Read it again before each step; don't rely on an earlier answer.

To join, call `join_event` or `join_group` once the player confirms. `pending` means an organizer approves each player; they wait until let in.

For a league fixture, read `get_my_group` and use its `startTool` with the supplied `start` arguments. If a fixture lists players in `waitingForRoster`, they need to seal before it can start.

## Seal a list

1. Pick a roster from `list_my_rosters` built to its `rules.size`, or to `you.sealAt` in a 2v1 or doubles game, and to `rules.pointsBudget` when it sets one.
2. Call `get_my_roster` and check its `summary.problems` is empty. A list must also have a Warlord, and Legends or Crucible units only when `rules.allows` names them. Fix problems with the build-a-roster skill first.
3. Tell the player which roster you will seal, and wait for them to confirm. Then call `submit_event_roster`.
4. If it's refused, tell them the reason as given. In a 2v1 or doubles game the organizer gives each player a size or team first, and `choose_hidden_list_side` sets your side in a group's hidden-list game.

Sealing stores a copy: editing the saved roster later doesn't change it, so seal again to swap it. Before the reveal only the player and their assigned ally can read it, and nobody's list is shown until then. A player who plays alone seals their Force Disposition with the list: when it offers several, ask which and pass `disposition`. A pair can use `set_event_team_disposition` and `set_event_team_warlord` for its shared choices.

## Play your table

1. In Swiss rounds, `rounds.yourTable` names this round's opponent. Before round 1, `check_in_event` marks the player as arrived.
2. To play on Praetorium, confirm with the player, then call `start_event_battle`; in Swiss rounds it plays the paired opponent. Without Swiss rounds, name the opponent from `entrants`. Both sealed lists are attached for you. Then follow the set-up-a-battle skill and track it with track-a-battle.
3. For a game not tracked here, ask for both final scores, and report only once both players agree on them. Then call `report_table_result` with the player's score and their opponent's.

In a team tournament (`rules.teams`), the player starts or joins a team with `set_tournament_team` before the reveal. Each round their team meets another in `rounds.meetings`, and the two teams choose who plays whom with `pick_tournament_team_players`, step by step: a defender, then two attackers, then which attacker their defender plays. Each pick stays secret until both teams have chosen; `picksRevealed` holds the steps already out. Once every game is paired, `rounds.yourTable` names the opponent. `teamStandings` ranks the teams.

A result locks once the next round is paired. If it's wrong, an organizer can use `reopen_tournament_table`; the players can then correct the score and finish the battle again.

## Group leagues

A league is a group's round robin. While it's a draft, use `join_league` for an open-list league or `submit_event_roster` for a league that seals lists. Once published, use the fixture's `startTool` and `start` from `league.yourFixtures`. A fixture's battle counts for the league and the group's leaderboard.

Confirm with the player before calling `withdraw_from_event` or `leave_league`.
