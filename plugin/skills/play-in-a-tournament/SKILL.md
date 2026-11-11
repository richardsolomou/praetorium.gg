---
name: play-in-a-tournament
description: Take a signed-in player through a tournament, hidden-list game or group league: join, seal a list, find their table, start the battle and report the score. Use when someone asks what's due, wants to seal a list, or asks who they play next.
---

# Play in a tournament

These tools need the player's Praetorium account. If a tool asks for sign-in, explain that tournaments need their account and let them connect it. You act as the player only: pairing rounds, admitting players, revealing lists, round clocks and battlefields stay with the organizer on its page. Call it a tournament or a hidden-list game when you talk to the player, never an event.

## Find it

1. Call `list_my_events`. It lists the player's groups, tournaments and hidden-list games. If they name one they're not in, or have an invite link, take the token from the link (`/tournaments/<token>` or `/groups/<token>`), or call it again with `includeOpen` for public ones.
2. Call `get_my_event` for a tournament or hidden-list game, or `get_my_group` for a group and its league. Ask when more than one could match.
3. Tell the player what `todo` says, with any deadline (`sealBy`, `roundEndsAt`, a league round's `deadline`). Read it again before each step; don't rely on an earlier answer.

To join, call `join_event` or `join_group` once the player confirms. `pending` means an organizer approves each player; they wait until let in.

## Seal a list

1. Pick a roster from `list_my_rosters` built to its `rules.size`, or to `you.sealAt` in a 2v1 or doubles game, and to `rules.pointsBudget` when it sets one.
2. Call `get_my_roster` and check its `summary.problems` is empty. A list must also have a Warlord, and Legends or Crucible units only when `rules.allows` names them. Fix problems with the build-a-roster skill first.
3. Tell the player which roster you will seal, and wait for them to confirm. Then call `submit_event_roster`.
4. If it's refused, tell them the reason as given. In a 2v1 or doubles game the organizer gives each player a size or team first, and a group's hidden-list game asks you to choose your side on its page.

Sealing stores a copy: editing the saved roster later doesn't change it, so seal again to swap it. Before the reveal only the player and their assigned ally can read it, and nobody's list is shown until then. A pair still choosing its Force Disposition or Warlord does that on its page.

## Play your table

1. In Swiss rounds, `rounds.yourTable` names this round's opponent. Before round 1, `check_in_event` marks the player as arrived.
2. To play on Praetorium, confirm with the player, then call `start_event_battle`; in Swiss rounds it plays the paired opponent. Without Swiss rounds, name the opponent from `entrants`. Both sealed lists are attached for you. Then follow the set-up-a-battle skill and track it with track-a-battle.
3. For a game not tracked here, ask for both final scores, and report only once both players agree on them. Then call `report_table_result` with the player's score and their opponent's.

A result locks once the next round is paired. If it's wrong, the player asks the organizer to reopen it, then corrects the score and finishes the battle again.

## Group leagues

A league is a group's round robin. While it's a draft, `join_league` adds the player. Once published, each open fixture in `league.yourFixtures` has a `start`: pass it to `create_battle` to play that fixture, with lists picked at setup rather than sealed. A fixture's battle counts for the league and the group's leaderboard.

Withdrawing from a tournament or league can't be undone, so send the player to its page for it.
