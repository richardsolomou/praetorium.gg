# Leagues

Leagues organize registration, sealed rosters, entrant-started battles, and a results table. They do not generate pairings or schedules. `src/core/league.ts` owns decisions, `leagueResults.ts` the results table, `tableShape.ts` formats and minimum places, and `src/server/services/leagueService.ts` application operations. [Interface](interface.md#battles-and-leagues) owns presentation.

## Events

Copy says league for the whole league and numbers events only once there is more than one. Creating a league creates its first event atomically; at most one event has open registration, and another can start after reveal. Entrants, assignments, teams, and snapshots belong to one event. 2v1 allies and 2v2 teams are fixed pairs for the event; doubles rosters are independently legal, and unsupported cross-army uniqueness rules need manual review. Shape changes only before the first seal, atomically clearing obsolete assignments and teams. Player limits must seat the format and accepted entrants, and never hold back reveal. Deleting a league deletes its events and snapshots; battles keep their own copies.

## Organizers

The owner may name up to `LEAGUE_ADMIN_MAX` friends as admins; `isLeagueOrganizer` gives them every organizer operation except deleting the league or changing admins. Removal ends access at once. Saved responses and queued drafts can predate admins: migrate missing `admins`/`adminIds` to empty arrays when parsing, not in components.

## Visibility and entry

Public leagues are listed; private ones are reachable by opaque link, so new leagues default to automatic admission. Joining and submission require an account; past participants keep access. Direct adds check friendship and capacity atomically; bulk admission takes oldest requests first. Pending requests take no places, but active entries stay bounded. Use `visibleLeagueEntries` and `leagueRegistrationFull`. Rejected requests are visible only to their player and organizers and may be accepted again before reveal.

## Roster sealing

Only accepted entrants with resolved assignments may seal. Submission reprices the saved list against its rules version (preview, released, or archived), checks exact size and unwaived legality, and stores the frozen snapshot atomically without the saved ID. Incomplete validation is a warning; waived restrictions need confirmation and stay visible.

Outside doubles every roster has one eligible Warlord; in doubles the first roster may have zero or one and the team exactly one. Freeze source-backed eligibility rather than inferring it from names; both seal paths explain refusals through `leagueWarlordRefusal`.

Saved edits never change `league_event_entries.roster_snapshot`; before reveal an entrant may replace it deliberately. Reassignment and re-pairing clear affected snapshots atomically, except that pairing a 2v1 ally keeps its list.

## Team Force Disposition

A fixed pair plays one Force Disposition, chosen before reveal so it cannot answer the opposing lists. `src/core/teamDisposition.ts` applies the battle's allied-side rule: once both lists are sealed, either member picks from every card either list's detachments offered (`built.dispositions`). The pick in `league_event_teams` counts only while the sealed lists still offer it. Reveal requires every pair to have one and fixes it, so a list resealed after an unseal must keep it on offer. Before reveal only the pair reads its choices.

Detail reads expose submission status and frozen name, not roster JSON. Before reveal, `readsSealedLeagueRoster` and `readsAlliedLeagueRoster` grant an entrant only their own list and a fixed teammate's or fellow 2v1 ally's; organizers get no extra access, and reassignment revokes it immediately. SQL narrows candidates; the domain decides access.

## Reveal

`leagueRevealChecklist` feeds both UI and command, but reveal also validates rosters and Warlords in its transaction, so a complete checklist is not proof. The organizer or any accepted entrant reveals (`mayRevealLeague`), and the event records who; nothing reveals automatically, even when full. Reveal is irreversible and closes registration, assignment, and submission. The organizer may then unseal one roster: the event stays revealed, that entrant cannot start battles until resealing, and the replacement gets ordinary validation. The revealed-list [simulator](combat-simulation.md#interface-and-context) reads sealed copies and never changes submissions or battles.

## Battles

The server derives fixed teammates and pairs and verifies sealed sizes; no friendship is required. A 2v1 event revealed before allies were paired lets an entrant name both allies. Creation copies snapshots and appends `lock-league-rosters` in one transaction. The lock preserves event identity, blocks roster replacement, reset, size changes, and new sides, and carries each pair's sealed Force Disposition (events revealed before pairs chose leave it to setup). Event battles keep battle audience and field visibility; reveal never widens access to a private battle. Ordinary creation detects exact event matchups and needs explicit confirmation to proceed unlinked.

## Results

Results fold only battles the reader may watch, so a private battle stays out of other tables. Finished battles count, including manual ones; any started battle counts as a meeting. The table folds the feed's largest page and says when there are more.

## Verification

Use adjacent tests and `e2e/leagues.spec.ts`, covering admission races, access across reassignment, Force Dispositions across reveal, unseal/reseal, admin-less saved data, and private battles in results. Inspect open and revealed event layouts on phones.
