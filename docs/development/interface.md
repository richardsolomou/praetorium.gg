# Interface

Praetorium uses a compact, dark interface. See [Product design](../product-design.md) for its scope and layout.

## Layout

- Use compact, uppercase headings, section counts, points chips, and red or blue player tints consistently.
- Keep player tints on scores and controls. The tint identifies ownership across the table.
- Use theme red for attacker deployment zones and theme green for defender zones. Use primary green for a neutral zone.
- Edit squad size on the roster card. Do not add a second squad-size control to the loadout pane.
- Render each picker or loadout pane once. `src/client/components/builder/Pane.tsx` moves the same instance between a desktop sidebar and a mobile sheet. Two instances create duplicate form controls and accessibility labels.
- Reserve the desktop picker's grid column in the server-rendered roster workspace. Hydration may replace its mobile drawer with the desktop sidebar, but the roster and loadout panes must not move when it does.
- Split unit lists into collapsible primary-category shelves and omit empty shelves. Use the same shelf order on rosters, in the picker and on faction datasheet pages.
- Show allied picker shelves with their short faction name and keep them collapsed until a player needs them.
- A unit card is one target. Its details open the unit. The menu, detach, and join controls handle their own clicks.
- Use `data-unit` to find unit cards in tests, `data-roster` to find library rows, and `data-person` to find a player's row. CSS changes the displayed case, so visible-text selectors do not match the source text reliably — and a word like "Unlisted" appears both on a row and in the menu item that changes it, so an unscoped match can pass before the change lands.
- Keep battle setup in six visible sections: Format, Armies, Battlefield, Attacker, Pre-battle, and First turn. The active section is folded from the battle log so every seated device moves together. Show every attached roster, and let anyone at the table set reserves and the battle-ready bonus for any army while the table is being set. A roster stays the choice of the player who owns it.
- Choose saved rosters in a dialog ordered like the roster library. Keep battlefield selection stable while its command saves, and open each battlefield in a full-size dialog without changing the selection.
- In the live tracker, show only stratagems valid for the current turn and phase. The CP badge spends the printed cost; the overflow menu handles modified costs. A stratagem opens the same text the detachment page prints, from `detachmentRules`.
- Keep missions and stratagems side by side in a side panel. Both are read constantly, so neither is worth scrolling for, and neither carries a per-round breakdown.
- Ask for a card's points only as the phase or turn its own data names comes to an end. `src/client/scoring.ts` decides which cards are due and which draws are still owed; the controls exist only in that prompt, never in the panel.
- Word the prompt as the card does: one row per condition in the mission pack's own words, with what meeting it pays, and a row for scoring nothing. The card's full text belongs behind its name, not above every row. The payout itself is the control, so the number pressed is the number scored. Rows the card puts in one group are tiers, so picking one clears the others; anything ungrouped a card can pay at the same time. A counted payout is a count, bounded by the ceiling the card sets.
- Open one prompt at a time. What the opponent's turn owed is settled before the hand for this one is dealt, or the two stack and the second covers the first.
- A card that pays on the opponent's turn is shown as a shared scoring prompt as the turn comes back. Every seated player may answer it once, and the prompt names the affected side prominently. Undealt cards and hidden missions remain owner-only; helpers see no private choice and cannot dismiss it on the owner's behalf.
- Deal a tactical hand rather than offering the deck. The prompt opens at the top of the player's turn, draws at random, and offers a card back only where `whenDrawn` says the rules allow it.
- Record the battle-ready bonus during setup and add it to the score only once the battle is finished.
- Link a player's name and picture to `/users/$userId`, and their list to `/rosters/$id` with the battle token, which is what entitles a seated opponent to read it. Link each catalogue-backed army's faction mark, faction name, and detachments to their reference pages.
- Narrow and order the roster library from one Filter button and one Sort button at every width. Four side-by-side comboboxes do not fit a phone, and a second set of them for narrow screens would be a second copy of every control and label.
- `/rosters/$id` is the one roster surface. Its owner gets the builder controls; every other entitled reader gets the same roster cards and loadout details without mutation controls.
- Open a fielded army over the battle, never away from it. The side panel names what is left of the army and opens the same roster cards `/rosters/$id` draws, built from the log rather than the saved list. Each card carries one extra row: where the unit is, and the controls that take a model, a wound, or the whole unit off. A lost unit leaves its shelf for a collapsed `Lost` shelf that can give it back. Either seated player may record either army's losses.
- Count a unit by what it actually has. A squad shows models, a multi-wound model shows wounds, and a squad of multi-wound models shows both; a unit whose datasheet states no single wounds characteristic shows models alone. Neither counter decides whether a wound takes a model with it — that is `apply`'s, and the control sends one command and redraws from the answer.
- Lay both setup and the tracker out by side, never by seat. `src/client/sides.ts` folds `BattleView.players` into sides; read command points, victory points, mission cards and stratagems from there. A 2v1 ally is a second army inside one side panel, not a third column.
- Present manual battle creation as three table shapes: Duel, Solo vs pair, and Doubles. Solo vs pair asks whether the opener is solo or on the pair, then shows only that role's seats and a live side preview. Do not present 1v2 and 2v1 as separate formats.
- Draw one scoreboard at every width. It carries both sides' scores, the round and phase, and the battle menu that holds finishing, conceding and deleting. Keep destructive actions in that menu and behind a confirmation.
- Keep both sides' public controls available to every seated player, including the phase control, command points, scoring and stratagems. A player may help the active side without changing who the log says performed the action. Keep undealt tactical cards and hidden missions private, and disable a helper's phase control with an opaque prompt while the active side has opening mission work or a hidden end-of-turn choice.
- Keep the phase control reachable at every width. One instance moves by CSS between the centre column and a bottom bar on narrow screens, as `builder/Pane.tsx` does for the roster panes, and always advances the active side.
- Open long card lists in a dialog rather than laying dozens of buttons into a panel, and close the dialog on the pick.
- Keep the global search panel height stable while typing. Settle the query before the server request, and preserve the prior results while it loads.
- Give top-level home, account, library, faction, and mission pages a clear introduction, useful summaries, and next actions. Empty states must explain how to add the first item.
- Keep Friends in the signed-in account menu rather than global navigation. A confirmed friend may open the other player's profile before they share a battle.
- Keep leagues about registration and roster reveal. Show each league's bounded event history, and start every event with no entrants. Before reveal, show only whether an accepted entrant submitted; do not load or expose the snapshot to anyone, including the organizer. After reveal, load one snapshot only when its roster viewer opens.
- In a Doubles event, show fixed two-player teams and let the organizer search accepted entrants when pairing them. Starting a battle asks for an opposing team; the server derives the other three seats.
- Put organizer league actions in one overflow menu on league cards and detail pages. The whole card opens the same menu on right-click, destructive deletion requires confirmation, and the edit dialog reuses the creation controls.

## Components and styles

- Use muted green for primary actions, rule references, success, and selected state; amber for attention; and muted steel blue for navigation and inspectable information such as points. Player-side tints remain separate ownership signals.
- Use `HoverTooltip` for rule help. It accepts a title, body, and source note. The generated Base UI tooltip controls position, focus, collision handling, and scrolling.
- Do not disable controls while a command is in flight. `useCommand` sends them in order, so a player's own taps cannot race each other and nothing has to go dead to prevent it.
- Wait for a run of edits to settle before asking the server about them. `src/client/useSettled.ts` is the one delay: holding a stepper down is one intent, not fifteen requests.
- The loadout pane is three files. `loadoutModel.ts` holds its shapes and every decision that needs no screen — matching a wargear name to what describes it, ordering a card's rows, and what a step on one option does to its siblings. `LoadoutControls.tsx` holds the controls, `ModelCard.tsx` one kind of model, and `Loadout.tsx` only decides which choices belong to a card and which to the unit.
- Keep a route file to its loader, its search parameters and its page shell. Anything with state of its own belongs in `src/client/components`.
- `src/components/ui` contains generated shadcn Base UI components. Add or replace them with the shadcn CLI. Do not edit them by hand.
- `src/styles.css` maps root tokens to Tailwind color utilities through `@theme inline`. Generated components depend on that mapping.
- Barlow Semi Condensed handles the compact display hierarchy; regular Barlow handles paragraph-length rules text. Both OFL-licensed faces are registered in the main stylesheet and preloaded by the root route. Do not add a font without its license or hide it behind client-side loading.

## Verification

Inspect every rendered change in a browser at desktop and phone widths. Use the same component instances at both sizes. Run the relevant Playwright flow after inspection.
