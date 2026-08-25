# Leagues

A league is a lightweight organized-play home for one or more events. An event collects entrants and seals one roster from each accepted player. It does not schedule games, calculate standings, create pairings, or rank players.

## Events

Every league contains events. A one-off league contains one event and hides the extra hierarchy. Its organizer can make it recurring later without changing the current event, but cannot change it back to one-off. A recurring league exposes its event history and lets the organizer start another event after the current event reveals.

Each event starts with no entrants. A player who joined an earlier event must join again, so returning players and new players follow the same registration path. League identity, organizer, visibility, admission policy, player limit, and invite link persist between events. Entrants, roster snapshots, and reveal state do not.

Starting an event creates new rows rather than clearing the previous event. Prior registration, roster snapshots, and battles remain readable. At most one event has open registration: the organizer must reveal the current event before starting the next one.

## Visibility and entry

Public leagues appear in the leagues index. Private leagues are unlisted and shared by their stable opaque link. Both use the same detail page and require an account to join or submit. A signed-in player continues to see a private recurring league after participating in an earlier event, even before joining the current event.

The organizer chooses automatic entry or approval when creating the league. Approval events create pending entries. The organizer may accept, reject, or remove entrants until reveal. An event accepts at most 128 active entries and may use the league's lower accepted-player limit. Approval requests do not consume those configured places, but total active requests remain bounded at 128. When a player limit is set, every place must be accepted before reveal.

## Roster sealing

Only an accepted event entrant may submit. The event page loads saved-roster summaries, prices, and faction names when the chooser opens. The server prices the selected saved roster, refuses points, detachment, disposition, or catalogue legality errors, validates the complete snapshot shape used when attaching a roster to a battle, and removes the saved roster identifier before storage. Incomplete catalogue validation is a warning and does not block submission. Later edits or deletion of the saved roster do not change that snapshot. An entrant may deliberately replace the snapshot by submitting again until reveal.

The snapshot stays in `league_event_entries.roster_snapshot`. The league detail read returns only a submitted flag and the frozen roster name to its submitter, never the JSON. The dedicated roster read returns a snapshot only after the event's `revealed_at` is set, including when the requester is the organizer.

## Reveal

Reveal is one transaction owned by the organizer. It succeeds only when at least one entrant is accepted and every accepted entrant has submitted. It rejects unresolved approval requests, sets the event's `revealed_at`, closes joining and submission for that event, then makes every accepted snapshot readable. Reveal cannot be undone. Revealing a recurring event does not close its league.

## Battles

After reveal, an accepted entrant may start a 1v1 battle against any other accepted entrant in that event. They do not need a friendship because the revealed league event is the shared boundary. This is an ad hoc battle, not a pairing or schedule.

Battle creation copies both stored event snapshots into the command log and then appends `lock-league-rosters` in the same transaction. The lock records both league and event tokens and prevents roster replacement, roster removal, setup reset, battle-size changes, and adding another side. The event roster page and battle therefore read the same sealed roster data; later saved-roster or catalogue changes cannot replace it.
