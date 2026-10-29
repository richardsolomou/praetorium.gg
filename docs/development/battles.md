# Battles

`src/core/battle.ts` owns commands, legality, and the fold; `src/core/battleView.ts` is the only field-visibility decision.

- Submission validates and appends atomically against `expectedSeq`, which covers the whole log. Never automatically resend a `stale` command with a newer sequence.
- A queued offline command keeps its operation ID, sequence, rules revision, time, and random draw through retries: never rebase, revalidate, or redraw it.
- Every battle with a seated account is public (`mayWatch`). Practice battles stay out of feeds, standings, and records.
- Attaching a roster rechecks ownership, price, and legality on the server, then freezes it; later edits never rewrite a battle.
- Ability alerts belong to the player, not the list (`ability_reminders`, or browser storage for a visitor), keyed by `reminderKey`. Fielding freezes one per holding unit through `fieldingReminders`, so a borrowed list fields the borrower's. Frozen alerts and unit notes are owner-only: strip them from every other read.
- A guest acts only as their own seat through the same `mutationRpc` checks (`src/server/guestSession.ts`); their name never enters the log.
- Every write to a battle's log or seats in `spacetimedb/src/index.ts` goes through `touchBattle`. The leaderboard keeps its own fold of finished battles (`src/server/standingResults.ts`) and rereads only the battles `battle_changes` names, so a write that skips it never reaches the ratings.
- Realtime subscriptions carry IDs and counters, never product state; clients refetch through permission-checked reads and fall back to polling when a subscription fails.
