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

Persist commands, not a second score, phase, round, mission, or casualty state. Every command kind must be covered by both `commandRefusal` and `apply`; every refusal pairs a stable `RefusalCode` with its player-facing message, including the server's rules-dependent refusals in `service.ts`. Repository submission reads, validates, and appends atomically. The product module returns only the message, so `SpacetimeOperator.submit` derives the code by folding the log the module refused against.

`expectedSeq` covers the whole log. A mismatch returns `stale`; never automatically resend with a newer sequence. `useCommand` serializes taps and installs the returned screen before the next command. A stale/refused command discards queued work based on that sequence while preserving work built from a newer realtime screen; a failed automatic background write, such as derived setup cards or empty turn settlement, discards nothing. Every connected command first attempts a bounded sync of the battle's saved commands so it cannot overtake them. When the battle has no saved local work, it uses authoritative submission, which returns the battle history with the screen, and saves that history before displaying the response (an answer without it, such as one from an older server during a rolling deploy, falls back to downloading it); a connected command is never queued, so a deploy that changes the rules revision or a competing opponent command cannot leave a durable conflict. A connected write whose request gets no answer at all, such as a fetch network failure while the service is down, is saved durably like an offline write; its expected sequence makes a replay of a write that did land a conflict to review, never a duplicate. Any answered refusal or error is shown and not replayed. Offline commands remain durable and follow any saved commands in order.

Undo appends a command naming the latest active action. It preserves history and may rewind across turns. Scoring settlement, tactical draws, and discard/CP actions are each atomic undo targets. Start and shared prompt bookkeeping are outside the undo chain. Every required prompt keeps Undo available when rewinding reopens it.

A missed action names the earlier moment it belongs to (`missed`: round, phase and a player on the side taking that turn) on `use-stratagem`, a positive `adjust-cp` or `score-settlement`. The log keeps recording order, so the entry's position, actor and timestamp say who recorded it and when, while the fold books its CP, usage and score ledgers against the named moment. `missedMoments` limits that moment to an earlier phase of the current or previous battle round. Reports append “recorded late for …”, replay shows the entry at its recorded position, and undo treats it like any other action. Battle options → Record a missed action (`MissedActionDialog.tsx`) offers it and shows the domain's refusal.

Any seated player can operate either side's shared actions. Preserve the actor in the log and the affected side/player separately; omitted player IDs retain their historical meaning. Roster selection and ownership checks still apply. A seated player can record a concession for a non-automated player. Only the creator can delete a battle; reopening and reset preserve its history.

## Seating and setup

Creation seats the entire table in the same transaction. Reads never take seats, and there is no join mutation. The creator keeps the first seat on side 0; an ally on that side does not inherit deletion rights. Table shape is fixed at creation. Allies have separate rosters but share turns, CP, VP, missions, and stratagems. An allied side plays one Force Disposition, from any card either list's detachments offered (`sideDisposition`): lists that chose the same card play it, otherwise setup asks the side before Start battle, unless a [league](leagues.md#team-force-disposition) lock sealed it. A lone army plays its list's own card.

Practice opponents are ordinary seats backed by accounts without credentials. They require no friendship, use a seated player's roster, and let the table settle their hand. Exclude practice battles from public/friends feeds, standings, and service records. Legacy one-seat logs still fold, but new one-seat battles cannot start.

Setup is one page; devices share every answer but not a position. The next section the table owes and what is left before Start battle are derived from the log, so every device agrees without a navigation command; `set-setup-step` remains only for older logs. Any seated player may answer for either side, so one device can set the whole table; roster choice remains limited to a player's own lists, lists a friend has lent them, and practice seats. Any seated device records derived cards once every army is in, so an absent player cannot block setup; shared choices wait until those writes land rather than racing them. Ordinary battles start without a points preset and offer all saved rosters. Show roster selection before the battle size and mission pack controls. Infer a supported battle size from saved roster formats, never actual army totals, only once every army is selected. Both sides must have the same allowance; allies split it evenly. Custom points budgets never change the battle size: armies must also agree on their per-side points budget, setup names an agreed custom budget beside the size, and Start battle is refused while budgets differ, whether the size was inferred or chosen. Preserve mismatched selections and ask players to align formats before continuing. Text-only armies require a manual size. League presets remain sealed; explicit sizes in historical logs remain fixed. Reset clears choices and any inferred size while preserving explicit presets and the audit trail. `set-battlefield` records deployment and terrain together; a layout without pinned geometry cannot start.

Tracker and replay battlefield names open the saved layout through `BattlefieldFact.tsx` and `battlefieldLayout.ts`. Load terrain on opening and fit the whole board without placement measurements or zoom controls. Legacy layout IDs resolve only through an unambiguous saved disposition pair and variant; never substitute another layout. Battles without a saved terrain layout show deployment zones/objectives alone. Shelves omit missing battlefield labels instead of showing internal IDs.

## Manual tracking

`settings.manual` folds from `configure-battle`. The New battle dialog or setup chooses it; it changes only during setup, never in a league battle, and names no mission pack, twist or terrain. Choosing it clears prepared cards, battlefield, defender and side dispositions; returning to guided setup derives cards again. Setup asks only for armies, battle size and first turn, and `setupReferenceError` skips the mission, deployment and terrain checks.

During play the fold keeps rounds, turns, phases, the clock, casualties and undo. It grants no command-phase CP, owes no settlement, pays no battle ready bonus and finishes as the last turn ends. `commandRefusal` refuses card, stratagem, mission-choice, battlefield and scoring-review commands with `manual-tracking`. `score` and `adjust-cp` record the table's numbers without caps or the additional-CP allowance; missed actions are refused. Mission resolution and `scoringCapError` return nothing. Every surface that chooses or shows the mode states `MANUAL_TRACKING_LIMITS`, so nothing implies a rules check.

`add-note` appends a bounded note to the report in either mode while play runs. Notes are undoable and readable by everyone the battle audience admits.

## Frozen armies

Attaching a saved roster rechecks ownership or an active loan, price, and legality on the server before freezing selections, cards, unit keys, model counts, supported wound values, and any custom points budget beside the battle size. Text-only imports remain usable without a catalogue. Incomplete validation is a warning, not invented legality. Later saved-list edits or deletion cannot rewrite a battle. A lent list records its lender by name in the snapshot, so revoking the loan later leaves the battle unchanged; a lent list is attached online only and never enters a league entry, which is sealed from the entrant's own lists. Old snapshots retain card/text fallbacks.

Battle summary faction lookup includes exact historical catalogue IDs even when they are absent from the selectable rules index. Preserve the rules-version metadata recorded in the frozen army; never replace it with the current version's status.

Army headers offer Simulate with Units/Rosters modes through the shared [combat simulator](combat-simulation.md#interface-and-context), using logged surviving models and wounds of units on the battlefield. During play, the army roster sets up a reserve or embarked unit on the battlefield with `set-unit-formation`, which makes it a simulator target. Health and formation changes invalidate and recalculate the open planner; experiments never append battle commands. One wound state drives models, current-model damage, and destruction. `wound-unit`, `damage-unit`, and `set-unit` must agree and remain undoable. Freeze wounds only when the datasheet has one supported uniform value; mixed or older units remain model-only rather than guessing.

Personal roster reminders are owner-only. Strip them from opponent, spectator, shared, and revealed-event reads. Their dismissals are bounded local state, not commands or shared prompts; destroyed-unit reminders stop until the unit is restored unless the player enables “Show while unit is destroyed”. First-round-only triggers match round 1, and “Any phase” matches each named phase boundary. Round reminders use either side’s turn: start before the first turn’s Command phase prompts, and end at the end of the second turn before passing to the next round.

Frozen unit notes are owner-only in the same reads: `battleView`, `visibleBattleLog`, and `leagueRoster` remove them through `src/core/unitNotes.ts`.

Starting Strategic Reserves use one allowance per side, shared by allies. Deep Strike changes ingress, not membership in that allowance. Source-backed exemptions and post-deployment redeployments are separate. Check formations and battle start against frozen facts; incomplete source facts must not invent restrictions. `unitFormationRefusal` is the formation authority for `validate` and the setup controls, which disable each move it refuses and show its reason beside the control.

Transport assignments name a unit in the same frozen army and clear when formation changes. [`src/core/transport.ts`](../../src/core/transport.ts) reads the printed rule into allowances, exclusions and space costs, matched against each unit's keywords frozen with the roster; count joined leaders, existing passengers, and restored models against it. Refuse a rule with any sentence it cannot read, rather than enforcing part of it. Units frozen before keywords were recorded count one space per model in the first allowance.

## Prompts and replay

Required scoring, draw, discard, and Secret Mission work is folded from the log and shared. Any seated device may complete it once. Prior-turn settlement precedes the incoming tactical draw. A helper's hidden view cannot establish that another side has no private work; practice seats have no private player to answer for them.

Replay folds each selected prefix and applies that moment's visibility. Mission reference lookup retains unambiguous secondary name-slug IDs from saved battles alongside current source IDs; ambiguous names remain unavailable. A later reveal must not expose a Secret Mission in an earlier frame. Include undone commands and undo events. Spectators may scrub a live battle; seated players receive replay after finishing. Keep preload work bounded and preserve usable frames through refresh failures.

The clock derives elapsed time from every logged timestamp, including undone actions, assigning each gap to the battle moment then active. It runs only during play and stops at final settlement. Shared pause/resume is not undoable; reopening clears pause. Replay clocks stop at their selected event. Do not infer time from the active-command fold alone.

## Audience and records

`battleAudience` folds the narrowest seat preference: anyone, friends, or nobody. No preference row means public. Friends means an accepted friend of any seated player. Feeds, links, replay, profiles, and previews use the same decision, including league-linked battles. League reveal grants access to sealed event rosters, not an exemption from battle audience. Filter the event feed before pagination in the product database and recheck in the service. A seated viewer receives controls, an allowed reader gets a spectator view, and others receive unavailable/sign-in state.

`battleView` is the only field-visibility decision. Face-down Secret Mission identities and any deck that would identify them stay hidden; ordinary tactical cards/decks are public. Preview images always read as signed out. Player-content previews use `no-store` because publication can be revoked; public reference images may be cached. Profiles and service records use only watchable games; private results cannot leak through rank, counts, or metadata. Manual battles count in service records and are labelled on battle cards.

Standings derive finished guided, non-practice results and OpenSkill ratings from bounded logs in finish order. Allies share their side's result; concessions override score and draws remain ties. Faction records rate player/faction pairs against overall opposition. Sorting uses the displayed rounded rating. Revision changes invalidate caches across replicas after finish, reopen, deletion, or visibility changes; report the actual window covered when a count limit truncates it.

A finished battle offers the Teams Event Companion's 20–0 battle points (section 14) beside each player's victory points behind a reader's switch, kept in local storage. `src/core/teamsBattlePoints.ts` converts the final folded score, so corrections apply and replay scrubbing does not; conceded and team battles show why they have none. Results, standings and ratings never use battle points, and team match points need a teams event, which battles do not model.

Public/friends feeds order by start time; the player's own games order by activity. Exclude the viewer's own battles on the server so pagination remains full. Failed refreshes retain prior pages; reject missing response pages before caching.

## Realtime updates

Subscriptions carry IDs/sequences or bounded revision counters, never product state. Product and public signals refresh a scope at once, then at most once per ten seconds however many arrive (`coalescedBy` in `src/client/productSignals.ts`): every command in any battle moves the public battles signal, which refreshes feeds but not an open battle: a seated battle follows its own signal and any other viewer polls. Standings and rankings follow only the public standings signal, which moves when a battle finishes. Feeds poll every 20 seconds only on a page without realtime refresh. The public feed holds each reader's page for five seconds on the server, so a burst of refetches after one signal reads the database once. Refetch through permission-checked reads and skip a redundant refresh when the screen already holds the sequence. A seated refresh downloads the battle history alongside the screen, so a realtime update costs one round trip. Use internal battle IDs, not share tokens. User, shared, and admin revisions have separate access boundaries.

Signed-in tokens are deployment-bound; guests receive restricted native identities and no private rows. Browser connections use the page origin's `/spacetime/` proxy. A failed subscription must fall back to active-query polling, even if the transport itself is connected.

`src/client/spacetimeConnection.ts` owns jittered, bounded backoff. Only a sustained applied subscription resets it. Connections renew every four minutes for a fresh token; the first applied subscription refreshes every scope, and a renewal refreshes only scopes whose revision changed while it was away. A battle page whose viewer is refused a battle ticket (signed out, not seated, or deleted) polls without asking again. Only token HTTP 401 rechecks the account; service outages do not sign the player out. Server reads use `rpc()`, mutations use `mutationRpc()`, and sign-in destinations remain local paths.

Players choose practice opponents in the ordinary New battle dialog and control both armies, rolls and decisions. There is no automated opponent.

## Verification

Run adjacent domain tests and relevant `e2e/battle*.spec.ts`, `e2e/team-battle.spec.ts`, and guest flows. Cover competing sequences, no automatic stale retry, atomic settlement/undo, cross-device prompts, historical secrets, audience changes, frozen rosters, casualties, and the clock across a full rewind/pause/reopen cycle. Follow [Interface verification](interface.md#verification) for rendered surfaces.

## Offline battles

Downloaded construction rules restore terrain layouts and templates from the shared terrain reference queries before validating commands. Keep exact geometry available to offline battle start without repeating it in each archived army source; older downloads retain terrain stored inside construction rules.

The client saves seated battle workspaces and commands in the account’s durable local state. Connected startup keeps authoritative battle screens and folds only workspace changes that can still sync. A conflict awaiting review holds back the battle's later saved changes; while connected, the battle shows and submits to the authoritative history and keeps the conflict for review instead of freezing on the saved copy. Failed connected reads can fold the account’s durable workspace when the screen cache is absent; cancelled requests and changed accounts must not use that fallback. Commands use the same core validation and log fold as hosted play; scores, phases and rounds are derived from that history. Public construction data supplies mission validation and pricing. Practice opponents can play from one device; shared battles require the other players’ updates to synchronize before they become visible. Private mission identities and decks are filtered when a workspace is downloaded.

A queued command keeps its operation ID, expected sequence, validation-data revision, recorded time and resolved random draw through retries. Reconnect accepts each command once or retains a conflict for review when another device advanced the history or the downloaded army/game rules changed. Missing authoritative data leaves commands pending; already accepted commands still acknowledge after a rules update. Do not automatically rebase a played command, validate it under a different rules revision, or choose new random cards while replaying it. Export the saved history before discarding a conflict. Run `e2e/offline-work.spec.ts` for offline creation, setup, draws, phase advancement, cold reopen and database-verified reconnect sync.

A deleted or inaccessible battle becomes a retained refusal so unrelated resources can sync. Authentication failures, rate limits and service outages remain retryable. Apply this distinction throughout validation, append and acknowledgement reads.

Battle-creation acknowledgements download their workspace inside the server's refusal handling, including receipt recovery. A missing workspace must not leave an accepted creation blocking the queue. Seated active battles omit the replay timeline; finished timelines index report labels by sequence in screen, workspace, and submission responses.
