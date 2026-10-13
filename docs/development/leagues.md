# Leagues

Leagues organize registration, sealed rosters, entrant-started battles, and a results table from those battles. They do not generate pairings or schedules. `src/core/league.ts` owns decisions, `src/core/leagueResults.ts` owns the results table, and `src/server/services/leagueService.ts` owns application operations. [Interface](interface.md#battles-and-leagues) owns presentation.

## Events

Player-facing copy says league when it means the whole league and numbers an event only once a league has more than one.

Creating a league creates its first event atomically. At most one event has open registration; another can start after reveal. League identity, organizer, settings, and invite link persist, while entrants, assignments, teams, and snapshots belong to one event. Prior events stay readable; returning players join again.

1v1 assigns the event's roster size. 2v1 requires solo and allied roles; 2v2 requires fixed teams of two. Read `src/core/tableShape.ts` and league decisions for their sizes and minimum places. Team rosters are independently legal and share one eligible Warlord. Remaining unsupported cross-army uniqueness rules require manual review.

Changing an open event's shape is allowed only before the first seal and atomically clears obsolete assignments/teams. League settings and event changes save together. Player limits must seat the format and existing accepted entrants; a revealed event no longer constrains future-event limits. A player limit caps entry rather than holding the reveal back.

Deleting a league deletes its events and snapshots. Existing battles keep their own command-log copies.

## Organizers

The owner may name up to `LEAGUE_ADMIN_MAX` admins from their friends. `isLeagueOrganizer` gives admins every organizer operation, including starting the next event, editing settings, admitting or adding players, assigning sizes and teams, revealing, and unsealing. Only the owner deletes the league or changes its admins. An admin adds their own friends, plays as themselves when they start an event, and receives join requests with the owner. Removing an admin, or deleting their account, ends their access at once; the league stays with its owner.

Saved league responses and queued drafts can predate admins. Migrate missing `admins` and `adminIds` to empty arrays when parsing application snapshots and local work, before restoring or projecting query data. Keep components on the current shape instead of adding per-screen compatibility fallbacks. Server authorization still uses current membership. Exercise restoration and roster replacement through `e2e/leagues.spec.ts`.

## Visibility and entry

Public leagues are listed; private leagues are discoverable by their opaque link. Joining and submission require an account. Past participants retain access to their private league.

Admission can be automatic or organizer-approved; new leagues default to automatic, because a private link is already the way in. Directly added friends are accepted atomically after friendship and capacity checks. Switching to automatic entry or Accept all admits oldest requests first up to the accepted-player limit. Pending requests do not consume those configured places, but total active entries remain bounded.

Use `visibleLeagueEntries` and `leagueRegistrationFull` for reads and controls. Rejected requests remain visible only to their player and organizer and may be accepted again before reveal.

## Roster sealing

Only accepted entrants with resolved size/team assignments may seal. Server submission reprices the selected saved list, checks its exact size and unwaived legality, validates the frozen snapshot, removes the saved ID, and stores it atomically. Incomplete catalogue validation remains a warning. Waived restrictions require confirmation and remain visible in the snapshot.

Preview, released, and archived rules may be sealed. Submission prices the roster against its selected rules version and freezes that version's metadata with the roster. [Catalogue data](catalogue-data.md#composing-sources-and-publishing-rules-versions) owns the rules-version lifecycle.

Outside doubles, every roster has one eligible Warlord. A first doubles roster may have zero or one; once both exist, the team must contain exactly one. Freeze source-backed eligibility rather than inferring it from names.

Saved edits never change `league_event_entries.roster_snapshot`. Before reveal, an entrant can replace it deliberately. Reassignment/re-pairing clears every affected snapshot atomically. Compare saved choices with the sealed copy to warn about changed unrevealed lists; restoration clears the warning.

Detail reads expose submission status and frozen name, not roster JSON. Before reveal, only `readsAlliedLeagueRoster` grants another entrant access: a fixed doubles teammate or fellow 2v1 allied entrant. Organizer status grants no extra roster access. Reassignment revokes the old alliance immediately. SQL narrows candidates; the domain decides access.

## Reveal

`leagueRevealChecklist` supplies structural checks to both UI and command. Reveal additionally validates the sealed rosters and Warlords in one transaction. Require an accepted entrant, complete assignments/snapshots, valid team composition, and no pending approval requests in doubles. Checklist completion alone is not proof that roster validation passed.

Before reveal, everyone reading the event sees whose list is sealed. The organizer or any accepted entrant reveals once every check passes (`mayRevealLeague`), and the event records who did. An event with a player limit also reveals itself, through `leagueRevealsItself`, inside the seal that fills its last place when every check passes; the seal result reports the revealed entrants so the service notifies them. A failed roster validation leaves the event sealed for the organizer to resolve.

Reveal is irreversible, closes registration/assignment/submission, and makes accepted snapshots readable without closing the league. The organizer may unseal one roster afterward: discard only that snapshot and reopen its submission. The event stays revealed; an entrant without a snapshot cannot start a battle. A replacement uses ordinary pricing and Warlord validation.

Once revealed, the lists lead the event page. Cards stack one per line like the roster library and reuse its `RosterSummary` for the sealed copy from `leagueArmy`, naming detachments as sealed and the army as battle summaries do. They group under the same 2v1 side and doubles team headings as the entrant list. A header names the player, with borderless icon actions: the organizer's Unseal roster first, opening its confirmation, then Simulate (calculator) for a reader with their own sealed list, then View list. The card body also opens the full list. The entrant list is hidden once lists are revealed, since every player shows with their list. Start the planner with the viewer's roster attacking the selected entrant; Reverse direction checks incoming damage. Use the sealed copies and the existing roster-access read, without changing league submissions or battle state. [Combat simulation](combat-simulation.md#interface-and-context) owns the matrix, assumptions, and verification. Before reveal, an entrant row offers only an ally's list.

## Battles

Accepted entrants in a revealed event choose a valid opposing composition. A duel entrant who joins without needing an assignment goes straight to the list chooser; a saved list matching an open entry's required size links back to seal it from the builder. The server derives fixed teammates and verifies every sealed roster size; no friendship is required within this boundary.

Creation copies snapshots and appends `lock-league-rosters` in one transaction. The lock preserves event identity and prevents roster replacement/removal, reset, size changes, and adding a side. Saved-list or catalogue updates cannot rewrite it. Event battle history is read-only and respects both the narrowest-seat battle audience and battle field visibility. An event's reveal or link never widens access to a private battle.

Ordinary creation detects exact matchups from revealed events and directs the player to that event. Proceeding as an unlinked casual battle requires explicit confirmation.

## Results

A revealed event's results fold the event battles its reader may watch, so a private battle stays out of everybody else's table as it stays out of their battle list. Finished battles count, including manually tracked ones; wins rank first, then draws, then victory points, which follow the side as the leaderboard counts them. Any started battle counts as a meeting, so a duel entrant sees who they have not played yet. The table folds the battle feed's largest page and says when an event has more battles than that.

## Verification

Exercise admission/capacity races, organizer and ally access before/after reassignment, saved-versus-sealed restoration, team Warlords, atomic invalidation, irreversible and self-revealing events, unseal/reseal, results from finished and private battles, and immutable event-linked battles. Use adjacent tests and `e2e/leagues.spec.ts`, then inspect open and revealed event layouts on phones.
