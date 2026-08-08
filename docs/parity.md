# BattleBase parity

Praetorium uses BattleBase's web interface as a reference for information architecture, density, and vocabulary. It uses the phone app's dark palette. Matching exact fonts or pixels is not a goal.

The reference is useful because players already understand it. Praetorium can differ when its two-player command log, catalogue data, or product scope requires a different design.

## Scope

Parity includes:

- New Recruit-style roster construction, validation, import, and export.
- BattleBase-style roster presentation and battle tracking.
- One synchronized battle shared by two signed-in players.

Parity does not include rankings, events, leagues, locations, friends, public battle discovery, chat, matchmaking, a rules encyclopedia, model positions, or wound allocation.

## Interface reference

Use these BattleBase web patterns unless Praetorium has a documented reason to differ:

- A dense three-column roster builder on desktop.
- Picker, roster, and loadout panes with one clear task each.
- Uppercase section headings, section counts, and compact points chips.
- Red and blue player ownership throughout the battle tracker.
- A persistent points total while editing a roster.

On phones, Praetorium keeps the roster visible and moves the picker or loadout into one sheet. The battle tracker uses one scrolling column with a fixed two-player scoreboard.

Reference screenshots are not stored in this repository. They can contain private roster and battle data. Capture new references when needed and keep them outside version control.

## Current coverage

| Area              | Coverage                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Accounts          | Email and password work without provider configuration. Google and Discord are optional.                 |
| Battles           | Two seats, server-side legality, stale-client rejection, undo, presence, and live updates.               |
| Turn tracker      | Five rounds, six phases, command points, victory points, stratagems, and battle completion.              |
| Rosters           | Build, import, save, copy, rename, share, print, export, and attach.                                     |
| Catalogue         | Factions, detachments, units, model counts, loadouts, enhancements, attachments, and points limits.      |
| Validation        | Constraints, modifiers, conditions, categories, force scope, attachments, and catalogue-sensitive costs. |
| Missions          | Force dispositions, deployment zones, objectives, mission cards, and scoring awards.                     |
| Battle review     | Per-round scoring, command points, turn duration, stratagems, unit outcomes, and event history.          |
| Responsive design | Three desktop panes and one mobile roster with movable picker and loadout sheets.                        |

## Known data limits

`just points` currently matches 99.6% of 1,863 Munitorum checks. The remaining differences are upstream prices for four Deathwatch datasheets. Keep new mismatches out of the baseline.

The fetched sources do not provide every mission-pack restriction or every prose replacement rule as structured data. Praetorium reports missing semantics instead of reconstructing them from memory.

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
