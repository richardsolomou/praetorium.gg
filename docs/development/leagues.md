# Leagues

Leagues organize registration, sealed rosters, entrant-started battles, and a results table. They do not generate pairings or schedules. `src/core/league.ts` owns decisions, `leagueResults.ts` the results table, `tableShape.ts` formats and minimum places, and `src/server/services/leagueService.ts` application operations. [Interface](interface/surfaces.md#battles-and-leagues) owns presentation.

## Events

Copy says league for the whole league and numbers events only once there is more than one. Creating a league creates its first event atomically; at most one event has open registration, and another can start after reveal. Entrants, assignments, teams, and snapshots belong to one event. 2v1 allies and 2v2 teams are fixed pairs for the event; doubles rosters are independently legal, and unsupported cross-army uniqueness rules need manual review. Shape changes only before the first seal, atomically clearing obsolete assignments and teams. Deleting a league deletes its events and snapshots; battles keep their own copies.

## Organizers

The owner may name up to `LEAGUE_ADMIN_MAX` friends as admins; `isLeagueOrganizer` gives them every organizer operation except deleting the league or changing admins. Removal ends access at once.

## Visibility and entry

Public leagues are listed; private ones are reachable by opaque link, so new leagues default to automatic admission. Joining and submission require an account; past participants keep access. Direct adds check friendship and capacity atomically; bulk admission takes oldest requests first. Use `visibleLeagueEntries` and `leagueRegistrationFull`. Rejected requests may be accepted again before reveal.

## Roster sealing

Only accepted entrants with resolved assignments may seal. Submission reprices the saved list against its rules version (preview, released, or archived), checks exact size and unwaived legality, and stores the frozen snapshot and original saved roster ID atomically. Incomplete validation is a warning; waived restrictions need confirmation and stay visible.

Freeze source-backed eligibility rather than inferring it from names; both seal paths explain refusals through `leagueWarlordRefusal`.

Saved edits never change `league_event_entries.roster_snapshot`; before reveal an entrant may replace it deliberately. Reassignment and re-pairing clear affected snapshots atomically, except that pairing a 2v1 ally keeps its list.

## Team Force Disposition

A fixed pair plays one Force Disposition, chosen before reveal so it cannot answer the opposing lists. `src/core/teamDisposition.ts` applies the battle's allied-side rule to the sealed lists, and the pick lives in `league_event_teams`. Reveal fixes every pair's pick, so a list resealed after an unseal must keep it on offer. Before reveal only the pair reads its choices.

Detail reads expose submission status and frozen name, not roster JSON. Before reveal, only `readsSealedLeagueRoster` and `readsAlliedLeagueRoster` grant roster access; organizers get no extra access, and reassignment revokes it immediately. SQL narrows candidates; the domain decides access.

## Reveal

`leagueRevealChecklist` feeds both UI and command. `mayRevealLeague` decides who reveals, and the event records who; nothing reveals automatically, even when full. Reveal is irreversible and closes registration, assignment, and submission. The organizer may then unseal one roster: the event stays revealed, that entrant cannot start battles until resealing, and the replacement gets ordinary validation.

## Sharing revealed rosters

After reveal, `LeagueRosterSharing` offers each entrant the publication [Product design](../product-design.md#publication-and-retained-copies) describes. Publish only the original saved roster the entrant's submission identifies; never create or substitute a copy, and never publish through reveal or an organizer action. Hide the offer when that roster is missing, belongs to another account, or is already public. Publication checks the submitted timestamp and original roster ID within its transaction.

`league_roster_sharing` remembers an event's dismissal or publication across devices. Unseal and reseal do not ask again for the same event. The original roster keeps ordinary visibility and deletion controls.

## Battles

The server derives fixed teammates and pairs and verifies sealed sizes; no friendship is required. A 2v1 event revealed before allies were paired lets an entrant name both allies. Creation copies snapshots and appends `lock-league-rosters` in one transaction. Event battles keep field visibility. Ordinary creation detects exact event matchups and needs explicit confirmation to proceed unlinked.

## Results

Finished battles count, including manual ones. The table folds the feed's largest page and says when there are more.

## Verification

Use adjacent tests and `e2e/leagues.spec.ts`, covering admission races, access across reassignment, Force Dispositions across reveal, unseal/reseal, and admin-less saved data. Inspect open and revealed event layouts on phones.
