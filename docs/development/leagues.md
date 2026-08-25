# Leagues

A league is a lightweight organized-play event. It collects entrants and seals one roster from each accepted player. It does not schedule games, calculate standings, create pairings, or rank players.

## Visibility and entry

Public leagues appear in the leagues index. Private leagues are unlisted and shared by their opaque link. Both use the same detail page and require an account to join or submit.

The organizer chooses automatic entry or approval when creating the league. Approval leagues create pending entries. The organizer may accept, reject, or remove entrants until reveal. A league accepts at most 128 active entries and may set a lower accepted-player limit. Approval requests do not consume those configured places, but total active requests remain bounded at 128. When a player limit is set, every place must be accepted before reveal.

## Roster sealing

Only an accepted entrant may submit. The server prices the saved roster, validates the complete snapshot shape used when attaching a roster to a battle, and removes the saved roster identifier before storage. Later edits or deletion of the saved roster do not change that snapshot. An entrant may deliberately replace the snapshot by submitting again until reveal.

The snapshot stays in `league_entries.roster_snapshot`. The league detail read returns only a submitted flag and the frozen roster name to its submitter, never the JSON. The dedicated roster read returns a snapshot only after `revealed_at` is set, including when the requester is the organizer.

## Reveal

Reveal is one transaction owned by the organizer. It succeeds only when at least one entrant is accepted and every accepted entrant has submitted. It rejects unresolved approval requests, sets `revealed_at`, closes joining and submission, then makes every accepted snapshot readable. Reveal cannot be undone.

## Battles

After reveal, an accepted entrant may start a 1v1 battle against any other accepted entrant. They do not need a friendship because the revealed league is the shared boundary. This is an ad hoc battle, not a pairing or schedule.

Battle creation copies both stored league snapshots into the command log and then appends `lock-league-rosters` in the same transaction. The lock records the league token and prevents roster replacement, roster removal, setup reset, battle-size changes, and adding another side. The league roster page and battle therefore read the same sealed roster data; later saved-roster or catalogue changes cannot replace it.
