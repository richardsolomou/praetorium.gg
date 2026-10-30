# Battles

`src/core/battle.ts` owns commands, legality, and the fold; `src/core/battleView.ts` is the only field-visibility decision.

- Submission validates and appends atomically against `expectedSeq`, which covers the whole log. Never automatically resend a `stale` command with a newer sequence.
- A queued offline command keeps its operation ID, sequence, rules revision, time, and random draw through retries: never rebase, revalidate, or redraw it.
- Every battle with a seated account is public (`mayWatch`). Practice battles stay out of feeds, standings, and records.
- Attaching a roster rechecks ownership, price, and legality on the server, then freezes it; later edits never rewrite a battle.
- Ability alerts belong to the player, not the list (`ability_reminders`, or browser storage for a visitor), keyed by `reminderKey`. Fielding freezes one per holding unit through `fieldingReminders`, so a borrowed list fields the borrower's. Frozen alerts and unit notes are owner-only: strip them from every other read.
- A guest acts only as their own seat through the same `mutationRpc` checks (`src/server/guestSession.ts`); their name never enters the log.
- Every write in `spacetimedb/src/index.ts` that can change a counted battle's fold (its log, or who holds its seats) goes through `touchBattle`; guest invite writes only touch `touchBattleSeats`, since guest battles never count. The leaderboard and achievements read `battle_results`, which `src/server/standingsRefresh.ts` rewrites only for the battles `battle_changes` names, so a write that skips it never reaches the ratings or medals.
- `battle_results`, `rating_steps` and `standings` are derived from the logs and only the standings refresh writes them; no battle screen reads them. A refresh runs only once the public `standings` revision moves, so every write that can change a finished battle's result (finishing, reopening or undoing it, claiming or removing its seats, deleting it or its commands) must raise it. Ratings replay from the earliest finish a changed result touches (`ratingsFrom`), so anything that changes which battles count must move it back: `practiceChanged` replays everything.
- A player's medals are rechecked only when `achievement_checks` says a write could have moved them: `touchProduct` on the scopes in `ACHIEVEMENT_SCOPES`, a changed battle result for everyone `battleAchievers` names, or a call to `recheckAchievements`. A write that changes a medal's inputs without one of these leaves stored medals stale.
- Realtime subscriptions carry IDs and counters, never product state; clients refetch through permission-checked reads and fall back to polling when a subscription fails.
