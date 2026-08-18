# Interface

Praetorium uses a compact, dark visual system. See [the product design guide](../product-design.md) for its scope and layout.

## Layout

- Use compact, uppercase headings, section counts, points chips, and red or blue player tints consistently.
- Keep player tints on scores and controls. The tint identifies ownership across the table.
- Edit squad size on the roster card. Do not add a second squad-size control to the loadout pane.
- Render each picker or loadout pane once. `builder/Pane.tsx` moves the same instance between a desktop sidebar and a mobile sheet. Two instances create duplicate form controls and accessibility labels.
- Show allied picker shelves with their short faction name and keep them collapsed until a player needs them.
- Use `data-unit` to find unit cards in tests. CSS changes the displayed case, so visible-text selectors do not match the source text reliably.

## Components and styles

- `src/components/ui` contains generated shadcn Base UI components. Add or replace them with the shadcn CLI. Do not edit them by hand.
- `src/styles.css` maps root tokens to Tailwind color utilities through `@theme inline`. Generated components depend on that mapping.
- Barlow Semi Condensed handles the compact display hierarchy; regular Barlow handles paragraph-length rules text. Both OFL-licensed faces are registered in the main stylesheet and preloaded by the root route. Do not add a font without its license or hide it behind client-side loading.

## Verification

Inspect every rendered change in a browser at desktop and phone widths. Use the same component instances at both sizes. Run the relevant Playwright flow after inspection.
