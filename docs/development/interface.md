# Interface

Praetorium uses a compact interface that stays dark only. [Product design](../product-design.md) owns product scope; [Architecture](architecture.md) owns code placement. Domain behavior belongs to [Catalogue data](catalogue-data.md), [Battles](battles.md), [Leagues](leagues.md), and [Combat simulation](combat-simulation.md). Components and e2e specs encode screen layouts; this guide keeps shared conventions and decisions that are easy to undo by mistake.

## Area guides

Read the area guide for the task; this page keeps what applies to all of them.

| Working on                                            | Read                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| Roster library, discovery, builder screens            | [Rosters](interface/rosters.md)                              |
| Battle and league screens, other pages, link previews | [Battles, leagues and other surfaces](interface/surfaces.md) |
| Offline downloads on the device, saved work, sync     | [Saved application data](interface/saved-data.md)            |

## Voice and copy

Write for a player: name the game task, outcome, and next action, and keep implementation terms in technical documentation. Deletion warnings name what will be lost. Label Copy when an action writes to the clipboard and Share only when `useNativeShare` reports the system share sheet. Marketing leads with player benefits, keeps licensing and attribution, and avoids unsupported competitor comparisons. Dates spell out the month; battle cards and Home activity show scores once, without a result sentence.

Keep contextual help brief and longer explanations in the player docs (`src/client/features/docs/content`), which describe how Praetorium works and where its checks stop rather than general play advice. Do not add tracker-help panels or finished-game score breakdowns. Practice and guest opponents use the ordinary New battle dialog; do not add a separate action for either. A guest seat names itself with a Guest label and never links to a profile. The host shares a guest's seat from the armies step and beside Battle options (`GuestInvite`, with a QR code and the link); the guest builds their list as any visitor does and brings it from the ordinary setup. Offer signing up to a guest only when their game has finished (`GuestKeepGame`), never during play. Show a roster limit count once, beside a short state label.

## Application navigation

`src/client/features/shell` owns shared web and native navigation; `src/styles.css` owns breakpoints and safe-area dimensions, so do not duplicate them in components. Only builder screens are immersive. The desktop header adapts through rem container queries because media queries ignore page text size. `src/client/textSize.ts` sets `data-text-size` from an inline head script before first paint, and styles map it to the root font size so every rem scales together.

The desktop header lists Rosters, Battles, Simulator, Leagues, and Leaderboard, then the reference sections (Factions, Missions, Force dispositions, Rules), as tabs rendered once and placed by grid areas in `SiteHeader`. They share one bar with the logo, search and account while it fits; narrower, they move to a second row below the search, then drop their icons, and only then fold the reference sections into a Reference menu. The whole header stays pinned. `publishHeaderHeight` writes its measured height to `--app-header`, which sticky bars (`top-(--app-header)`), anchor targets (`scroll-mt-header`) and the builder's height read; never hard-code the header's height. Verify a header change across desktop widths at every text size, including 200%, for overflow and the layout each width gets.

Home and Battles are separate tabs so an open battle never highlights Home. The bar holds at most five tabs: a sixth truncates labels at the larger text sizes. Everything else is listed in More, and the footer leaves out what More lists while the tabs show.

`nativeTabs.ts` preserves each section's URL, route state, and scroll position, and forgets a URL that renders not-found. Scroll-restoration tests must first confirm an interactive control and then use player input such as a wheel gesture; `window.scrollTo` does not cancel the restoration retries and races with them.

Compact roster panes use browser history and stop above the application tabs; closing a datasheet returns to whatever opened it with its Close button usable. Verify the full picker → datasheet → picker → roster sequence. Required battle prompts leave application navigation reachable. [Mobile](mobile.md#shell-boundaries) owns native Back behavior.

Send feedback opens one dialog over the current page. Do not add another entry point to a surface that already has one. [Telemetry](telemetry.md#feedback) owns what it sends.

## Components and styles

- `src/styles.css` owns palette, typography, spacing tokens, and generated-component treatment; use its `eyebrow`, `rubric`, `chip`, `figure`, and `readout` utilities. Green signals actions and selection, amber attention, blue navigation; side red and blue are separate ownership signals. Pair color with a short label.
- `PageHeader` and `PageContent` in `src/client/components/Page.tsx` provide page introduction, width, and gutters.
- Treat generated `src/components/ui` as vendored: style it through `data-slot` selectors and wrappers, never by hand-patching.
- Keep selector placeholders and labels inside HTML elements when changing between text and components. Browser translation can replace bare text nodes; `SearchableSelect` and `e2e/translation.spec.ts` own this boundary.
- Style navigation as a button by giving the link `buttonClass` from `src/client/components/buttonClass.ts`. A `Button` that renders a link with `nativeButton={false}` gives it `role="button"`, so assistive technology announces a button.
- Build dialogs from `src/client/components/Dialog.tsx` with its `sm`, `md`, or `lg` size, not width or height classes. Compact screens show a dialog full screen; give a short one, such as a share code or a sign-up prompt, `fit` so it stays sized to its content there, as a confirmation does. Put everything between header and footer in `DialogBody`, the only region that scrolls, so title, Close, and Minimize stay pinned. Battle prompts are non-modal on phones and lock document scrolling through `src/styles.css`.
- Ask before a consequential action with `ConfirmDialog`, and announce a failure with `Problem`, both in `src/client/components`.
- Rule help, tooltips, and charts must work with hover, keyboard focus, and touch. A disabled button shows no tooltip, so state the reason beside it.
- `src/client/battleStage.ts`, `src/core/tableShape.ts`, `src/client/sides.ts`, and `src/client/seats.ts` own shared labels and grouping; do not derive a second answer in a screen.
- Use `src/client/useSettled.ts` for settled edits. Keep prior results and final geometry stable while pending; show failures with an actionable retry.
- Cards have one main click target; nested controls own their clicks. Section headings do not toggle shelves; the adjacent chevron does.
- Filters and tabs that represent destinations live in the URL.

## Route recovery

A failed route-module import can come from delivery or connectivity as well as an older build. Its Reload action requests the same route with a fresh document cache key, preserving search and fragment; remove that key only after every route match succeeds. Keep saved account work intact. Recovery reloads use no custom asset URLs; [Telemetry](telemetry.md) owns the recovery events. `e2e/reliability.spec.ts` verifies an unavailable module through an ordinary failed reload and successful recovery, plus a complete anonymous realtime reconnect.

## Verification

Inspect affected surfaces at desktop and phone widths. Test the same components before and after hydration, on hard requests and client navigation, and with delayed requests. Check horizontal overflow, final-control scroll space, keyboard and touch access, and loading geometry. Rows pairing a name with controls must survive doubled text at phone width: give the name a minimum width and let the controls wrap (`e2e/accessibility.spec.ts`). Page tab rows from `src/client/components/PageTabs.tsx` wrap onto a second line rather than widen the page.

Interactive rules badges must not change a selector option's accessible name. Assert selected values separately from decorative trigger text, and exercise both grouped and virtualized selectors when changing their contents.

For battles, check live and finished scorecards, spectator and replay access, and several replay frames. Use the shared E2E phase helper to avoid reminder races. Exercise scoring, draw, and discard through minimize, Undo, and return; test the domain guard separately from the local UI lock.
