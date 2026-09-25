# Product design

Praetorium uses a compact, dark interface. The roster builder is dense; the battle tracker makes ownership and actions clear.

## Scope

Praetorium covers catalogue-backed lists, combat comparisons, friend and practice battles, league registration with sealed rosters, and a public rules reference drawn from community data. The home page shows relevant games and lists, public activity, and the leaderboard. Players control who may watch their battles.

It does not include pairings, brackets, locations, chat, matchmaking, rules this project wrote itself, or model positions.

## Watching a battle

A battle is watchable by default. Anyone may open a public battle's link, and the home page lists public battles so a game can be found without one. Watching is read-only: a spectator sees the score, both armies, the public mission and stratagem state, and the visibility-filtered report, never a face-down Secret Mission and never a control. A read never claims a seat.

The audience belongs to the player rather than the battle, because a player answers it once instead of at every game. A battle takes the narrowest answer of everyone seated in it, so one player choosing to keep their battles private keeps the whole table private. The setting applies to battles already being played, and a player who has never opened it is public.

A player's profile is public, but its battle record and leaderboard place include only games the reader may watch. A player who keeps their battles private shows a name without a record. Readers can filter the record by army, detachment, opponent, mission pack, and battle size.

The leaderboard counts finished public battles over the last 90 days. A row is a player, ranked by wins and then win rate. Beside the overall table there is one per faction anybody has played, ranking the players who fielded it rather than giving the faction a record of its own. A concession is a loss whatever the score said, allies share their side's points, games of every table shape count together, and a battle with a practice opponent in it counts for nobody.

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

## Known data limits

The sources do not structure every restriction or replacement rule. Praetorium reports missing semantics. It does not reconstruct rules from memory.

The current sources do not provide enough transport relationships to automate embarking. Battle photos also remain outside the product boundary. These features stay absent rather than becoming local-only or guessed state.

[Catalogue data](development/catalogue-data.md), [Battles](development/battles.md), and [Interface](development/interface.md) describe the implementation in detail.
