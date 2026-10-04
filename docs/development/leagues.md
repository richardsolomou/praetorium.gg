# Leagues

Leagues organize registration, sealed rosters, and entrant-started battles. They do not generate pairings, schedules, or standings. `src/core/league.ts` owns decisions; `src/server/services/leagueService.ts` owns application operations. [Interface](interface.md#battles-and-leagues) owns presentation.

## Events

Creating a league creates its first event atomically. At most one event has open registration; another can start after reveal. League identity, organizer, settings, and invite link persist, while entrants, assignments, teams, and snapshots belong to one event. Prior events stay readable; returning players join again.

1v1 assigns the event's roster size. 2v1 requires solo and allied roles; 2v2 requires fixed teams of two. Read `src/core/tableShape.ts` and league decisions for their sizes and minimum places. Team rosters are independently legal and share one eligible Warlord. Remaining unsupported cross-army uniqueness rules require manual review.

Changing an open event's shape is allowed only before the first seal and atomically clears obsolete assignments/teams. League settings and event changes save together. Player limits must seat the format and existing accepted entrants; a revealed event no longer constrains future-event limits.

Deleting a league deletes its events and snapshots. Existing battles keep their own command-log copies.

## Visibility and entry

Public leagues are listed; private leagues are discoverable by their opaque link. Joining and submission require an account. Past participants retain access to their private league.

Admission can be automatic or organizer-approved. Directly added friends are accepted atomically after friendship and capacity checks. Switching to automatic entry or Accept all admits oldest requests first up to the accepted-player limit. Pending requests do not consume those configured places, but total active entries remain bounded. A configured player limit is also a reveal requirement.

Use `visibleLeagueEntries` and `leagueRegistrationFull` for reads and controls. Rejected requests remain visible only to their player and organizer and may be accepted again before reveal.

## Roster sealing

Only accepted entrants with resolved size/team assignments may seal. Server submission reprices the selected saved list, checks its exact size and unwaived legality, validates the frozen snapshot, removes the saved ID, and stores it atomically. Incomplete catalogue validation remains a warning. Waived restrictions require confirmation and remain visible in the snapshot.

Outside doubles, every roster has one eligible Warlord. A first doubles roster may have zero or one; once both exist, the team must contain exactly one. Freeze source-backed eligibility rather than inferring it from names.

Saved edits never change `league_event_entries.roster_snapshot`. Before reveal, an entrant can replace it deliberately. Reassignment/re-pairing clears every affected snapshot atomically. Compare saved choices with the sealed copy to warn about changed unrevealed lists; restoration clears the warning.

Detail reads expose submission status and frozen name, not roster JSON. Before reveal, only `readsAlliedLeagueRoster` grants another entrant access: a fixed doubles teammate or fellow 2v1 allied entrant. Organizer status grants no extra roster access. Reassignment revokes the old alliance immediately. SQL narrows candidates; the domain decides access.

## Reveal

`leagueRevealChecklist` supplies structural checks to both UI and command. Reveal additionally validates the sealed rosters and Warlords in one organizer-owned transaction. Require accepted entrants, complete assignments/snapshots, valid team composition, no pending approval requests, and all configured places filled. Checklist completion alone is not proof that roster validation passed.

Reveal is irreversible, closes registration/assignment/submission, and makes accepted snapshots readable without closing the league. The organizer may unseal one roster afterward: discard only that snapshot and reopen its submission. The event stays revealed; an entrant without a snapshot cannot start a battle. A replacement uses ordinary pricing and Warlord validation.

## Battles

Accepted entrants in a revealed event choose a valid opposing composition. The server derives fixed teammates and verifies every sealed roster size; no friendship is required within this boundary.

Creation copies snapshots and appends `lock-league-rosters` in one transaction. The lock preserves event identity and prevents roster replacement/removal, reset, size changes, and adding a side. Saved-list or catalogue updates cannot rewrite it. Event battle history is read-only and respects battle field visibility.

Ordinary creation detects exact matchups from revealed events and directs the player to that event. Proceeding as an unlinked casual battle requires explicit confirmation.

## Verification

Exercise admission/capacity races, organizer and ally access before/after reassignment, saved-versus-sealed restoration, team Warlords, atomic invalidation, irreversible reveal, unseal/reseal, and immutable event-linked battles. Use adjacent tests and `e2e/leagues.spec.ts`, then inspect open and revealed event layouts on phones.
