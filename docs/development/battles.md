# Battles

## Code map

| Question                                         | Owner                                                           |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Commands, legality, and folded state             | `src/core/battle.ts`                                            |
| Viewer-specific fields and historical visibility | `src/core/battleView.ts`                                        |
| Audience permission                              | `src/core/battleAudience.ts`                                    |
| Report, replay, and clocks                       | `src/core/battleReport.ts`, `battleReplay.ts`, `battleClock.ts` |
| Results and player records                       | `src/core/standings.ts`, `serviceRecord.ts`                     |
| Storage and application operations               | `src/server/spacetimeRepository.ts`, `src/server/services`      |
| Screens and prompts                              | `src/client/features/battle`                                    |

[Game rules](game-rules.md) owns mission and scoring semantics. [Interface](interface.md#battles-and-leagues) owns layout and interaction. [Leagues](leagues.md#battles) owns event-linked creation.

## Command log

Persist commands, not a second score, phase, round, mission, or casualty state. Every command kind must be covered by both `validate` and `apply`. Repository submission reads, validates, and appends atomically.

`expectedSeq` covers the whole log. A mismatch returns `stale`; never automatically resend with a newer sequence. `useCommand` serializes taps and installs the returned screen before the next command. A stale/refused command discards queued work based on that sequence while preserving work built from a newer realtime screen.

Undo appends a command naming the latest active action. It preserves history and may rewind across turns. Scoring settlement, tactical draws, and discard/CP actions are each atomic undo targets. Start and shared prompt bookkeeping are outside the undo chain. Every required prompt keeps Undo available when rewinding reopens it.

Any seated player can operate either side's shared actions. Preserve the actor in the log and the affected side/player separately; omitted player IDs retain their historical meaning. Roster selection and ownership checks still apply. A seated player can record a concession for a non-automated player. Only the creator can delete a battle; reopening and reset preserve its history.

## Seating and setup

Creation seats the entire table in the same transaction. Reads never take seats, and there is no join mutation. The creator keeps the first seat on side 0; an ally on that side does not inherit deletion rights. Table shape is fixed at creation. Allies have separate rosters but share turns, CP, VP, missions, and stratagems.

Practice opponents are ordinary seats backed by accounts without credentials. They require no friendship, use a seated player's roster, and let the table settle their hand. Exclude practice battles from public/friends feeds, standings, and service records. Legacy one-seat logs still fold, but new one-seat battles cannot start.

Setup position is command-derived and shared across devices. Changing points removes selected catalogue rosters that no longer match the side's share. `set-battlefield` records deployment and terrain together; a layout without pinned geometry cannot start. Reset clears roster/battlefield choices without discarding the configured format or audit trail.

## Frozen armies

Attaching a saved roster rechecks ownership, price, and legality on the server before freezing selections, cards, unit keys, model counts, and supported wound values. Text-only imports remain usable without a catalogue. Incomplete validation is a warning, not invented legality. Later saved-list edits or deletion cannot rewrite a battle. Old snapshots retain card/text fallbacks.

One wound state drives models, current-model damage, and destruction. `wound-unit`, `damage-unit`, and `set-unit` must agree and remain undoable. Freeze wounds only when the datasheet has one supported uniform value; mixed or older units remain model-only rather than guessing.

Personal roster reminders are owner-only. Strip them from opponent, spectator, shared, and revealed-event reads. Their dismissals are bounded local state, not commands or shared prompts; destroyed-unit reminders stop until the unit is restored.

Starting Strategic Reserves use one allowance per side, shared by allies. Deep Strike changes ingress, not membership in that allowance. Source-backed exemptions and post-deployment redeployments are separate. Check formations and battle start against frozen facts; incomplete source facts must not invent restrictions.

Transport assignments name a unit in the same frozen army and clear when formation changes. Count joined leaders, existing passengers, and restored models against supported printed capacity and wargear conditions. Refuse an unreadable capacity; leave prose-only passenger restrictions and special space costs for the table.

## Prompts and replay

Required scoring, draw, discard, and Secret Mission work is folded from the log and shared. Any seated device may complete it once. Prior-turn settlement precedes the incoming tactical draw. A helper's hidden view cannot establish that another side has no private work; practice seats have no private player to answer for them.

Replay folds each selected prefix and applies that moment's visibility. A later reveal must not expose a Secret Mission in an earlier frame. Include undone commands and undo events. Spectators may scrub a live battle; seated players receive replay after finishing. Keep preload work bounded and preserve usable frames through refresh failures.

The clock derives elapsed time from every logged timestamp, including undone actions, assigning each gap to the battle moment then active. It runs only during play and stops at final settlement. Shared pause/resume is not undoable; reopening clears pause. Replay clocks stop at their selected event. Do not infer time from the active-command fold alone.

## Audience and records

`battleAudience` folds the narrowest seat preference: anyone, friends, or nobody. No preference row means public. Feeds, links, profiles, and previews use the same decision; league-linked battles have the event's public viewing boundary. A seated viewer receives controls, an allowed reader gets a spectator view, and others receive unavailable/sign-in state.

`battleView` is the only field-visibility decision. Face-down Secret Mission identities and any deck that would identify them stay hidden; ordinary tactical cards/decks are public. Preview images always read as signed out. Profiles and service records use only watchable games; private results cannot leak through rank, counts, or metadata.

Standings derive finished non-practice results and OpenSkill ratings from bounded logs in finish order. Allies share their side's result; concessions override score and draws remain ties. Faction records rate player/faction pairs against overall opposition. Sorting uses the displayed rounded rating. Revision changes invalidate caches across replicas after finish, reopen, deletion, or visibility changes; report the actual window covered when a count limit truncates it.

Public/friends feeds order by start time; the player's own games order by activity. Exclude the viewer's own battles on the server so pagination remains full. Failed refreshes retain prior pages; reject missing response pages before caching.

## Realtime updates

Subscriptions carry IDs/sequences or bounded revision counters, never product state. Refetch through permission-checked reads and skip a redundant refresh when the screen already holds the sequence. Use internal battle IDs, not share tokens. User, shared, and admin revisions have separate access boundaries.

Signed-in tokens are deployment-bound; guests receive restricted native identities and no private rows. Browser connections use the page origin's `/spacetime/` proxy. A failed subscription must fall back to active-query polling, even if the transport itself is connected.

`src/client/spacetimeConnection.ts` owns jittered, bounded backoff. Only a sustained applied subscription resets it. Only token HTTP 401 rechecks the account; service outages do not sign the player out. Server reads use `rpc()`, mutations use `mutationRpc()`, and sign-in destinations remain local paths.

## Verification

Run adjacent domain tests and relevant `e2e/battle*.spec.ts`, `e2e/team-battle.spec.ts`, and guest flows. Cover competing sequences, no automatic stale retry, atomic settlement/undo, cross-device prompts, historical secrets, audience changes, frozen rosters, casualties, and the clock across a full rewind/pause/reopen cycle. Follow [Interface verification](interface.md#verification) for rendered surfaces.
