# Interface

Praetorium uses a compact, dark visual system. See [the product design guide](../product-design.md) for its scope and layout.

## Layout

- Use compact, uppercase headings, section counts, points chips, and red or blue player tints consistently.
- Keep player tints on scores and controls. The tint identifies ownership across the table.
- Edit squad size on the roster card. Do not add a second squad-size control to the loadout pane.
- Render each picker or loadout pane once. `src/client/components/builder/Pane.tsx` moves the same instance between a desktop sidebar and a mobile sheet. Two instances create duplicate form controls and accessibility labels.
- Show allied picker shelves with their short faction name and keep them collapsed until a player needs them.
- Use `data-unit` to find unit cards in tests. CSS changes the displayed case, so visible-text selectors do not match the source text reliably.
- Keep battle setup in five visible sections: Format, Armies, Battlefield, Pre-battle, and First turn. The active section is folded from the battle log so every seated device moves together. Show every attached roster, and let anyone at the table set reserves and the battle-ready bonus for any army while the table is being set. A roster stays the choice of the player who owns it.
- Choose saved rosters in a dialog ordered like the roster library. Keep battlefield selection stable while its command saves, and open each battlefield in a full-size dialog without changing the selection.
- In the live tracker, show only stratagems valid for the current turn and phase. The CP badge spends the printed cost; the overflow menu handles modified costs. A stratagem opens the same text the detachment page prints, from `detachmentRules`.
- Keep missions and stratagems side by side in a side panel. Both are read constantly, so neither is worth scrolling for, and neither carries a per-round breakdown.
- Ask for a card's points only as the phase or turn its own data names comes to an end. `src/client/scoring.ts` decides which cards are due; the controls exist only in that prompt, never in the panel.
- Deal a tactical hand rather than offering the deck. The prompt opens at the top of the player's turn, draws at random, and offers a card back only where `whenDrawn` says the rules allow it.
- Record the battle-ready bonus during setup and add it to the score only once the battle is finished.
- Link a player's name to their profile and their list to `/r/$id` with the battle token, which is what entitles a seated opponent to read it.
- Lay both setup and the tracker out by side, never by seat. `src/client/sides.ts` folds `BattleView.players` into sides; read command points, victory points, mission cards and stratagems from there. A 2v1 ally is a second army inside one side panel, not a third column.
- Draw one scoreboard at every width. It carries both sides' scores, the round and phase, and the battle menu that holds finishing, conceding and deleting. Keep destructive actions in that menu and behind a confirmation.
- Keep the phase control reachable at every width. One instance moves by CSS between the centre column and a bottom bar on narrow screens, as `builder/Pane.tsx` does for the roster panes.
- Open long card lists in a dialog rather than laying dozens of buttons into a panel, and close the dialog on the pick.

## Components and styles

- `src/components/ui` contains generated shadcn Base UI components. Add or replace them with the shadcn CLI. Do not edit them by hand.
- `src/styles.css` maps root tokens to Tailwind color utilities through `@theme inline`. Generated components depend on that mapping.
- Barlow Semi Condensed handles the compact display hierarchy; regular Barlow handles paragraph-length rules text. Both OFL-licensed faces are registered in the main stylesheet and preloaded by the root route. Do not add a font without its license or hide it behind client-side loading.

## Verification

Inspect every rendered change in a browser at desktop and phone widths. Use the same component instances at both sizes. Run the relevant Playwright flow after inspection.
