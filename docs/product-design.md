# Product design

Praetorium uses a compact, dark interface. The roster builder is dense; the battle tracker makes ownership and actions clear.

## Scope

Praetorium covers catalogue-backed lists, combat comparisons, friend and practice battles, league registration with sealed rosters, and a public rules reference drawn from community data. The home page shows relevant games and lists, public activity, and the leaderboard. Players control who may watch their battles.

It does not include pairings, brackets, locations, chat, matchmaking, rules this project wrote itself, or model positions.

## Watching a battle

A battle is watchable by default. Anyone may open a public battle's link, and the home page lists public battles so a game can be found without one. Watching is read-only: a spectator sees the score, both armies, the public mission and stratagem state, and the visibility-filtered report, never a face-down Secret Mission and never a control. A read never claims a seat. A spectator who has not played yet is invited to build an army or start a battle of their own, most prominently once the game has finished.

The audience belongs to the player rather than the battle, because a player answers it once instead of at every game. A battle takes the narrowest answer of everyone seated in it, so one player choosing to keep their battles private keeps the whole table private. Friends means a confirmed friend of any seated player. The setting applies to past and live battles, including league battles, and a player who has never opened it is public.

A player's Collection profile tab groups owned models by faction and counts each datasheet. Collections start private; Show collection on profile publishes the current datasheets and model counts. Owners can manage their collection from this tab, and turning sharing off removes the tab for other readers.

A player's profile is public, but its battle record and leaderboard place include only games the reader may watch. A player who keeps their battles private shows a name without a record. Readers can filter the record by army, detachment, opponent, mission pack, and battle size.

The owner sees monthly win rates by detachment, primary mission, and battle size on their profile. These are the player's results from the same visible finished battles as their service record; a draw counts as half a win.

The leaderboard counts finished public battles over the last 90 days. A row is a player, ranked by a rating that weighs who they beat, with allies rated as one side. Beside the overall table there is one per faction anybody has played, ranking the players who fielded it rather than giving the faction a record of its own. A concession is a loss whatever the score said, allies share their side's points, games of every table shape count together, and a battle with a practice opponent in it counts for nobody.

## Publication and retained copies

Publication is named sharing. There is no separate anonymous archive of private game statistics. The [privacy policy](../src/client/features/legal/PrivacyPolicy.tsx) and the controls that publish or delete content must describe these boundaries before the action takes effect.

Sharing a private roster from the library first makes it unlisted; the action states that anyone holding the link can read it. Private access descriptions include read-only access for seated players through a named battle using that list.

| Content                                         | Who can read it                                                                                                                    | What revocation or deletion changes                                                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Guest draft                                     | Browser storage on that device, shared by its tabs                                                                                 | Reloads keep it; explicit discard removes it; account saving claims it                                                                   |
| Saved roster                                    | Owner; unlisted link holders; public profile and discovery readers                                                                 | Returning to private revokes shared reads; deletion removes the saved list                                                               |
| Public roster discovery                         | Anyone; only saved rosters the owner made public, named for their owner                                                            | Private, unlisted, deletion, or account deletion removes it on the next read; readers' duplicates are their own                          |
| Named battle roster access                      | Seated players in the named battle                                                                                                 | The saved-roster access exception is read-only and strips personal reminders; the battle UI reads the frozen army                        |
| Unit notes                                      | Owner; readers of the saved roster only after the owner turns on Share unit notes; never another reader of a battle or league copy | Turning sharing off revokes saved-roster reads; copies start unshared; text exports and exchange codes never include notes               |
| Frozen battle army                              | Seated players and spectators permitted by the battle audience                                                                     | Saved edits, privacy changes, and deletion do not rewrite it; battle deletion removes the log and copies                                 |
| Sealed league roster                            | Accepted assigned allies before reveal; event readers after reveal                                                                 | Saved edits or deletion do not rewrite it; replacement, unsealing, league deletion, or account deletion removes the relevant sealed copy |
| Battle screen, replay, event feed, and metadata | Seated players or readers permitted by the narrowest-seat audience                                                                 | Audience changes apply to historical and live reads; deletion removes the record                                                         |
| Profile                                         | Public name and image; an optionally published collection; battle records limited to games the reader may watch                    | Audience changes narrow its record; account deletion removes the profile                                                                 |
| Leaderboard                                     | Finished public, non-practice battles from the bounded 90-day window                                                               | Audience changes, reopening, and deletion invalidate derived rankings                                                                    |

Discover armies lists saved rosters whose owner chose Public, most recently saved first, beside the owner's name. It keeps no separate copy or ranking: every read checks the saved roster, so making it private or unlisted, deleting it, or deleting the account removes it at once. A duplicate is the reader's own roster and records nothing on the source. Frozen battle armies are not listed. The owner's choice is the only gate; administrators remove abusive accounts through account cleanup.

Deleting a league removes its events and sealed rosters while battles keep their independent command-log copies. Account deletion removes the player's saved rosters, friendships, event entries, organized leagues, and every battle they played, including shared games. Copies a reader has downloaded or captured cannot be recalled. Revocable player-content preview images use `no-store`; public rules reference images may remain cached.

The authorities are [`RosterService.rosterAccess`](../src/server/services/rosterService.ts), [`rosterDiscovery.ts`](../src/core/rosterDiscovery.ts), [`PraetoriumService`](../src/server/service.ts), [`league.ts`](../src/core/league.ts), and the transactional deletion procedures in [`spacetimedb/src/index.ts`](../spacetimedb/src/index.ts). [Battles](development/battles.md), [Leagues](development/leagues.md), and [Catalogue data](development/catalogue-data.md) own the implementation and verification requirements.

## Interface

The interface has these recurring patterns:

- A dense three-column roster builder on desktop.
- Picker, roster, and loadout panes with one clear task each.
- Uppercase section headings, section counts, and compact points chips.
- Red and blue player ownership throughout the battle tracker.
- A persistent points total while editing a roster.

On phones, the roster stays visible. The picker or loadout moves into one sheet. The battle tracker uses one column and a fixed scoreboard.

Battle setup is one page in rules order, with an index to each section and a bar naming what is left beside Start battle. Sections with a default or nothing to decide fold to one line. It separates table decisions from army preparation, and anyone at the table can answer for either side. It shows both sides before play starts.

Screenshots containing roster or battle data stay outside version control.

## Known data limits

The sources do not structure every restriction or replacement rule. Praetorium reports missing semantics. It does not reconstruct rules from memory.

The current sources describe transport capacity and passenger restrictions in prose. Players can record which unit starts in which transport; the app enforces the printed numeric model limit and leaves special space costs and passenger restrictions to the table. Battle photos remain outside the product boundary.

[Catalogue data](development/catalogue-data.md), [Battles](development/battles.md), and [Interface](development/interface.md) describe the implementation in detail.
