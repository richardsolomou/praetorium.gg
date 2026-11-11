---
name: review-my-battles
description: Look back at a player's Praetorium battles and record, such as results against an army, win rates by detachment or mission pack, and leaderboard places. Use when someone asks how they've been doing, who they lose to, or to find a past game.
---

# Review my battles

These tools need the player's Praetorium account. If a tool asks for sign-in, explain that battles need their account and let them connect it.

1. For their record, call `get_my_stats`. Narrow it with `faction`, `detachment`, `opponentFaction`, `opponentDetachment` or `missionPackId` when the question does. Its rankings cover every battle, whatever the filters.
2. To find or list games, call `list_my_battles` with a `filter`, such as `result` `{ "in": ["lost"] }`, `against` a faction slug, or a `period`. Follow `nextCursor` only as far as the question needs.
3. Report numbers as the tools give them, and link the battles you mention.

The record leaves out practice games. Don't infer why a player won or lost from a result alone; say what the record shows.
