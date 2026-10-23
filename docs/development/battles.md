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

[Game rules](game-rules.md) owns mission and scoring semantics. [Interface](interface/surfaces.md#battles-and-leagues) owns layout and interaction. [Leagues](leagues.md#battles) owns event-linked creation.

## Command log

Persist commands, not a second score, phase, round, mission, or casualty state. Every command kind must be covered by both `commandRefusal` and `apply`; every refusal pairs a stable `RefusalCode` with its player-facing message, including the server's rules-dependent refusals in `service.ts`. Repository submission reads, validates, and appends atomically.

`expectedSeq` covers the whole log. A mismatch returns `stale`; never automatically resend with a newer sequence. A stale or refused command discards queued work built on that sequence, not work built from a newer realtime screen; a failed background write discards nothing. A connected command first syncs the battle's saved commands so it cannot overtake them and is never queued, so a deploy or competing command cannot leave a durable conflict. Only a connected write that gets no answer at all is saved like an offline write, where its expected sequence turns a duplicate into a conflict; an answered refusal or error is shown and never replayed.

Undo appends a command naming the latest active action. It preserves history and may rewind across turns. Scoring settlement, tactical draws, and discard/CP actions are each atomic undo targets. Start, shared prompt bookkeeping, and casualties are outside the undo chain. Every required prompt keeps Undo available when rewinding reopens it.

A missed action (`missed` on `use-stratagem`, a positive `adjust-cp`, or `score-settlement`) names the earlier moment it belongs to, limited by `missedMoments` to an earlier phase of the current or previous round. The log keeps recording order and actor, while the fold books CP, usage, and score against the named moment. [Game rules](game-rules.md#scoring) owns how it is judged.

Any seated player can operate either side's shared actions; preserve the actor and the affected side/player separately, and omitted player IDs keep their historical meaning. A seated player can record a concession for a non-automated player. Only the creator can delete a battle; reopening and reset preserve its history.

## Seating and setup

Creation seats the entire table in one transaction; reads never take seats and there is no join mutation. A battle started from a saved roster's menu then attaches that roster to the creator's seat; if the attach is refused, setup offers the choice as usual. The creator holds the first seat on side 0; an ally there does not inherit deletion rights. Table shape is fixed at creation. Allies have separate rosters but share turns, CP, VP, missions, stratagems, and one Force Disposition (`sideDisposition`), unless a [league](leagues.md#team-force-disposition) lock sealed it.

Practice opponents are ordinary seats backed by credential-less accounts, using a seated player's roster without friendship; there is no automated opponent. Exclude practice battles from public/friends feeds, standings, and service records. Legacy one-seat logs still fold, but new one-seat battles cannot start.

A guest is a real opponent without an account, seated on the opposing side by the name the creator gives them. `src/core/newBattle.ts` and `src/core/guestSession.ts` own the decisions:

- Identity: the seat ID is `guestSeatId(battleId, at)`, so it can never be an account and the same person in two battles is two seats; the name lives only on the seat row (`battle_users.guestName`), not in the log. Account seats claiming a guest ID, friendships with one, and product revisions for one are refused in the product module.
- Operation: until the guest joins, the seat is automated like a practice seat, so seated players choose its roster from their own lists, answer its prompts, and see its private cards. It can concede, because the game is real; `isPracticeSeat` is the practice-only test.
- Joining: a seated account shares the seat's link (`guest_seats.invite`, made on first request). The first device to open it takes the seat: the server keeps only the SHA-256 of a secret it sets in that device's HTTP-only `praetorium-guest` cookie, which holds up to eight seats. A second device finds the seat taken. The session lasts `GUEST_SESSION_MS` (30 days) from joining. The host's "take back" replaces the link and forgets the device, so the table plays the seat again; a guest who clears storage or changes device asks for a new link. A joined seat is not automated, so its prompts and private cards are the guest's alone.
- Acting: `battleViewerId` in `src/server/guestSession.ts` resolves a battle read or command to the guest seat only when the cookie's secret matches that battle's seat, then falls back to the signed-in account. The service and fold then treat the seat like any other, so a guest acts only as their own seat in their own battle, through the same `mutationRpc` origin checks. A guest has no saved lists: `attach-draft-roster` sends the device's builder draft, which the server prices, checks, and freezes like a saved roster, and refuses from an account. Guests stay connected-only, with no offline workspace or server analytics person; offline play for a guest is not supported. Their battle follows the same [live signal](#realtime-updates) as a seated account's.
- Visibility: a guest has no audience preference, so the seated accounts' narrowest preference decides who may watch, and the name shows wherever the battle does. Creation says so.
- Records: an unclaimed guest battle counts in seated accounts' service records and appears in feeds, but never in standings for any seat ([Product design](../product-design.md#watching-a-battle) owns why). The record offers no guest as an opponent filter.
- Claiming: once the battle is finished, a device holding the seat and signed in to an account that is not already seated can claim it (`guestClaimRefusal`). The product module seats the account in place of the guest and records the seat it played as `battle_users.claimedSeat`, forgets the device, and ends its realtime session; the command log is never rewritten. `battleData` in the product module is the only place commands leave storage, and it resolves the seat to the account through `claimedLog`, as sender and wherever a command names it, so every reader (fold, visibility, report, records, standings, feeds, played armies) sees one battle between two accounts. The claim is identity, not state, so it cannot disagree with the log. Every existing authority then applies: both records, standings when it is public and guided, the claimant's audience preference, and account deletion. A claim is not withdrawn. Only finished battles move, so no device holds queued commands for the guest seat; after a reopen the account appends under its own ID.
- Not supported: guests in leagues or on the creator's side.

Setup progress is derived from the log (`set-setup-step` exists only for older logs). Any seated player may answer for either side, but may choose only their own, lent, or practice-seat rosters. Any seated device records derived cards once every army is in, so an absent player cannot block setup; shared choices wait for those writes.

Infer battle size only once every army is selected, from saved roster formats, never actual totals. Both sides need the same allowance (allies split it) and the same custom points budget; Start battle is refused while budgets differ, and budgets never change the size. Preserve mismatched selections. Text-only armies require a manual size. League presets and explicit historical sizes stay fixed; reset clears choices and inferred size but keeps explicit presets. A layout without pinned geometry cannot start; legacy layout IDs resolve only through an unambiguous saved disposition pair and variant, never a substitute.

## Manual tracking

`settings.manual` folds from `configure-battle`, changes only during setup, and is refused in league battles. Play grants no command-phase CP, settlement, or battle-ready bonus; `commandRefusal` refuses guided and missed-action commands with `manual-tracking`, and `score`/`adjust-cp` record the table's numbers uncapped. Every surface that chooses or shows the mode states `MANUAL_TRACKING_LIMITS`, so nothing implies a rules check.

## Frozen armies

Attaching a saved roster rechecks ownership or an active loan, price, and legality on the server, then freezes the list, supported wound values, rules-version metadata, and any custom budget. Later saved-list edits or deletion cannot rewrite a battle. Incomplete validation is a warning, not invented legality. A lent list records its lender, so revoking the loan changes nothing; lent lists attach online only and never enter a league entry. Resolve historical catalogue IDs absent from the current index, and never replace frozen rules-version metadata with the current status.

[Combat simulation](combat-simulation.md#interface-and-context) owns battle matchups. One wound state drives models, current-model damage, and destruction: `wound-unit`, `damage-unit`, and `set-unit` share `casualtyOutcome`, which also shows the roster's presses before the service answers. They are running counts, corrected with the opposite control, so they stay out of Undo and the battle report. Freeze wounds only when the datasheet has one uniform value; otherwise stay model-only.

Personal roster reminders and frozen unit notes are owner-only: `battleView`, `visibleBattleLog`, and `leagueRoster` strip them from every other read. Reminder dismissals are local state, not commands, and reminders never replace shared scoring guards or prompts.

Starting Strategic Reserves use one allowance per side, shared by allies; Deep Strike changes ingress, not membership. `unitFormationRefusal` is the formation authority for `validate` and setup controls. [`src/core/transport.ts`](../../src/core/transport.ts) refuses a transport rule with any sentence it cannot read rather than enforcing part of it; rosters freeze what the rule states (`transportCapacity`), because its text is published only as a token, and older logs keep reading their frozen text; units frozen before keywords were recorded count one space per model. Incomplete source facts never invent restrictions.

## Prompts and replay

Required scoring, draw, discard, and Secret Mission work is folded from the log, shared, and completed once by any seated device. Prior-turn settlement precedes the incoming tactical draw. A helper's hidden view cannot establish that another side has no private work; practice seats have no private player to answer for them.

Replay folds each selected prefix with that moment's visibility, so a later reveal must not expose a Secret Mission in an earlier frame. Include undone commands and undo events. Saved secondary name-slug IDs resolve only when unambiguous. Spectators may scrub a live battle; seated players get replay after finishing. A device replays from its saved history only while offline or holding unsynced commands (`unsyncedWorkspace`), because a clean saved history can trail commands sent straight to the service.

The clock derives elapsed time from every logged timestamp, including undone actions, assigning each gap to the moment then active; never from the active-command fold alone. It runs only during play. Pause/resume is shared and not undoable; reopening clears pause.

## Audience and records

`battleAudience` folds the narrowest seat preference: anyone, friends (of any seated player), or nobody; no preference row means public. Feeds, links, replay, profiles, and previews use the same decision, including league-linked battles; league reveal grants sealed rosters, not an exemption from battle audience. Filter feeds before pagination in the database and recheck in the service.

`battleView` is the only field-visibility decision. Face-down Secret Mission identities and any deck that would identify them stay hidden; ordinary tactical cards are public. Profiles and service records use only watchable games, so private results cannot leak through rank, counts, or metadata.

Standings rate finished guided results without practice or unclaimed guest seats with OpenSkill from bounded logs in finish order. Allies share their side's result; concessions override score. Revision changes invalidate caches across replicas after finish, reopen, deletion, or visibility changes; report the actual window when a count limit truncates it. Teams Event battle points (`teamsBattlePoints.ts`) are display-only: results, standings, and ratings never use them.

## Realtime updates

Subscriptions carry IDs, sequences, or bounded revision counters, never product state; refetch through permission-checked reads. The public battles signal refreshes feeds, not an open battle, which follows its own signal. Use internal battle IDs, not share tokens. User, shared, and admin revisions have separate access boundaries.

Signed-in tokens are deployment-bound; signed-out viewers get anonymous SpacetimeDB identities and no private rows. A guest seat's device gets a short-lived token from `/api/spacetime/token` only for the battle its cookie holds (`heldGuestSeat`): it names the seat and `guestDeviceSubject` of the device's secret hash, with token type `spacetime-guest`. The module admits it (`admitConnection`) only while that device still holds the seat within its session, never as an account or admin, and ends the session when the host takes the seat back or the guest claims it. The seat exists in one battle, so `watch_battle` and `my_battle_signals` cannot reach another, and it has no product or admin revisions. Signals carry only the battle ID and sequence; the refetch goes through the same seat-checked read and `battleView` as any player's. A failed subscription must fall back to polling even if the transport is connected. Only a sustained applied subscription resets backoff. Only token HTTP 401 rechecks the account; outages never sign the player out. The SDK's automatic reconnect preserves its identity: account and guest-seat connections renew their short-lived tickets, while anonymous connections reuse their non-expiring host-issued token, because issuing another token creates another identity; `spacetimeConnection.ts` replaces the connection only when the first connection fails, the SDK gives up, `my_session` disappears, or every four minutes, because only a new connection extends `session_access` past a five-minute token.

## Offline battles

Downloaded workspaces filter private mission identities and decks. A queued command keeps its operation ID, expected sequence, validation-data revision, recorded time, and resolved random draw through retries. Reconnect accepts each once or keeps a conflict when another device advanced the history or the rules changed. Never rebase a played command, revalidate it under another rules revision, or redraw its cards. Missing authoritative data leaves commands pending. Export the saved history before discarding a conflict, and while connected show the authoritative history rather than freezing on the saved copy.

Failed connected reads may fall back to the durable workspace, but cancelled requests and changed accounts must not. A deleted or inaccessible battle becomes a retained refusal so other work can sync; auth failures, rate limits, and outages stay retryable. A missing workspace must not leave an accepted creation blocking the queue. A battle created on a device has a link before the service holds it, so a player can open that link first; the route's not-found view (`BattleNotFound`) asks again for a minute and opens the battle once it arrives.

## Verification

Run adjacent domain tests, the relevant `e2e/battle*.spec.ts`, `e2e/team-battle.spec.ts`, guest flows, and `e2e/offline-work.spec.ts`. Cover competing devices for sequence, undo, and prompt changes, and the clock across a rewind/pause/reopen cycle. Follow [Interface verification](interface.md#verification) for rendered surfaces.
