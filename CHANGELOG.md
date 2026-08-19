# praetorium

## 0.12.0

### Minor Changes

- fe1301e: Split unit lists into collapsible datasheet categories.

## 0.11.1

### Patch Changes

- e621751: Stop the global search shortcut from throwing on Android soft keyboards that dispatch key events without a key.

## 0.11.0

### Minor Changes

- 0795eb7: Show user profile pictures and links in the battle tracker.

## 0.10.0

### Minor Changes

- 0c66b6a: Show faction icons and faction and detachment links on battle scoreboards.

## 0.9.0

### Minor Changes

- 3ff636b: Use one roster page for editing and sharing, with changes available only to its owner.

### Patch Changes

- d61574d: Preserve compound weapon loadouts when importing text rosters.

## 0.8.1

### Patch Changes

- bcbbf31: Add battle actions to the battle library's context and overflow menus.
- bcbbf31: Assign primary missions to the correct side and allow either player to rewind battle actions across turns.

## 0.8.0

### Minor Changes

- 9bdf3c9: Edit your display name and profile picture from the account menu.
- 171f874: Import pasted New Recruit roster exports.

### Patch Changes

- 9bdf3c9: Use a compact navigation menu below 815 pixels.

## 0.7.0

### Minor Changes

- 6cdff42: Ask each mission payout in the words the mission pack prints on the card, so a row says what to check instead of restating the points it pays. The card's full text moves behind its name. The prompt that deals your secondary missions can no longer be dismissed by clicking away from it.
- 2b29aad: Rebuild battle setup and the live tracker around sides, so a 2v1 shows one score, one command point pool and one hand of cards for the allied pair. Deal tactical missions at random when a turn opens, and ask each card its own question at the moment it pays out: what it wants, what meeting it pays, and a way to say it scored nothing. A card that pays at the end of the opponent's turn is settled as the turn comes back, before the next hand is dealt over it, and the list of battles updates itself when someone adds you to one. Missions still in play sit at the top of the hand until they are scored or put back. Battles, shared lists and profiles now live at `/battles/…`, `/rosters/…` and `/players/…` rather than the old one-letter paths, which no longer resolve.

### Patch Changes

- 6cdff42: Import BattleBase rosters with named game formats, combined detachments, enhancements and repeated wargear choices.

## 0.6.0

### Minor Changes

- 46f8e96: Add friend-only 2v1 battles with separate allied armies, shared team resources, and collaborative setup.
- 488d597: Search pages, game references, rosters, and battles from anywhere.

### Patch Changes

- 6750113: Make roster editing sidebars easier to navigate on mobile and expose unit datasheets.
- 53ae105: Show each unit's attachment targets only once on its datasheet.
- a5239de: Show each faction's full army rule on its faction page.

## 0.5.2

### Patch Changes

- f6ed4d0: Improve datasheet readability and show accurate composition, profile, and attachment options.

## 0.5.1

### Patch Changes

- 8f3e7ab: Remove enhancements cleanly, show each selected enhancement once, and keep the roster visible while adding units.
- 4899109: Show complete datasheets with correctly classified abilities, unit composition, loadout, and wargear options.

## 0.5.0

### Minor Changes

- 5de00a8: Show each faction with its own icon and colour, and sync faction favourites across devices.

## 0.4.6

### Patch Changes

- 99f4eda: Improve wargear defaults and per-model choices, enforce faction restrictions, clarify invulnerable saves, and speed up catalogue-backed pages.

## 0.4.5

### Patch Changes

- 4ef4500: Add forced detachment enhancements to required units and preserve complete, readable datasheet rules.

## 0.4.4

### Patch Changes

- 428cb87: Validate shared upgrades and conditional catalogue pricing without showing unsupported rule warnings.

## 0.4.3

### Patch Changes

- 5d2713b: Show unit upgrades separately from character enhancements.

## 0.4.2

### Patch Changes

- 57a040d: Show available enhancement rules and preserve mandatory wargear when changing a unit's loadout.

## 0.4.1

### Patch Changes

- 64a7e58: Keep roster controls stable, simplify roster setup, collapse enhancements by default, and explain profiles and abilities beside their loadout choices.
- e862ede: Keep community catalogue data available through verified shared snapshots.

## 0.4.0

### Minor Changes

- 1ff10c7: Build and play King of the Colosseum battles with its prototype army restrictions.
- a666bb2: Group allied units by faction at the bottom of the unit picker and let players hide them.

### Patch Changes

- bc07d07: Export rosters as Games Workshop text from the actions menu.
- 3f9747a: Keep modal controls reachable on shorter screens.
- 7830c22: Offer legal model replacements in mixed-composition squads.

## 0.3.1

### Patch Changes

- b324bc9: Show the correct weapon quantities in roster datasheets.
- 801703b: Show owned datasheets first in the roster picker and remove the redundant view icon.

## 0.3.0

### Minor Changes

- f8e8fc5: Manage guided battle setup with exact battlefield plans, clocks, tactical missions, corrections, results, and richer private rosters.
- a471aaf: Import BattleBase rosters, browse mission references, and inspect detachment rules while editing a roster.
- ce03dde: Set a battle up one step at a time, then track it on a board that shows the round, the phase and the running log beside each army's own missions and stratagems.

## 0.2.3

### Patch Changes

- 2de8bb2: Capture anonymous server telemetry for collection updates and roster deletion.

## 0.2.2

### Patch Changes

- d59bdee: Publish and deploy release images by immutable digest.

## 0.2.1

### Patch Changes

- 097910d: Capture anonymous server telemetry for key battle milestones and operational failures.

## 0.2.0

### Minor Changes

- 90e4d6f: Add privacy-safe product analytics, session replay, feature flags, error tracking, and account identity.

## 0.1.1

### Patch Changes

- 2d7ff97: Adopt automated versioned releases for Praetorium.
