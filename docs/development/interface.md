# Interface

Praetorium uses a compact, dark interface. [Product design](../product-design.md) owns product scope; [Architecture](architecture.md) owns code placement. Domain behavior belongs to [Catalogue data](catalogue-data.md), [Battles](battles.md), [Leagues](leagues.md), and [Combat simulation](combat-simulation.md).

## Voice and copy

Write for a player building an army or playing Warhammer 40,000. Name the game task, outcome, and next action. Keep implementation terms in technical documentation. Deletion warnings name what will be lost. Marketing leads with player benefits; retain licensing, attribution, and operational detail where readers need them. Avoid unsupported competitor comparisons.

Keep contextual help brief. Player guides combine practical preparation, army roles and scoring advice with app walkthroughs. Give each guide a visual overview and compact reading sections rather than an unbroken essay. Use labelled decision diagrams or cropped app screenshots; illustrative positions do not define terrain or deployment rules. Keep learning guidance in player guides; do not add standalone simulator examples, tracker-help panels or finished-game score breakdowns. Practice uses the ordinary New battle dialog; do not add a separate practice action. Show a roster limit count once, beside a short state label; retain explanations for unavailable units.

## Application navigation

`src/client/features/shell` owns the shared web and native navigation. Phones use a Home/search/account utility bar and bottom application tabs; immersive roster screens omit the utility bar. Native wide layouts use a rail, while the website uses its desktop header. Read `src/styles.css` for the breakpoints and safe-area dimensions rather than duplicating them in components.

`nativeTabs.ts` preserves each section's URL, route state, and scroll position for the browser session. Tapping the current section returns to its top. Home selects no tab. More holds secondary destinations without repeating the dedicated tabs. Scroll-restoration browser tests must first confirm an interactive control and then use player input such as a wheel gesture; `window.scrollTo` does not cancel the restoration retries and can race with them.

Compact roster panes use browser history and stop above the application tabs. Closing a datasheet returns to the picker or roster that opened it; returning to the picker must leave its Close button usable. Verify the full picker → datasheet → picker → roster sequence. Required battle prompts leave application navigation reachable. At intermediate website widths, compact panes remain modal dialogs. [Mobile](mobile.md#shell-boundaries) owns native Back behavior.

Release notices use one compact sentence and a manual Refresh action, centred at the bottom above any application tabs. Match a supplied interface reference before adding copy or secondary actions.

## Components and styles

- `src/styles.css` owns palette, typography, spacing tokens, and generated-component treatment. Use its `eyebrow`, `rubric`, `chip`, `figure`, and `readout` utilities instead of restating them. Green signals actions/selection, amber attention, blue navigation; side red and blue remain separate ownership signals.
- `PageHeader` and `PageContent` in `src/client/components/Page.tsx` provide the shared page introduction, width, and gutters. Builders, trackers, setup, and sign-in use their specialized shells.
- Treat generated `src/components/ui` as vendored. Apply the panel treatment through stylesheet `data-slot` selectors and wrappers, not hand-patched generated components.
- `HoverTooltip` and the shared rule renderer preserve source formatting. Rule help and charts must work with hover, keyboard focus, and touch.
- `src/client/battleStage.ts`, `src/core/tableShape.ts`, `src/client/sides.ts`, and `src/client/seats.ts` own shared labels and grouping. Reuse them rather than deriving a second answer in a screen.
- Use `src/client/useSettled.ts` for settled edits. Keep prior results and final geometry stable while requests are pending; show failures with an actionable retry.
- Cards have one main click target; nested menus and controls own their clicks. Section headings do not toggle shelves: the adjacent chevron does. Use the shared choice control for small exclusive option sets.

## Rosters

The builder has one picker and one loadout instance, moved by `src/client/features/rosters/builder/Pane.tsx` between desktop columns and compact panes. Reserve the desktop workspace before hydration. Edit squad size on the roster card, not in a second control. Its stepper's count also picks any listed size directly; `modelCountChoices` in `src/core/unitSize.ts` decides which counts are listed, and the simulator's model controls reuse it.

Loadouts group equipment by model and weapon choice. Keep required/default equipment readable after replacement, paired weapons under one counter, and alternate profiles under their weapon. Selection styling must not shift content. Display each option and equipped item once. `loadoutModel.ts`, `LoadoutControls.tsx`, `ModelCard.tsx`, and `Loadout.tsx` own this flow.

Use the same roster cards for libraries, choosers, editable lists, read-only lists, and frozen battle/league snapshots. A pending price is a loading state, not an empty roster. Frozen snapshots retain their recorded cards and totals without today's legality or data-update warnings. Owners' View mode may retain the picker; other readers receive no mutation controls.

Library variants remain grouped with their base and show concise differences from the saved base. Filters and tabs that represent destinations live in the URL. Variant navigation stays disabled while edits are unsaved. The library's legality and changed-list counts use the domain decisions in [Catalogue data](catalogue-data.md#data-updates).

Reference datasheet and detachment pages enter the builder through `ReferenceRosterActions.tsx`. The rosters offered for a datasheet are those whose book's picker lists it; the builder adds the requested unit under that roster's own limits and reports a refusal in its header. A visitor draft uses the same builder. A cookie hints its layout for SSR without storing the list. Another tab's edit or claim replaces the open copy. Storage failure keeps the open builder usable and warns about reload loss. Claiming the draft after sign-in follows the saved flow. Save keeps the roster context on the authentication page and allows returning to the draft. If storage rejects the latest draft, keep the player in the builder rather than navigating into authentication and losing it.

Name the next missing setup choice beside the disabled roster action. Offer a first-unit action in an empty editable list only when the picker is concealed; the permanent desktop sidebar already supplies that action. Paired roster-footer actions use the same height, with larger touch targets on phones. Printed rosters must unfold scrolling ancestors, retain points and legality/draft warnings, and hide editing controls. Inspect a long list under print media, including its last card.

## Battles and leagues

Setup is one page in rules order under `StepRail`, a jump index highlighting the viewed section in blue and marking the next decision in amber. Dim sections while their prerequisites are missing. Keep Fixed/Tactical secondary choices, reserves controls, deployment units, and pre-battle units visible without a Change or Show action. King of the Colosseum shows only Tactical. Only settled format and twist choices may fold to one line with Change. Folding and scroll position are local to the device. The fixed bar lists what is left, shows refusals, and holds Start battle. Render battle controls by side, not seat. Allies share a panel and resources. Keep one scoreboard and one phase-control instance across layouts. Missions and stratagems remain visible together, stacking when the panel is narrow.

Required prompts open one at a time. Minimize preserves local answers and exposes a persistent return control; battle-changing controls remain in place but disabled until parked dialogs are resumed or closed. Undo must preserve answers when the same battle moment returns, without leaking them into another hand or prompt. Personal reminders precede shared prompts without becoming shared commands.

Until a player has a friend, the New battle dialog offers one line under the seats to share their one-time friend invite or show its QR code, so they can invite an opponent without leaving battle creation. Readers without a seat get one in-flow invitation to build an army or start a battle, chosen from onboarding progress; it never covers the scoreboard or timeline, leads finished battles, stays out of the native application, and stays dismissed in that browser. Accounts that have played a battle do not see it.

The army window uses independently expandable loadouts in its scroll flow, with pinned unit cards and return-to-card collapse behavior. Players, spectators, and replay use the same frozen loadout view; only seated players receive casualty controls. Army and simulator dialogs fill the compact screen above the application tabs. Replay preserves the report's reading position while scrubbing.

League entrants and organizers share one event page. Its next-action card and progress use the same state decision. Organizer controls sit beside the entries or settings they affect; reveal uses the domain checklist. Sealing requires choosing a list and confirming it by name. Touch controls meet a 44-pixel target. [Leagues](leagues.md) owns access, sealing, and reveal rules.

## Other surfaces

Import new guide illustrations from client source with `?no-inline` so Vite emits hashed assets that deployment publishes before changing replicas.

Home prioritizes the player's active game and actionable items, with public activity for visitors. Empty states explain how to start. `Home` owns fetching and `HomeView` renders props; reserve shelf geometry in SSR and bound roster assessment to displayed rows.

Search keeps a stable panel and prior results while queries settle. Friends search requires a name rather than listing every account. Public guide screenshots use a content hash in their filename; refresh the hash when replacing an image so cached URLs cannot serve stale controls. The onboarding guide opens only by player choice, stays nonmodal, follows real actions, and skips controls absent from the current data. Domain-backed progress is derived; only reading tours, skips, and welcome state are stored.

Administration uses shared account controls, server-side filtering/pagination, and confirmations for destructive actions. Session tokens never reach the browser. Battle access still uses the ordinary audience check; administrator status is not permission to view private battles. Account cleanup reuses the player's flow and protects administrators from deletion.

[Combat simulation](combat-simulation.md#interface-and-context) owns the shared matchup UI, pinned outcome, loadout odds, and pending states.

Friend invite QR codes encode the existing one-time link and use the same expiry/revocation boundary. Keep the readable link available if image generation fails. Battle cards and Home activity show scores once, without an additional result sentence. Dates spell out the month.

## Link previews

`src/client/linkPreview.ts` owns page tags and canonical URLs; `src/server/previewImage.tsx` owns bounded PNG rendering. Use absolute URLs from the request's public origin. Tags consume the loader's signed-out view; image handlers always ignore the session. An inaccessible image returns `404` with `no-store`.

- Battles expose only the spectator view; unavailable battles use generic metadata.
- Public rosters are indexable at their parameter-free URL. Unlisted rosters preview for link holders but carry `noindex`; frozen snapshots also carry `noindex`. Private rosters remain unavailable.
- Profiles expose only visible records; hidden games cannot enter metadata.
- Reference previews use source-backed names and unconditional prices.

Keep rendering bounded, cache only public results, and preserve glyph coverage limitations. The image renderer's static fonts and WebAssembly bundling are deliberate; verify compatibility before changing its pinned dependencies. [Agent reference](agent-reference.md#crawlers) owns crawler discovery and initial-HTML verification.

## Saved application data

Keep saved lookup in the normal interface. Show the concise saved-change count, offline state, or review state through `SyncStatus`, with details, retry, export, and explicit discard controls. Saved applications restore successful screen data before routing. Hosted pages preserve server-rendered data through hydration, then restore saved queries after the initial screen settles; do not overwrite the saved snapshot before restoration. Refresh in the background without resetting navigation, scroll, or expanded content. Failed refreshes retain the last successful response. Mutable roster bootstraps refresh cached data in the background; seed sibling queries from both saved and refreshed bootstraps with their timestamps and never replace newer responses. Persist refreshed query data before a roster save or battle command finishes, so an immediate reload retains the edit; storage failure must not retry a completed server mutation. Cross-tab account notices refresh the authoritative session; its account reconciliation clears private data only when the identity changes. Do not cancel queries or set a temporary signed-out identity for the notice itself, which can interrupt navigation and rebroadcast account changes between tabs. Background refreshes reuse active refetches and leave inactive multi-page battle history for its screen to refresh, preserving loaded pagination.

[`src/client/offline`](../../src/client/offline) owns reference downloads, account snapshots, and refreshes. Restore saved account queries after the initial route resolves, paints, and yields idle time. Defer complete reference and application bundle downloads for another ten seconds, then yield idle time; defer work again if navigation starts before dispatch. Download the complete public reference as one compressed, content-versioned asset. Reuse saved reference queries and search when only application assets change. Manifest checks bypass caches; hashed assets can use the HTTP cache. Publish only complete saved applications, retaining the previous version on failure. [`src/contracts/appSnapshot.ts`](../../src/contracts/appSnapshot.ts) owns saved-query eligibility and limits. Exclude authentication secrets, administration, and impersonated accounts; clear screen snapshots on sign-out or account changes, including other browser tabs. Unsynced work stays partitioned by owner; sign-out directs the player to sync, export, or explicitly discard it. A failed disk cleanup must be reported to telemetry without interrupting server sign-out, memory cleanup, or navigation. Saved responses do not authenticate requests. Durable local work projects roster edits and command logs through the shared domain authority; the server revalidates on sync.

Production browser navigations fetch the current application with a five-second timeout, falling back to the saved application when the service is unreachable. Cache Storage holds public bundles and `idb-keyval` holds IndexedDB snapshots. Its atomic `update` keeps account-generation checks and writes in one transaction, preventing a stale tab from restoring signed-out data. Development websites do not install the service worker. [Mobile](mobile.md#saved-application-data) owns native storage and launch behavior. Authentication, administration, and API documents retain their hosted path.

Durable work is bounded to 50 MB and 2,000 queued actions per account. Refuse an edit before projecting it when storage cannot accept it. Coalesce only consecutive roster saves never sent to the server; retries retain the original operation ID and content. Battle commands retain their selected random cards and recorded timestamps. Concurrent roster versions or battle histories require review; never silently rebase or discard them. Invitations, league admissions, sealing, and reveals remain pending until server acceptance. Sealing captures the chosen roster and refuses a changed authoritative copy. Generic queued-action receipts have a 90-day retention window; expired actions require review. Discarding a prerequisite retains dependent actions for review.

Run `just e2e offline-work.spec.ts offline.spec.ts app-cache.spec.ts` after changes to this flow. The journeys must cover cold offline Home, roster/battle feeds and details, unvisited public references, search, automatic reconnect updates without a reload, connected edits followed by client navigation and another save, same-origin telemetry script loading from a saved page, sign-out cleanup across tabs, and sign-out when snapshot storage fails. Tests of cold loading must start in a browser context without saved IndexedDB or service workers. Read server-rendered HTML through the request context; a controlled navigation returns the saved application instead.

## Verification

Inspect affected surfaces at desktop and phone widths before the relevant browser flow. Test the same components before and after hydration, on hard requests and client navigation, and with delayed requests. Check horizontal overflow, final-control scroll space, keyboard/touch access, and loading geometry. Browser journeys must wait for page initialization before filling hosted authentication forms; server-rendered fields can appear before React owns their values.

For rosters, inspect both the unopened list and opened unit. For battles, check live and finished scorecards, army accordion scroll/collapse, spectator/replay access, and several replay frames. Use the shared E2E phase helper to avoid reminder races. Exercise scoring, draw, and discard through minimize, Undo, and return; test the domain guard separately from the local UI lock.

Use `data-unit`, `data-roster`, and `data-person` to scope browser assertions. After changing a shared control, check every consumer and its existing interaction assertions.
