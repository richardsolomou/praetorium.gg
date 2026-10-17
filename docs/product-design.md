# Product design

Praetorium is a Warhammer 40,000 army builder, combat simulator, battle tracker, and rules reference. This document owns product scope and the privacy contract; the development guides own implementation.

## Scope

Praetorium covers catalogue-backed lists, combat comparisons, friend and practice battles tracked with mission guidance or by hand, leagues with sealed rosters and a results table, and a public rules reference drawn from community data. Players control who may watch their battles.

It does not include pairings, brackets, schedules, locations, chat, matchmaking, rules this project wrote itself, model positions, or battle photos.

## Watching a battle

A battle is watchable by default and public battles are listed on the home page. Watching is read-only: a spectator sees the score, both armies, the public mission and stratagem state, and the visibility-filtered report, never a face-down Secret Mission or a control. A read never claims a seat.

The audience setting belongs to the player, not the battle. A battle takes the narrowest answer of everyone seated in it, so one private player keeps the whole table private. Friends means a confirmed friend of any seated player. The setting applies to past and live battles, including league battles, and a player who has never set it is public.

A profile is public, but its battle record and leaderboard place include only games the reader may watch; a player who keeps battles private shows a name without a record. The collection tab can be hidden in account settings. Each collection datasheet can carry up to six photos of the player's own models, shown in the collection, the datasheet page's gallery and the roster loadout pane, which prefers the reader's own photos. Players add them from the collection, the datasheet page or the loadout pane; adding one puts the datasheet in the collection. Removing a photo asks for confirmation. Signed-in players can like and report other players' photos; only like counts are shown, never who liked a photo. A report hides the photo from everyone but its owner until an administrator reviews it; a report on a photo an administrator kept leaves it shown and asks for another review. Administrators also see the newest unreported photos, so they can remove one nobody has reported.

The leaderboard counts finished public battles over the last 90 days, rated by who each player beat, with allies rated as one side and per-faction tables ranking players rather than factions. A concession is a loss whatever the score, allies share their side's points, and a battle with a practice opponent counts for nobody. A manually tracked battle counts in each player's record, labelled as manual, but not on the leaderboard: its score never passed through a mission's scoring rules.

## Publication and retained copies

Publication is named sharing. There is no separate anonymous archive of private game statistics. The [privacy policy](../src/client/features/legal/PrivacyPolicy.tsx) and the controls that publish or delete content must describe these boundaries before the action takes effect.

New saved rosters, copies, and imports start public unless the player chooses another default in settings or another access level for that roster. Sharing a private roster from the library first makes it unlisted and states that anyone holding the link can read it. Private access descriptions include read-only access for seated players through a named battle using that list.

| Content                                         | Who can read it                                                                                                 | What revocation or deletion changes                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Guest draft                                     | Browser storage on that device, shared by its tabs                                                              | Reloads keep it; explicit discard removes it; account saving claims it                                                                   |
| Saved roster                                    | Owner; unlisted link holders; public profile and discovery readers                                              | Returning to private revokes shared reads; deletion removes the saved list                                                               |
| Public roster discovery                         | Anyone; only saved rosters the owner made public, named for their owner                                         | Private, unlisted, deletion, or account deletion removes it on the next read; readers' duplicates are their own                          |
| Lent roster                                     | Owner; accepted friends the owner lent it to, read-only and without unit notes or preparation                   | The owner revoking, the borrower returning it, unfriending, or deletion ends the loan; battles keep the army as it was fielded           |
| Named battle roster access                      | Seated players in the named battle                                                                              | The saved-roster access exception is read-only and strips personal reminders; the battle UI reads the frozen army                        |
| Unit notes                                      | Owner only; never another reader of a saved roster, battle or league copy                                       | Copies keep them for their owner; text exports and exchange codes never include notes                                                    |
| Frozen battle army                              | Seated players and spectators permitted by the battle audience                                                  | Saved edits, privacy changes, and deletion do not rewrite it; battle deletion removes the log and copies                                 |
| Sealed league roster                            | Accepted assigned allies before reveal; event readers after reveal                                              | Saved edits or deletion do not rewrite it; replacement, unsealing, league deletion, or account deletion removes the relevant sealed copy |
| Battle screen, replay, event feed, and metadata | Seated players or readers permitted by the narrowest-seat audience                                              | Audience changes apply to historical and live reads; deletion removes the record                                                         |
| Collection photo                                | Owner; while the collection is shown on the profile, anyone on the profile, the datasheet page and rosters      | Hiding the collection, removing the datasheet or photo, administrator removal, and account deletion stop serving it on the next read     |
| Profile                                         | Public name and image; collection unless hidden in settings; battle records limited to games a reader may watch | Audience changes narrow its record; account deletion removes the profile                                                                 |
| Leaderboard                                     | Finished public, guided, non-practice battles from the bounded 90-day window                                    | Audience changes, reopening, and deletion invalidate derived rankings                                                                    |

Discover armies keeps no copy or ranking of its own: every read checks the saved roster, so private, unlisted, deleted, or account-deleted rosters disappear at once, and frozen battle armies are never listed. The owner's choice is the only gate; administrators remove abusive accounts through account cleanup.

Deleting a league removes its events and sealed rosters while battles keep their independent command-log copies. Account deletion removes the player's saved rosters, friendships, event entries, organized leagues, and every battle they played, including shared games. Downloaded or captured copies cannot be recalled. Revocable player-content preview images use `no-store`; public rules reference images may remain cached.

The authorities are [`RosterService.rosterAccess`](../src/server/services/rosterService.ts), [`rosterDiscovery.ts`](../src/core/rosterDiscovery.ts), [`PraetoriumService`](../src/server/service.ts), [`league.ts`](../src/core/league.ts), and the transactional deletion procedures in [`spacetimedb/src/index.ts`](../spacetimedb/src/index.ts). [Battles](development/battles.md), [Leagues](development/leagues.md), and [Catalogue data](development/catalogue-data.md) own the implementation and verification requirements; [Interface](development/interface.md) owns presentation.

Screenshots containing roster or battle data stay outside version control.

## Known data limits

The sources do not structure every restriction or replacement rule. Praetorium reports missing semantics and does not reconstruct rules from memory. Transport capacity and passenger restrictions exist only in prose: the app reads the printed capacity, keywords, exclusions, and space costs, enforces them, and refuses a transport whose rule it cannot read in full.
