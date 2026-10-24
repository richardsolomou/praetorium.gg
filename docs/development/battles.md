# Battles

## Code map

| Question                                         | Owner                                                           |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Commands, legality, and folded state             | `src/core/battle.ts`                                            |
| Viewer-specific fields and historical visibility | `src/core/battleView.ts`                                        |
| Report, replay, and clocks                       | `src/core/battleReport.ts`, `battleReplay.ts`, `battleClock.ts` |
| Results and player records                       | `src/core/standings.ts`, `serviceRecord.ts`                     |
| Storage and application operations               | `src/server/spacetimeRepository.ts`, `src/server/services`      |
| Screens and prompts                              | `src/client/features/battle`                                    |
| Offline queue and saved workspaces               | `src/client/offline/battleFunctions.ts`                         |
| Realtime signals and connection                  | `src/client/productSignals.ts`, `spacetimeConnection.ts`        |

[Game rules](game-rules.md) owns mission and scoring semantics. [Interface](interface/surfaces.md#battles-and-leagues) owns layout and interaction. [Leagues](leagues.md#battles) owns event-linked creation.

## Command log

Repository submission reads, validates, and appends atomically.

`expectedSeq` covers the whole log; never automatically resend a `stale` command with a newer sequence. A stale or refused command discards queued work built on that sequence, not work built from a newer realtime screen; a failed background write discards nothing.

Scoring settlement, tactical draws, and discard/CP actions are each atomic undo targets. Every required prompt keeps Undo available when rewinding reopens it.

Any seated player can operate either side's shared actions; preserve the actor and the affected side/player separately, and omitted player IDs keep their historical meaning. Only the creator can delete a battle.

## Seating and setup

Creation seats the entire table in one transaction; reads never take seats and there is no join mutation. A battle started from a saved roster's menu then attaches that roster to the creator's seat; if the attach is refused, setup offers the choice as usual. The creator holds the first seat on side 0; an ally there does not inherit deletion rights. Table shape is fixed at creation.

Practice opponents are ordinary seats backed by credential-less accounts, using a seated player's roster without friendship; there is no automated opponent. Exclude practice battles from public/friends feeds, standings, and service records.

A guest is a real opponent without an account, seated on the opposing side by the name the creator gives them. `src/core/newBattle.ts` and `src/core/guestSession.ts` own the decisions:

- Identity: `guestSeatId` scopes the seat to its battle; the name lives only on the seat row (`battle_users.guestName`), not in the log.
- Operation: until the guest joins, the seat is automated like a practice seat, so seated players choose its roster from their own lists, answer its prompts, and see its private cards.
- Joining: a seated account shares the seat's link (`guest_seats.invite`); the first device to open it takes the seat through its HTTP-only `praetorium-guest` cookie. The host's "take back" replaces the link and forgets the device, so the table plays the seat again; a guest who clears storage or changes device asks for a new link.
- Acting: `battleViewerId` in `src/server/guestSession.ts` resolves who reads or acts. The service and fold then treat the seat like any other, so a guest acts only as their own seat in their own battle, through the same `mutationRpc` origin checks. A guest has no saved lists and fields the device's builder draft (`attach-draft-roster`). Guests stay connected-only, with no offline workspace or server analytics person; offline play for a guest is not supported. Their battle follows the same [live signal](#realtime-updates) as a seated account's.
- Visibility: the guest's name shows wherever the battle does. Creation says so.
- Claiming: once the battle is finished, a signed-in device holding the seat can claim it (`guestClaimRefusal`), and the product module seats the account in its place (`battle_users.claimedSeat`). `battleData` in the product module is the only place commands leave storage; it resolves the seat through `claimedLog`, so every reader (fold, visibility, report, records, standings, feeds, played armies) sees one battle between two accounts. Every existing authority then applies: both records, standings when it is guided, and account deletion. A claim is not withdrawn; after a reopen the account appends under its own ID.
- Not supported: guests in leagues or on the creator's side.

Setup progress is derived from the log. Any seated player may answer for either side, but may choose only their own, lent, or practice-seat rosters. Any seated device records derived cards once every army is in, so an absent player cannot block setup; shared choices wait for those writes.

A layout without pinned geometry cannot start; legacy layout IDs resolve only through an unambiguous saved disposition pair and variant, never a substitute.

## Manual tracking

Every surface that chooses or shows manual tracking (`settings.manual`) states `MANUAL_TRACKING_LIMITS`, so nothing implies a rules check.

## Frozen armies

Attaching a saved roster rechecks ownership or an active loan, price, and legality on the server, then freezes the list, supported wound values, rules-version metadata, and any custom budget. Later saved-list edits or deletion cannot rewrite a battle. Incomplete validation is a warning, not invented legality. A lent list records its lender, so revoking the loan changes nothing; lent lists attach online only and never enter a league entry. Resolve historical catalogue IDs absent from the current index, and never replace frozen rules-version metadata with the current status.

[Combat simulation](combat-simulation.md#interface-and-context) owns battle matchups.

Personal roster reminders and frozen unit notes are owner-only: `battleView`, `visibleBattleLog`, and `leagueRoster` strip them from every other read; frozen custom unit names stay visible to every reader of the army. Reminder dismissals are local state, not commands, and reminders never replace shared scoring guards or prompts.

Deep Strike changes ingress, not Strategic Reserves membership. `unitFormationRefusal` is the formation authority for `validate` and setup controls; [`src/core/transport.ts`](../../src/core/transport.ts) owns embarking. Incomplete source facts never invent restrictions.

## Prompts and replay

Required scoring, draw, discard, and Secret Mission work is folded from the log, shared, and completed once by any seated device. Prior-turn settlement precedes the incoming tactical draw. A helper's hidden view cannot establish that another side has no private work; practice seats have no private player to answer for them.

Replay folds each selected prefix with that moment's visibility. Saved secondary name-slug IDs resolve only when unambiguous. Spectators may scrub a live battle; seated players get replay after finishing.

## Audience and records

Every battle with a seated account is public: feeds, links, replay, profiles, and previews show it to anyone (`mayWatch` in `src/server/service.ts`). Filter feeds before pagination in the database.

`battleView` is the only field-visibility decision.

Standings read bounded logs. Revision changes invalidate caches across replicas after finish, reopen, deletion, or visibility changes; report the actual window when a count limit truncates it. Teams Event battle points (`teamsBattlePoints.ts`) are display-only: results, standings, and ratings never use them.

## Realtime updates

Subscriptions carry IDs, sequences, or bounded revision counters, never product state; refetch through permission-checked reads. The public battles signal refreshes feeds, not an open battle, which follows its own signal. Use internal battle IDs, not share tokens. User, shared, and admin revisions have separate access boundaries.

Signed-in tokens are deployment-bound; signed-out viewers get anonymous SpacetimeDB identities and no private rows. A guest seat's device gets a token from `/api/spacetime/token` only for the battle its cookie holds (`heldGuestSeat`), and the module admits it (`admitConnection`) only as that seat. A failed subscription must fall back to polling even if the transport is connected. `src/client/spacetimeConnection.ts` owns reconnects and backoff.

## Offline battles

A queued command keeps its operation ID, expected sequence, validation-data revision, recorded time, and resolved random draw through retries. Never rebase a played command, revalidate it under another rules revision, or redraw its cards. Export the saved history before discarding a conflict, and while connected show the authoritative history rather than freezing on the saved copy.

Failed connected reads may fall back to the durable workspace, but cancelled requests and changed accounts must not. Auth failures, rate limits, and outages stay retryable. A missing workspace must not leave an accepted creation blocking the queue.

## Verification

Run adjacent domain tests, the relevant `e2e/battle*.spec.ts`, `e2e/team-battle.spec.ts`, guest flows, and `e2e/offline-work.spec.ts`. Cover competing devices for sequence, undo, and prompt changes, and the clock across a rewind/pause/reopen cycle. Follow [Interface verification](interface.md#verification) for rendered surfaces.
