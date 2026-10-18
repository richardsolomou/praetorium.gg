# Interface

Praetorium uses a compact interface that stays dark only. [Product design](../product-design.md) owns product scope; [Architecture](architecture.md) owns code placement. Domain behavior belongs to [Catalogue data](catalogue-data.md), [Battles](battles.md), [Leagues](leagues.md), and [Combat simulation](combat-simulation.md). Components and e2e specs encode screen layouts; this guide keeps shared conventions and decisions that are easy to undo by mistake.

## Voice and copy

Write for a player: name the game task, outcome, and next action, and keep implementation terms in technical documentation. Deletion warnings name what will be lost. Label Copy when an action writes to the clipboard and Share only when `useNativeShare` reports the system share sheet. Marketing leads with player benefits, keeps licensing and attribution, and avoids unsupported competitor comparisons. Dates spell out the month; battle cards and Home activity show scores once, without a result sentence.

Keep contextual help brief and learning guidance in player guides; illustrative positions in guides do not define terrain or deployment rules. The standalone simulator offers an optional editable example in its page header, without moving the unit controls during selection or loading. Do not add tracker-help panels or finished-game score breakdowns. Practice uses the ordinary New battle dialog; do not add a separate practice action. Show a roster limit count once, beside a short state label.

## Application navigation

`src/client/features/shell` owns shared web and native navigation; `src/styles.css` owns breakpoints and safe-area dimensions, so do not duplicate them in components. Only builder screens are immersive. The desktop header folds through rem container queries because media queries ignore page text size. `src/client/textSize.ts` sets `data-text-size` from an inline head script before first paint, and styles map it to the root font size so every rem scales together.

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
- Build dialogs from `src/client/components/Dialog.tsx` with its `sm`, `md`, or `lg` size, not width or height classes. Put everything between header and footer in `DialogBody`, the only region that scrolls, so title, Close, and Minimize stay pinned. Battle prompts are non-modal on phones and lock document scrolling through `src/styles.css`.
- Ask before a consequential action with `ConfirmDialog`, and announce a failure with `Problem`, both in `src/client/components`.
- Rule help, tooltips, and charts must work with hover, keyboard focus, and touch. A disabled button shows no tooltip, so state the reason beside it.
- `src/client/battleStage.ts`, `src/core/tableShape.ts`, `src/client/sides.ts`, and `src/client/seats.ts` own shared labels and grouping; do not derive a second answer in a screen.
- Use `src/client/useSettled.ts` for settled edits. Keep prior results and final geometry stable while pending; show failures with an actionable retry.
- Cards have one main click target; nested controls own their clicks. Section headings do not toggle shelves; the adjacent chevron does.
- Filters and tabs that represent destinations live in the URL.

## Rosters

Call the catalogue selector “Rules version”: versions may contain codex, points, or other rules updates. `FactionMark` and `FactionLabel` own faction and version presentation; do not add a version text chip beside the faction name or repeat preview status in a warning sentence. Carry version metadata through summary projections; frozen armies retain their recorded status. Name a custom points budget beside the battle size with `battleSizeLabel`; the budget is the points ceiling and the battle size still sets the other limits. Setup offers a custom budget as a battle size choice that names whose limits apply, not as a separate field.

The builder has one picker and one loadout instance, moved between desktop columns and compact panes by `src/client/features/rosters/builder/Pane.tsx`. Reserve the desktop workspace before hydration. Edit squad size only on the roster card; `modelCountChoices` in `src/core/unitSize.ts` decides listed counts for the builder and simulator.

`loadoutModel.ts` and its components own loadouts. Display each option and equipped item once, keep weapon profiles visible before selection, and do not repeat choice-controlled profiles in an equipped section. A single weapon must not match a similarly named dual weapon. Offer a press only when it folds against the saved counts (`pressedCounts`), and state why a disabled add is blocked (`increaseBlocked`).

One roster card serves libraries, choosers, editable and read-only lists, and frozen snapshots. A pending price is a loading state, not an empty roster. Frozen snapshots retain recorded cards and totals without today's legality or data-update warnings. Readers who cannot edit get no mutation controls but keep Test targets and Simulate combat, which never save. Locked rosters read as they do to other readers. Library legality and changed-list counts use [Catalogue data](catalogue-data.md#data-updates).

Roster menus put setup, conversion, and copies first, then sharing, export, and print, then deletion; library and context menus follow the same order. Deleting an active roster offers Archive as the primary action.

A copy records `copiedFromRosterId` once and names its source only while the reader may still open it, resolved through `rosterAccess` on every read. Sharing saves first only when edits are unsaved and reports its result beneath the header, not in the closed menu.

Rosters has Mine, Friends and Public tabs in the URL (`?view=`), like Battles. Mine also lists rosters lent to the player, on the same card with the lender beneath. Friends lists friends' public rosters; Public lists other players' public rosters and is the only view a visitor reaches, at `/rosters?view=public`. Both draw the library's roster summary with the owner, a Duplicate action, a Filter dialog for faction, detachment and rules version, and the library's sort menu with the order kept in the URL; `discover_rosters` pages in that order through `compareRosters` in `src/core/rosterSort.ts`. `/rosters/discover` redirects there with its filters. Played (`?view=played`, reachable by visitors through the URL) lists armies from finished public battles with the same filter dialog and no sort: `discoverPlayedArmies` folds one page of the public battle feed through `playedArmies` (`src/core/playedArmies.ts`), so a page can come back short. Each card shows the rules version and status recorded when it was fielded and today's points and legality for that version, and how the battle went for its side from `battleOutcome` and `sideScore` in `src/core/standings.ts`, drawn as battle cards draw it: the outcome chip from `battleOutcomeStage` in `src/client/battleStage.ts`, the side-coloured score, Conceded when it ended that way, the opposing factions' marks, and Open battle. Attribution and Duplicate match the Public tab. The card opens the frozen army in its battle, and Duplicate saves `copiedArmy` (`src/core/rosterCopies.ts`) in that rules version, where the builder reports what it no longer allows and offers conversion.

A visitor draft uses the same builder; a cookie hints its layout for SSR without storing the list. If storage rejects the latest draft, keep the player in the builder rather than navigating into authentication and losing it.

`RosterPrintPack.tsx` prints from current pricing and the same version's references. Never print a partial pack after a failed read. Battle and league snapshots keep their summary print so current reference data is never presented as frozen rules. Printed rosters unfold scrolling ancestors; inspect a long list under print media, including its last card.

Specs: `e2e/roster-discovery.spec.ts`, `e2e/played-armies.spec.ts`, `e2e/unit-loadouts.spec.ts`, `e2e/roster-setup-review.spec.ts`, `e2e/guest-roster.spec.ts`, `e2e/parity.spec.ts` (sharing), and `e2e/roster-print.spec.ts` (paginated PDF and native delivery).

## Battles and leagues

Setup is one page in rules order with no pinned bars: each section names its state beside its heading, and Start battle ends the page. Keep secondary choices, reserves, deployment units, and pre-battle units visible; only settled format and twist choices may fold. Render battle controls by side, not seat; allies share a panel and resources. Keep one scoreboard and one phase-control instance across layouts. Live status badges use a filled green background with dark text on battle cards and the home hero.

A mission choice opens by itself once when its moment arrives and stays recordable from its card while the moment lasts. Required prompts open one at a time. Minimize preserves local answers; battle-changing controls stay disabled until parked dialogs are resumed or closed. Undo preserves answers when the same battle moment returns, without leaking them into another hand or prompt. Personal reminders precede shared prompts without becoming shared commands.

Scoring prompts keep guidance, limits, and cap explanations in the scrollable body. Pin only the title, total, and compact actions; verify short phone viewports at enlarged text sizes so mission cards retain room to scroll.

Players, spectators, and replay share the frozen loadout view, which renders the roster editor's `DatasheetPanel`; only seated players receive casualty controls. The army dialog (`ArmyRoster`) keeps the list beside the selected unit's datasheet from 860 pixels; narrower, the datasheet replaces the list and a back button in the header returns to it. The datasheet pane holds only the datasheet; casualty controls stay on the list. Readers without a seat get one in-flow invitation to build an army or start a battle; it never covers the scoreboard or timeline, stays out of the native application, and is not shown to accounts that have played.

League entrants and organizers share one event page, whose next-action card and progress use the same state decision. Sealing requires choosing a list and confirming it by name. Touch controls meet a 44-pixel target. [Leagues](leagues.md) owns access, sealing, and reveal rules.

## Other surfaces

`Home` owns fetching and `HomeView` renders props. The played, friends' and public game shelves each show at most three games, with links to their full lists. Many players only build lists, so nothing assumes battles. The home loader waits for the player's record only within `RECORD_BUDGET_MS`. Never leave a query pending in the SSR query cache: a streamed pending query holds the document, and hydration, open until it settles.

`/search?q=…` and global autocomplete share `useGlobalSearch`: a current download answers on every keystroke, otherwise `globalSearchQuery` asks the service once typing settles. Keep the query in the URL and results in the initial HTML; replace the URL rather than adding a history entry per keystroke. Search rows are virtualized: keep every result reachable by scrolling and keyboard, and keep the active option mounted for its accessible name. Before anything is typed, both list the last eight public results opened from search on this device (`searchHistory.ts`), each removable; the player's own rosters and battles are never remembered. `e2e/search.spec.ts` covers the journey. Friends search requires a name rather than listing every account.

Onboarding opens only by player choice and stays nonmodal. Domain-backed progress is derived; only reading tours, skips, and welcome state are stored. Finishing a tour dismisses its prompt only after progress is saved durably.

Import guide illustrations with `?no-inline` so Vite emits hashed assets that deployment publishes before changing replicas. Public guide screenshots carry a content hash in their filename; refresh it when replacing an image.

Session tokens never reach the browser. Administrator status is not permission to view private battles; battle access uses the ordinary audience check. Account cleanup protects administrators from deletion.

Roster exchange QR codes are generated only within `ROSTER_EXCHANGE_QR_MAX_LENGTH`; friend invite QR codes encode the existing one-time link with its expiry and revocation. Keep the readable link if image generation fails.

`e2e/update-pages.spec.ts` covers What's new and Data updates. [Combat simulation](combat-simulation.md#interface-and-context) owns the matchup UI.

## Link previews

`src/client/linkPreview.ts` owns page tags and canonical URLs; `src/server/previewImage.tsx` owns bounded PNG rendering. Use absolute URLs from the request's public origin. Tags consume the loader's signed-out view; image handlers always ignore the session. An inaccessible image returns `404` with `no-store`.

- Battles expose only the spectator view; unavailable battles use generic metadata.
- Public rosters are indexable at their parameter-free URL. Unlisted rosters preview for link holders but carry `noindex`; frozen snapshots also carry `noindex`. Private rosters remain unavailable.
- Profiles expose only visible records; hidden games cannot enter metadata.
- Reference previews use source-backed names and unconditional prices.

Cache only public results. The image renderer's static fonts and WebAssembly bundling are deliberate; verify compatibility before changing its pinned dependencies. [Agent reference](agent-reference.md#crawlers) owns crawler discovery.

## Saved application data

[`src/client/offline`](../../src/client/offline) owns reference downloads, account snapshots, and refreshes; [`src/contracts/appSnapshot.ts`](../../src/contracts/appSnapshot.ts) owns saved-query eligibility and limits; [Mobile](mobile.md#saved-application-data) owns native storage. `SyncStatus` shows saved, offline, and review states with retry, export, and explicit discard.

Restoration and refresh:

- Hosted pages preserve server-rendered data through hydration; injected native reference data must not seed the hosted query client.
- Restore cached public references only into missing queries after the initial screen settles; never overwrite the saved snapshot before restoration. A failed refresh retains the last successful response, and a refreshed response never replaces a newer one.
- Refresh saved account queries only when focus or connectivity returns or the account changes, never on a timer: each refresh refetches the whole snapshot, and screens in view already poll or subscribe.
- A download whose revision the service still publishes is current (`currentReference()` in [`runtime.ts`](../../src/client/offline/runtime.ts)): reference reads, search, datasheet filters and datasheet changes answer from it without a request until a manifest check finds another revision. Any other download is only a fallback behind the service.
- Restore the saved download and check the manifest right after the initial route paints; defer account preparation and new downloads until it has idled for ten seconds. Publish only complete saved applications, retaining the previous version on failure. Manifest checks bypass caches.
- A new download applies its reference before fetching construction data, so pages and search use it first; the held construction data stays in use until the new one is saved. Saved downloads pack construction data apart from the reference and keep each query serialized. A hosted page restores one in a worker (`referenceRestore.ts`), parses each saved query only when it is read, and prepares search in idle slices. The construction worker loads the page's packed construction data itself, and a refresh that keeps the same construction asset saves the packed copy again without decoding it; the page decodes construction data only for synchronous battle and setup work, or when the worker cannot answer offline. Keep that work off the main thread.
- Development websites do not install the service worker. Authentication, administration, and API documents keep their hosted path.

Account boundaries:

- Exclude authentication secrets, administration, and impersonated accounts from snapshots. Saved responses never authenticate requests.
- Clear screen snapshots on sign-out or account change, including in other tabs. `idb-keyval`'s atomic `update` keeps account-generation checks and writes in one transaction so a stale tab cannot restore signed-out data.
- Cross-tab account notices refresh the authoritative session, which clears private data only when identity changes. Do not cancel queries or set a temporary signed-out identity for the notice: that interrupts navigation and rebroadcasts account changes between tabs.
- Unsynced work stays partitioned by owner; sign-out directs the player to sync, export, or discard it. A failed disk cleanup is reported without interrupting sign-out or navigation.

[Architecture](architecture.md#offline-work) owns durable local work and sync.

Run `just e2e offline-work.spec.ts offline.spec.ts app-cache.spec.ts` after changes to this flow. Cold-loading tests must start in a browser context without saved IndexedDB or service workers. Read server-rendered HTML through the request context; a controlled navigation returns the saved application instead.

## Verification

Inspect affected surfaces at desktop and phone widths. Test the same components before and after hydration, on hard requests and client navigation, and with delayed requests. Check horizontal overflow, final-control scroll space, keyboard and touch access, and loading geometry. Rows pairing a name with controls must survive doubled text at phone width: give the name a minimum width and let the controls wrap (`e2e/accessibility.spec.ts`). Browser journeys must wait for page initialization before filling hosted authentication forms; server-rendered fields can appear before React owns their values.

Interactive rules badges must not change a selector option's accessible name. Assert selected values separately from decorative trigger text, and exercise both grouped and virtualized selectors when changing their contents.

For battles, check live and finished scorecards, spectator and replay access, and several replay frames. Use the shared E2E phase helper to avoid reminder races. Exercise scoring, draw, and discard through minimize, Undo, and return; test the domain guard separately from the local UI lock.
