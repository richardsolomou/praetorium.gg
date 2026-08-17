# Product design

Praetorium uses a compact, dark interface designed for two players at a table. The roster builder favors information density. The battle tracker favors clear ownership and large controls.

## Scope

Praetorium includes:

- Catalogue-backed roster construction, validation, import, and export.
- Compact roster presentation and battle tracking.
- One synchronized battle shared by two signed-in players.

It does not include rankings, events, leagues, locations, friends, public battle discovery, chat, matchmaking, a rules encyclopedia, model positions, or wound allocation.

## Interface

Use these patterns consistently:

- A dense three-column roster builder on desktop.
- Picker, roster, and loadout panes with one clear task each.
- Uppercase section headings, section counts, and compact points chips.
- Red and blue player ownership throughout the battle tracker.
- A persistent points total while editing a roster.

On phones, Praetorium keeps the roster visible and moves the picker or loadout into one sheet. The battle tracker uses one scrolling column with a fixed two-player scoreboard.

Keep screenshots that contain roster or battle data outside version control.

## Current coverage

| Area              | Coverage                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts          | Email and password work without provider configuration. Google and Discord are optional.                                                 |
| Battles           | Shared or solo setup drafts, server-side legality, clocks, corrections, concessions, reopening, presence, and live updates.              |
| Turn tracker      | Five rounds, six phases, command points, victory points, painted bonuses, tactical decks, stratagems, formations, and battle completion. |
| Rosters           | Build, import, save, copy, rename, private or unlisted share, print, export, and attach.                                                 |
| Catalogue         | Factions, detachments, units, model counts, loadouts, enhancements, attachments, and points limits.                                      |
| Validation        | Constraints, modifiers, conditions, categories, force scope, attachments, and catalogue-sensitive costs.                                 |
| Missions          | Force dispositions, deployment zones, objectives, mission cards, and scoring awards.                                                     |
| Battle review     | Per-round scoring, command points, clocks, result reasons, stratagems, unit outcomes, timestamped events, and corrections.               |
| Responsive design | Three desktop panes and one mobile roster with movable picker and loadout sheets.                                                        |

## Known data limits

`just points` currently matches 99.6% of 1,863 reference checks. Keep new mismatches out of the baseline.

The fetched sources do not provide every mission-pack restriction or every prose replacement rule as structured data. Praetorium reports missing semantics instead of reconstructing them from memory.

The current sources do not provide structured twist decks or enough transport relationships to automate embarking. Battle photos also require durable object storage that Praetorium does not currently operate. Those features stay absent rather than becoming local-only or guessed state.

## Verification

The browser suite covers the main workflow:

1. Build or import a roster.
2. Validate and save it.
3. Attach two rosters to a battle.
4. Complete setup and all five rounds from two browser contexts.
5. Review the finished battle and event history.

Also verify these interface details:

- Find unit cards with `data-unit`; CSS changes displayed text to uppercase.
- Render each picker or loadout pane once and move it with CSS.
- Keep `spreads`, `models`, `choices`, `toggles`, and attachments through pricing, saving, import, and export.
- Run `just points` after changing `defaultSelection`, `buildUnit`, `refit`, or evaluation logic.

See [Catalogue data](development/catalogue-data.md), [Battles](development/battles.md), and [Interface](development/interface.md) for implementation rules.
