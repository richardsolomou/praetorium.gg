# Leagues

A league is a lightweight organized-play home for one or more events. An event collects entrants and seals one roster from each accepted player. It does not schedule games, calculate standings, create pairings, or rank players.

## Events

Every league starts with Event 1, exposes its event history, and lets the organizer start another event after the current event reveals. A league used once remains a single-event league without requiring a separate mode.

Each event starts with no entrants. A player who joined an earlier event must join again, so returning players and new players follow the same registration path. League identity, organizer, visibility, admission policy, player limit, and invite link persist between events. Entrants, roster-size assignments, roster snapshots, and reveal state do not carry between events.

Creating a league asks only who may see it and who may join it. Event 1 opens as a 1v1 at the default roster size, and the organizer settles the battle format and roster size on the league page. Later events take theirs when the organizer starts them.

A 1v1 event gives every entrant the event's roster size automatically. A 2v1 event uses a 2,000-point solo roster against two 1,000-point allied rosters. The organizer assigns each accepted entrant either the solo or allied size. The assignment belongs to that event entry, so the same player may have a different size in another event. A 2v1 event needs at least one solo entrant and two allied entrants, but it may contain any larger mix because it does not create pairings.

A 2v2 event adopts the official event-pack force size: each fixed team fields two independently legal 1,000-point rosters for a 2,000-point force. The organizer pairs accepted entrants into teams of exactly two. An event needs at least two complete teams and an even number of accepted entrants. Re-pairing or unpairing atomically clears every affected sealed snapshot because the official force composition changed. Praetorium validates each roster independently, requires exactly one eligible selected Warlord across each team, and shares force resources in battle. Catalogue-derived Warlord eligibility is frozen with the roster so upgrades that grant the Character keyword remain valid without inferring eligibility from a unit's name. The catalogue snapshots do not provide enough authoritative structure to enforce every remaining cross-army uniqueness restriction; those restrictions remain a manual responsibility for the team and organizer before reveal.

Smaller game sizes are not offered for 2v1 or 2v2 because their half-size rosters use format-specific construction rules rather than ordinary matched-play rules.

Starting an event creates new rows rather than clearing the previous event. Prior registration, roster snapshots, and battles remain readable. At most one event has open registration, and the next event becomes available only after the current event reveals.

## Organizer controls

The organizer can rename a league, change its details, switch its visibility, and switch its admission at any time. Turning approval into automatic entry accepts the requests already waiting, oldest first, until the configured places run out. While registration is open, the player limit cannot be lower than the accepted entrant count or the three places a 2v1 event needs. It can change freely between events so a league can move between 1v1 and 2v1. These league properties govern the current and future registration without rewriting earlier event entries, sealed roster snapshots, reveal state, or battles.

The open event's battle format and roster size change until its first roster is sealed, and the change clears every roster-size assignment and team, which were made under rules that no longer apply. After the first seal they are fixed for that event; a different shape is the next event's to take. A change is refused when the league's player limit cannot seat the shape.

Deleting a league permanently deletes its event history, entries, and sealed league roster snapshots. Battles already created from those snapshots remain available because their command logs contain their own copies.

## Visibility and entry

Public leagues appear in the leagues index. Private leagues are unlisted and shared by their stable opaque link. Both use the same detail page and require an account to join or submit. A signed-in player continues to see a private league after participating in an earlier event, even before joining the current event.

The organizer chooses automatic entry or approval when creating the league. Approval events create pending entries, except for the organizer's own entry, which is accepted outright because approving oneself asks nothing. The organizer may accept, reject, or remove entrants until reveal. An event accepts at most 128 active entries and may use the league's lower accepted-player limit. Approval requests do not consume those configured places, but total active requests remain bounded at 128. A configured player limit makes every place a reveal requirement.

## Roster sealing

Only an accepted event entrant may submit. A 2v1 entrant cannot submit until the organizer assigns their size, and a 2v2 entrant cannot submit until the organizer pairs them with a teammate. The event page loads saved-roster summaries, prices, and faction names when the chooser opens and offers only rosters configured for the required size. The server prices the selected saved roster, refuses points, detachment, disposition, or catalogue legality errors, atomically verifies that its configured limit equals the entry requirement, validates the complete snapshot shape used when attaching a roster to a battle, and removes the saved roster identifier before storage. Every roster outside 2v2 seals exactly one eligible selected Warlord. A doubles entrant may seal zero or one eligible Warlord while their teammate has no roster. Once both teammates have sealed, submitting or replacing either roster succeeds only when the two snapshots contain exactly one eligible selected Warlord together. Incomplete catalogue validation is a warning and does not block submission. Later edits or deletion of the saved roster do not change that snapshot. An entrant may deliberately replace the snapshot by submitting again until reveal. Changing a 2v1 assignment or 2v2 team before reveal discards every affected snapshot and requires those entrants to seal another roster. A roster that has waived any of its battle size's restrictions is sealed only after a confirmation naming them, and carries them into its snapshot so the organizer and every opponent read them with the revealed list.

The snapshot stays in `league_event_entries.roster_snapshot`. The league detail read returns only a submitted flag and the frozen roster name to its submitter, never the JSON. The dedicated roster read returns a snapshot only after the event's `revealed_at` is set, including when the requester is the organizer.

## Reveal

Reveal is one transaction owned by the organizer. It succeeds only when at least one entrant is accepted, every accepted entrant has a requirement and submitted roster, every non-2v2 roster retains exactly one eligible Warlord, and a 2v1 event has at least one solo and two allied entrants. A 2v2 event also requires at least four accepted entrants, an even accepted count, no unresolved requests, every team to contain exactly two entrants, and every team to retain exactly one eligible Warlord. Reveal rejects unresolved approval requests, sets the event's `revealed_at`, closes joining, assignment, and submission for that event, then makes every accepted snapshot readable. Reveal cannot be undone and does not close the league.

## Battles

After reveal, an accepted entrant in a 1v1 event may start a battle against any other accepted entrant. In a 2v1 event, a solo entrant chooses two allied opponents, while an allied entrant chooses one allied teammate and one solo opponent. In a 2v2 event, an entrant chooses one opposing fixed team; the server derives their teammate and both opponents from the event teams. The server verifies the selected entries and sealed roster sizes form the exact composition. Entrants do not need friendships because the revealed league event is the shared boundary. These are ad hoc battles, not pairings, standings, or a schedule.

Battle creation copies each selected stored event snapshot into the command log and then appends `lock-league-rosters` in the same transaction. The lock records both league and event tokens and prevents roster replacement, roster removal, setup reset, battle-size changes, and adding another side. The event roster page and battle therefore read the same sealed roster data; later saved-roster or catalogue changes cannot replace it.

Every battle started from an event appears in that event's battle history. Anyone who can open the league or battle link can follow a running battle or review it after it finishes without taking a seat. The spectator view shows the folded score and phase, both frozen armies with their current unit state, public missions and stratagem use, and the visibility-filtered battle report. It never exposes an unrevealed secret mission or any command controls.

The ordinary battle creator checks the selected seats against every revealed event the player entered. An exact valid matchup sends the player to that event so the sealed rosters and event history are not skipped accidentally; continuing as an unlinked casual battle requires an explicit confirmation.
