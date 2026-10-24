# Interface: Battles, leagues and other surfaces

## Battles and leagues

Setup is one page in rules order with no pinned bars: each section names its state beside its heading, and Start battle ends the page. Keep secondary choices, reserves, deployment units, and pre-battle units visible; only settled format and twist choices may fold. Render battle controls by side, not seat; allies share a panel and resources. Keep one scoreboard and one phase-control instance across layouts. Live status badges use a filled green background with dark text on battle cards and the home hero.

A mission choice opens by itself once when its moment arrives and stays recordable from its card while the moment lasts. Required prompts open one at a time. Minimize preserves local answers; battle-changing controls stay disabled until parked dialogs are resumed or closed. Undo preserves answers when the same battle moment returns, without leaking them into another hand or prompt. Personal reminders precede shared prompts without becoming shared commands.

Scoring prompts keep guidance, limits, and cap explanations in the scrollable body. Pin only the title, total, and compact actions; verify short phone viewports at enlarged text sizes so mission cards retain room to scroll.

Players, spectators, and replay share the frozen loadout view, which renders the roster editor's `DatasheetPanel`; only seated players receive casualty controls. The army dialog (`ArmyRoster`) keeps the list beside the selected unit's datasheet from 860 pixels; narrower, the datasheet replaces the list and a back button in the header returns to it. The datasheet pane holds only the datasheet; casualty controls stay on the list. Readers without a seat get one in-flow invitation to build an army or start a battle; it never covers the scoreboard or timeline, stays out of the native application, and is not shown to accounts that have played.

League entrants and organizers share one event page, whose next-action card and progress use the same state decision. Sealing requires choosing a list and confirming it by name. Touch controls meet a 44-pixel target. [Leagues](../leagues.md) owns access, sealing, and reveal rules.

## Other surfaces

`Home` owns fetching and `HomeView` renders props. The played, friends' and public game shelves each show at most three games, with links to their full lists. Many players only build lists, so nothing assumes battles. Never leave a query pending in the SSR query cache: a streamed pending query holds the document, and hydration, open until it settles.

`/search?q=…` and global autocomplete share `useGlobalSearch`: a current download answers on every keystroke, otherwise `globalSearchQuery` asks the service once typing settles. Keep the query in the URL and results in the initial HTML; replace the URL rather than adding a history entry per keystroke. Search rows are virtualized: keep every result reachable by scrolling and keyboard, and keep the active option mounted for its accessible name. Before anything is typed, both list public results recently opened from search on this device (`searchHistory.ts`), each removable. `e2e/search.spec.ts` covers the journey. Friends search requires a name rather than listing every account.

Onboarding opens only by player choice and stays nonmodal. Domain-backed progress is derived; only reading tours, skips, and welcome state are stored. Finishing a tour dismisses its prompt only after progress is saved durably.

Docs screenshots are captured by the `e2e/docs-screenshots.*.spec.ts` specs (`DOCS_SCREENSHOTS=1`), which outline the control a doc points at, and are referenced from the docs as `screenshot:<name>`; Vite emits them as hashed assets. Regenerate a doc's screenshots after changing the screens it shows.

Session tokens never reach the browser. Account cleanup protects administrators from deletion.

Profile fields keep unsaved edits across account refreshes. A successful save clears only drafts that still match its submitted values, including a picture replaced or removed while the save was pending. Verify name and picture changes during a delayed save, a second save, and reload in `e2e/account.spec.ts`.

Friend invite QR codes encode the existing one-time link with its expiry and revocation. Keep the readable link if image generation fails.

`e2e/update-pages.spec.ts` covers What's new and Data updates. [Combat simulation](../combat-simulation.md#interface-and-context) owns the matchup UI.

## Link previews

`src/client/linkPreview.ts` owns page tags and canonical URLs; `src/server/previewImage.tsx` owns bounded PNG rendering. Use absolute URLs from the request's public origin. Tags consume the loader's signed-out view; image handlers always ignore the session. An inaccessible image returns `404` with `no-store`.

- Battles expose only the spectator view; unavailable battles use generic metadata.
- Public rosters are indexable at their parameter-free URL. Unlisted rosters preview for link holders but carry `noindex`; frozen snapshots also carry `noindex`. Private rosters remain unavailable.
- Profiles expose only visible records; hidden games cannot enter metadata.
- Reference previews use source-backed names and unconditional prices.

Cache only public results. The image renderer's static fonts and WebAssembly bundling are deliberate; verify compatibility before changing its pinned dependencies. [Agent reference](../agent-reference.md#crawlers) owns crawler discovery.
