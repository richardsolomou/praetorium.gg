# Product design

Praetorium uses a compact, dark interface for players at one table. The roster builder is dense. The battle tracker uses clear ownership and large controls.

## Scope

Praetorium includes:

- Catalogue-backed roster construction, validation, import, and export.
- Compact roster presentation and battle tracking.
- One synchronized 1v1 or 2v1 battle between signed-in players, against a friend or a practice opponent.
- Mutual friendships for choosing private battle opponents, and practice opponents for playing without one.

It does not include rankings, events, leagues, locations, public battle discovery, chat, matchmaking, a rules encyclopedia, or model positions.

## Interface

Use these patterns consistently:

- A dense three-column roster builder on desktop.
- Picker, roster, and loadout panes with one clear task each.
- Uppercase section headings, section counts, and compact points chips.
- Red and blue player ownership throughout the battle tracker.
- A persistent points total while editing a roster.

On phones, the roster stays visible. The picker or loadout moves into one sheet. The battle tracker uses one column and a fixed scoreboard.

Battle setup is a walked rail of sections with a persistent summary. It separates table decisions from army preparation. It shows both sides before play starts.

Keep screenshots that contain roster or battle data outside version control.

## Current coverage

| Area              | Coverage                                                                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts          | Email and password work without provider configuration. Google and Discord are optional and linkable. Players can manage their profile, password, sign-in methods, and authenticator 2FA. Administrators can manage and impersonate accounts. |
| Battles           | Shared or practice 1v1 and 2v1 setup drafts, server-side legality, corrections, concessions, reopening, and live updates.                                                                                                                     |
| Turn tracker      | Five standard rounds, three King of the Colosseum rounds, six phases, command points, victory points, painted bonuses, tactical decks, stratagems, formations, and battle completion.                                                         |
| Rosters           | Build, import, save, copy, rename, private or unlisted share, print, export, and attach.                                                                                                                                                      |
| Catalogue         | Factions, detachments, units, model counts, loadouts, enhancements, attachments, and points limits.                                                                                                                                           |
| Validation        | Constraints, modifiers, conditions, categories, force scope, attachments, and catalogue-sensitive costs.                                                                                                                                      |
| Missions          | Force dispositions, deployment zones, objectives, mission cards, and scoring awards.                                                                                                                                                          |
| Battle review     | Per-round scoring, command points, result reasons, stratagems, unit outcomes, timestamped events, and corrections.                                                                                                                            |
| Responsive design | Three desktop panes and one mobile roster with movable picker and loadout sheets.                                                                                                                                                             |

## Known data limits

`just points` currently matches every generated reference check. Keep new mismatches out of the baseline.

The sources do not structure every restriction or replacement rule. Praetorium reports missing semantics. It does not reconstruct rules from memory.

The current sources do not provide enough transport relationships to automate embarking. Battle photos also remain outside the product boundary. These features stay absent rather than becoming local-only or guessed state.

## Verification

The browser suite covers the main workflow:

1. Build or import a roster.
2. Validate and save it.
3. Attach two rosters to a battle.
4. Complete setup and all five standard rounds from two browser contexts.
5. Review the finished battle and event history.

Also verify these interface details:

- Find unit cards with `data-unit`; CSS changes displayed text to uppercase.
- Render each picker or loadout pane once and move it with CSS.
- Keep `spreads`, `models`, `choices`, `toggles`, and attachments through pricing, saving, import, and export.
- Run `just points` after changing `defaultSelection`, `buildUnit`, `refit`, or evaluation logic.

See [Catalogue data](development/catalogue-data.md), [Battles](development/battles.md), and [Interface](development/interface.md) for implementation rules.
