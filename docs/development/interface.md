# Interface

Praetorium uses a compact, dark visual system. See [the product design guide](../product-design.md) for its scope and layout.

## Layout

- Use compact, uppercase headings, section counts, points chips, and red or blue player tints consistently.
- Keep player tints on scores and controls. The tint identifies ownership across the table.
- Edit squad size on the roster card. Do not add a second squad-size control to the loadout pane.
- Render each picker or loadout pane once. `src/client/components/builder/Pane.tsx` moves the same instance between a desktop sidebar and a mobile sheet. Two instances create duplicate form controls and accessibility labels.
- Split unit lists into collapsible primary-category shelves and omit empty shelves. Use the same shelf order on rosters, in the picker and on faction datasheet pages.
- Show allied picker shelves with their short faction name and keep them collapsed until a player needs them.
- A unit card is one target. Its name, its wargear, its enhancements, its upgrades and the rows naming who it is standing with all open the unit; only the controls that do something else — the overflow menu, detaching, joining — take their own clicks back.
- Use `data-unit` to find unit cards in tests and `data-roster` to find library rows. CSS changes the displayed case, so visible-text selectors do not match the source text reliably — and a word like "Unlisted" appears both on a row and in the menu item that changes it, so an unscoped match can pass before the change lands.
- Keep battle setup in five visible sections: Format, Armies, Battlefield, Pre-battle, and First turn. The active section is folded from the battle log so every seated device moves together. Show every attached roster, and let anyone at the table set reserves and the battle-ready bonus for any army while the table is being set. A roster stays the choice of the player who owns it.
- Choose saved rosters in a dialog ordered like the roster library. Keep battlefield selection stable while its command saves, and open each battlefield in a full-size dialog without changing the selection.
- In the live tracker, show only stratagems valid for the current turn and phase. The CP badge spends the printed cost; the overflow menu handles modified costs. A stratagem opens the same text the detachment page prints, from `detachmentRules`.
- Keep missions and stratagems side by side in a side panel. Both are read constantly, so neither is worth scrolling for, and neither carries a per-round breakdown.
- Ask for a card's points only as the phase or turn its own data names comes to an end. `src/client/scoring.ts` decides which cards are due and which draws are still owed; the controls exist only in that prompt, never in the panel.
- Word the prompt as the card does: one row per condition in the mission pack's own words, with what meeting it pays, and a row for scoring nothing. The card's full text belongs behind its name, not above every row. The payout itself is the control, so the number pressed is the number scored. Rows the card puts in one group are tiers, so picking one clears the others; anything ungrouped a card can pay at the same time. A counted payout is a count, bounded by the ceiling the card sets.
- Open one prompt at a time. What the opponent's turn owed is settled before the hand for this one is dealt, or the two stack and the second covers the first.
- A card that pays on the opponent's turn is settled on the device that holds it, as the turn comes back. The shared prompts belong to the seat that owns a side's cards, so a 2v1 cannot answer them twice.
- Deal a tactical hand rather than offering the deck. The prompt opens at the top of the player's turn, draws at random, and offers a card back only where `whenDrawn` says the rules allow it.
- Record the battle-ready bonus during setup and add it to the score only once the battle is finished.
- Link a player's name and picture to `/users/$userId`, and their list to `/rosters/$id` with the battle token, which is what entitles a seated opponent to read it. Link each catalogue-backed army's faction mark, faction name, and detachments to their reference pages.
- `/rosters/$id` is the one roster surface. Its owner gets the builder controls; every other entitled reader gets the same roster cards and loadout details without mutation controls.
- Lay both setup and the tracker out by side, never by seat. `src/client/sides.ts` folds `BattleView.players` into sides; read command points, victory points, mission cards and stratagems from there. A 2v1 ally is a second army inside one side panel, not a third column.
- Draw one scoreboard at every width. It carries both sides' scores, the round and phase, and the battle menu that holds finishing, conceding and deleting. Keep destructive actions in that menu and behind a confirmation.
- Keep both sides' public controls available to every seated player, including the phase control, command points, scoring and stratagems. A player may help the active side without changing who the log says performed the action. Keep undealt tactical cards and hidden missions private, and disable a helper's phase control with an opaque prompt while the active side has opening mission work or a hidden end-of-turn choice.
- Keep the phase control reachable at every width. One instance moves by CSS between the centre column and a bottom bar on narrow screens, as `builder/Pane.tsx` does for the roster panes, and always advances the active side.
- Open long card lists in a dialog rather than laying dozens of buttons into a panel, and close the dialog on the pick.

## Components and styles

- Explain everything on hover through `HoverTooltip`, which takes a title, the words themselves, and a note saying where they came from. The shape is the component's API rather than free-form content, so a keyword's rule and a modified characteristic read alike; it measures itself to stay inside the window and follows its trigger when the page scrolls.
- Do not disable controls while a command is in flight. `useCommand` sends them in order, so a player's own taps cannot race each other and nothing has to go dead to prevent it.
- Wait for a run of edits to settle before asking the server about them. `src/client/useSettled.ts` is the one delay: holding a stepper down is one intent, not fifteen requests.
- The loadout pane is three files. `loadoutModel.ts` holds its shapes and every decision that needs no screen — matching a wargear name to what describes it, ordering a card's rows, and what a step on one option does to its siblings. `LoadoutControls.tsx` holds the controls, `ModelCard.tsx` one kind of model, and `Loadout.tsx` only decides which choices belong to a card and which to the unit.
- Keep a route file to its loader, its search parameters and its page shell. Anything with state of its own belongs in `src/client/components`.
- `src/components/ui` contains generated shadcn Base UI components. Add or replace them with the shadcn CLI. Do not edit them by hand.
- `src/styles.css` maps root tokens to Tailwind color utilities through `@theme inline`. Generated components depend on that mapping.
- Barlow Semi Condensed handles the compact display hierarchy; regular Barlow handles paragraph-length rules text. Both OFL-licensed faces are registered in the main stylesheet and preloaded by the root route. Do not add a font without its license or hide it behind client-side loading.

## Verification

Inspect every rendered change in a browser at desktop and phone widths. Use the same component instances at both sizes. Run the relevant Playwright flow after inspection.
