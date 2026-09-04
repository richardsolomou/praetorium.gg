# Product design

Praetorium uses a compact, dark interface for players at one table. The roster builder is dense. The battle tracker uses clear ownership and large controls.

## Scope

Praetorium includes:

- Catalogue-backed roster construction, validation, import, and export.
- Compact roster presentation and battle tracking.
- One synchronized 1v1, 2v1, or 2v2 battle between signed-in players, against a friend or a practice opponent. Every player is named when the battle is created; there are no open seats to join.
- Mutual friendships for choosing private battle opponents, and practice opponents for playing without one.
- Public or private organized-play registration with reusable events, approved entry, replaceable sealed roster snapshots, simultaneous reveal, and read-only event battle viewing.
- A home page of shared activity, ordered outwards from the reader: the player's unfinished games, the games they have recently finished, their friends' recent games, and recent public battles including finished ones. Practice games stay in battle history rather than appearing on the home page.
- A per-player audience setting covering every battle they sit in: anyone, friends, or nobody outside the table.

It does not include pairings, brackets, locations, chat, matchmaking, a rules encyclopedia, or model positions.

## Watching a battle

A battle is watchable by default. Anyone may open a public battle's link, and the home page lists public battles so a game can be found without one. Watching is read-only: a spectator sees the score, both armies, the public mission and stratagem state, and the visibility-filtered report, never a face-down Secret Mission and never a control. A read never claims a seat.

The audience belongs to the player rather than the battle, because a player answers it once instead of at every game. A battle takes the narrowest answer of everyone seated in it, so one player choosing to keep their battles private keeps the whole table private. The setting applies to battles already being played, and a player who has never opened it is public.

The leaderboard counts finished public battles over the last 90 days. A row is a player. Beside the overall table there is one per faction anybody has played, ranking the players who fielded it rather than giving the faction a record of its own. A concession is a loss whatever the score said, allies share their side's points, and a battle with a practice opponent in it counts for nobody.

## Interface

The interface has these recurring patterns:

- A dense three-column roster builder on desktop.
- Picker, roster, and loadout panes with one clear task each.
- Uppercase section headings, section counts, and compact points chips.
- Red and blue player ownership throughout the battle tracker.
- A persistent points total while editing a roster.

On phones, the roster stays visible. The picker or loadout moves into one sheet. The battle tracker uses one column and a fixed scoreboard.

Battle setup is a walked rail of sections with a persistent summary. It separates table decisions from army preparation. It shows both sides before play starts.

Screenshots containing roster or battle data stay outside version control.

## Current coverage

| Area              | Coverage                                                                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts          | Email and password work without provider configuration. Google and Discord are optional and linkable. Players can manage their profile, password, sign-in methods, and authenticator 2FA. Administrators can manage and impersonate accounts. |
| Battles           | Shared or practice 1v1, 2v1, and 2v2 setup drafts, server-side legality, corrections, concessions, reopening, and live updates.                                                                                                               |
| Turn tracker      | Five battle rounds, six phases, command points, victory points, painted bonuses, tactical decks, stratagems, formations, and battle completion.                                                                                               |
| Rosters           | Build, import, save, copy, rename, private or unlisted share, print, export, and attach.                                                                                                                                                      |
| Leagues           | Public or private reusable events, automatic or approved entry, replaceable roster snapshots, organizer-controlled simultaneous reveal, and live or finished battle viewing.                                                                  |
| Catalogue         | Factions, detachments, units, model counts, loadouts, enhancements, attachments, and points limits.                                                                                                                                           |
| Validation        | Constraints, modifiers, conditions, categories, force scope, attachments, and catalogue-sensitive costs.                                                                                                                                      |
| Missions          | Force dispositions, deployment zones, objectives, mission cards, and scoring awards.                                                                                                                                                          |
| Battle review     | Per-round scoring, command points, result reasons, stratagems, unit outcomes, timestamped events, and corrections.                                                                                                                            |
| Responsive design | Three desktop panes and one mobile roster with movable picker and loadout sheets.                                                                                                                                                             |

## Known data limits

`just points` currently matches every generated reference check. A new mismatch is a regression unless the generated reference set has changed.

The sources do not structure every restriction or replacement rule. Praetorium reports missing semantics. It does not reconstruct rules from memory.

The current sources do not provide enough transport relationships to automate embarking. Battle photos also remain outside the product boundary. These features stay absent rather than becoming local-only or guessed state.

## Verification

The browser suite builds or imports a roster, validates and saves it, attaches two rosters to a battle, completes setup and five standard rounds from two browser contexts, and reviews the finished battle and event history.

Unit cards are located through `data-unit` because CSS changes their displayed text to uppercase. Picker and loadout panes have one component instance that CSS moves between layouts. Pricing, saving, import, and export preserve `spreads`, `models`, `choices`, `toggles`, and attachments. Changes to `defaultSelection`, `buildUnit`, `refit`, or evaluation logic include a `just points` run.

[Catalogue data](development/catalogue-data.md), [Battles](development/battles.md), and [Interface](development/interface.md) describe the implementation in detail.
