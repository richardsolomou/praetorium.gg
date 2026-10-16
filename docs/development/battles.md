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
| Offline queue and saved workspaces               | `src/client/offline/battleFunctions.ts`                         |
| Realtime signals and connection                  | `src/client/productSignals.ts`, `spacetimeConnection.ts`        |

[Game rules](game-rules.md) owns mission and scoring semantics. [Interface](interface.md#battles-and-leagues) owns layout and interaction. [Leagues](leagues.md#battles) owns event-linked creation.

## Command log

Persist commands, not a second score, phase, round, mission, or casualty state. Every command kind must be covered by both `commandRefusal` and `apply`; every refusal pairs a stable `RefusalCode` with its player-facing message, including the server's rules-dependent refusals in `service.ts`. Repository submission reads, validates, and appends atomically. The product module returns only the message, so `SpacetimeOperator.submit` derives the code by folding the log the module refused against.

`expectedSeq` covers the whole log. A mismatch returns `stale`; never automatically resend with a newer sequence. A stale or refused command discards queued work built on that sequence, not work built from a newer realtime screen; a failed background write discards nothing. A connected command first syncs the battle's saved commands so it cannot overtake them and is never queued, so a deploy or competing command cannot leave a durable conflict. Only a connected write that gets no answer at all is saved like an offline write, where its expected sequence turns a duplicate into a conflict; an answered refusal or error is shown and never replayed.

Undo appends a command naming the latest active action. It preserves history and may rewind across turns. Scoring settlement, tactical draws, and discard/CP actions are each atomic undo targets. Start and shared prompt bookkeeping are outside the undo chain. Every required prompt keeps Undo available when rewinding reopens it.

A missed action (`missed` on `use-stratagem`, a positive `adjust-cp`, or `score-settlement`) names the earlier moment it belongs to, limited by `missedMoments` to an earlier phase of the current or previous round. The log keeps recording order and actor, while the fold books CP, usage, and score against the named moment. [Game rules](game-rules.md#scoring) owns how it is judged.

Any seated player can operate either side's shared actions; preserve the actor and the affected side/player separately, and omitted player IDs keep their historical meaning. A seated player can record a concession for a non-automated player. Only the creator can delete a battle; reopening and reset preserve its history.

## Seating and setup

Creation seats the entire table in one transaction; reads never take seats and there is no join mutation. The creator holds the first seat on side 0; an ally there does not inherit deletion rights. Table shape is fixed at creation. Allies have separate rosters but share turns, CP, VP, missions, stratagems, and one Force Disposition (`sideDisposition`), unless a [league](leagues.md#team-force-disposition) lock sealed it.

Practice opponents are ordinary seats backed by credential-less accounts, using a seated player's roster without friendship; there is no automated opponent. Exclude practice battles from public/friends feeds, standings, and service records. Legacy one-seat logs still fold, but new one-seat battles cannot start.

Setup progress is derived from the log (`set-setup-step` exists only for older logs). Any seated player may answer for either side, but may choose only their own, lent, or practice-seat rosters. Any seated device records derived cards once every army is in, so an absent player cannot block setup; shared choices wait for those writes.

Infer battle size only once every army is selected, from saved roster formats, never actual totals. Both sides need the same allowance (allies split it) and the same custom points budget; Start battle is refused while budgets differ, and budgets never change the size. Preserve mismatched selections. Text-only armies require a manual size. League presets and explicit historical sizes stay fixed; reset clears choices and inferred size but keeps explicit presets. A layout without pinned geometry cannot start; legacy layout IDs resolve only through an unambiguous saved disposition pair and variant, never a substitute.

## Manual tracking

`settings.manual` folds from `configure-battle`, changes only during setup, and is refused in league battles. Play grants no command-phase CP, settlement, or battle-ready bonus; `commandRefusal` refuses guided and missed-action commands with `manual-tracking`, and `score`/`adjust-cp` record the table's numbers uncapped. Every surface that chooses or shows the mode states `MANUAL_TRACKING_LIMITS`, so nothing implies a rules check.

## Frozen armies

Attaching a saved roster rechecks ownership or an active loan, price, and legality on the server, then freezes the list, supported wound values, rules-version metadata, and any custom budget. Later saved-list edits or deletion cannot rewrite a battle. Incomplete validation is a warning, not invented legality. A lent list records its lender, so revoking the loan changes nothing; lent lists attach online only and never enter a league entry. Resolve historical catalogue IDs absent from the current index, and never replace frozen rules-version metadata with the current status.

The [combat simulator](combat-simulation.md#interface-and-context) reads logged survivors; experiments never append battle commands. One wound state drives models, current-model damage, and destruction: `wound-unit`, `damage-unit`, and `set-unit` must agree and remain undoable. Freeze wounds only when the datasheet has one uniform value; otherwise stay model-only.

Personal roster reminders and frozen unit notes are owner-only: `battleView`, `visibleBattleLog`, and `leagueRoster` strip them from every other read. Reminder dismissals are local state, not commands, and reminders never replace shared scoring guards or prompts.

Starting Strategic Reserves use one allowance per side, shared by allies; Deep Strike changes ingress, not membership. `unitFormationRefusal` is the formation authority for `validate` and setup controls. [`src/core/transport.ts`](../../src/core/transport.ts) refuses a transport rule with any sentence it cannot read rather than enforcing part of it; units frozen before keywords were recorded count one space per model. Incomplete source facts never invent restrictions.

## Prompts and replay

Required scoring, draw, discard, and Secret Mission work is folded from the log, shared, and completed once by any seated device. Prior-turn settlement precedes the incoming tactical draw. A helper's hidden view cannot establish that another side has no private work; practice seats have no private player to answer for them.

Replay folds each selected prefix with that moment's visibility, so a later reveal must not expose a Secret Mission in an earlier frame. Include undone commands and undo events. Saved secondary name-slug IDs resolve only when unambiguous. Spectators may scrub a live battle; seated players get replay after finishing. A device replays from its saved history only while offline or holding unsynced commands (`unsyncedWorkspace`), because a clean saved history can trail commands sent straight to the service.

The clock derives elapsed time from every logged timestamp, including undone actions, assigning each gap to the moment then active; never from the active-command fold alone. It runs only during play. Pause/resume is shared and not undoable; reopening clears pause.

## Audience and records

`battleAudience` folds the narrowest seat preference: anyone, friends (of any seated player), or nobody; no preference row means public. Feeds, links, replay, profiles, and previews use the same decision, including league-linked battles; league reveal grants sealed rosters, not an exemption from battle audience. Filter feeds before pagination in the database and recheck in the service.

`battleView` is the only field-visibility decision. Face-down Secret Mission identities and any deck that would identify them stay hidden; ordinary tactical cards are public. Preview images always read as signed out and use `no-store` for player content, since publication can be revoked. Profiles and service records use only watchable games, so private results cannot leak through rank, counts, or metadata.

Standings rate finished guided, non-practice results with OpenSkill from bounded logs in finish order. Allies share their side's result; concessions override score. Revision changes invalidate caches across replicas after finish, reopen, deletion, or visibility changes; report the actual window when a count limit truncates it. Teams Event battle points (`teamsBattlePoints.ts`) are display-only: results, standings, and ratings never use them.

## Realtime updates

Subscriptions carry IDs, sequences, or bounded revision counters, never product state; refetch through permission-checked reads. The public battles signal refreshes feeds, not an open battle, which follows its own signal. Use internal battle IDs, not share tokens. User, shared, and admin revisions have separate access boundaries.

Signed-in tokens are deployment-bound; guests get restricted identities and no private rows. A failed subscription must fall back to polling even if the transport is connected. Only a sustained applied subscription resets backoff. Only token HTTP 401 rechecks the account; outages never sign the player out. The SDK's automatic reconnect rides out a dropped socket with a renewed ticket; `spacetimeConnection.ts` replaces the connection only when the first connection fails, the SDK gives up, `my_session` disappears, or every four minutes, because only a new connection extends `session_access` past a five-minute token.

## Offline battles

Downloaded workspaces filter private mission identities and decks. A queued command keeps its operation ID, expected sequence, validation-data revision, recorded time, and resolved random draw through retries. Reconnect accepts each once or keeps a conflict when another device advanced the history or the rules changed. Never rebase a played command, revalidate it under another rules revision, or redraw its cards. Missing authoritative data leaves commands pending. Export the saved history before discarding a conflict, and while connected show the authoritative history rather than freezing on the saved copy.

Failed connected reads may fall back to the durable workspace, but cancelled requests and changed accounts must not. A deleted or inaccessible battle becomes a retained refusal so other work can sync; auth failures, rate limits, and outages stay retryable. A missing workspace must not leave an accepted creation blocking the queue.

## Verification

Run adjacent domain tests, the relevant `e2e/battle*.spec.ts`, `e2e/team-battle.spec.ts`, guest flows, and `e2e/offline-work.spec.ts`. Cover competing devices for sequence, undo, and prompt changes, and the clock across a rewind/pause/reopen cycle. Follow [Interface verification](interface.md#verification) for rendered surfaces.
