# Interface

Praetorium uses a compact, dark interface. [Product design](../product-design.md) owns product scope; [Architecture](architecture.md) owns code placement. Domain behavior belongs to [Catalogue data](catalogue-data.md), [Battles](battles.md), [Leagues](leagues.md), and [Combat simulation](combat-simulation.md).

## Voice and copy

Write for a player building an army or playing Warhammer 40,000. Name the game task, outcome, and next action. Keep implementation terms in technical documentation. Deletion warnings name what will be lost. Marketing leads with player benefits; retain licensing, attribution, and operational detail where readers need them. Avoid unsupported competitor comparisons.

## Application navigation

`src/client/features/shell` owns the shared web and native navigation. Phones use a Home/search/account utility bar and bottom application tabs; immersive roster screens omit the utility bar. Native wide layouts use a rail, while the website uses its desktop header. Read `src/styles.css` for the breakpoints and safe-area dimensions rather than duplicating them in components.

`nativeTabs.ts` preserves each section's URL, route state, and scroll position for the browser session. Tapping the current section returns to its top. Home selects no tab. More holds secondary destinations without repeating the dedicated tabs.

Compact roster panes use browser history and stop above the application tabs. Closing a datasheet returns to the picker or roster that opened it. Required battle prompts leave application navigation reachable. At intermediate website widths, compact panes remain modal dialogs. [Mobile](mobile.md#shell-boundaries) owns native Back behavior.

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

The builder has one picker and one loadout instance, moved by `src/client/features/rosters/builder/Pane.tsx` between desktop columns and compact panes. Reserve the desktop workspace before hydration. Edit squad size on the roster card, not in a second control.

Loadouts group equipment by model and weapon choice. Keep required/default equipment readable after replacement, paired weapons under one counter, and alternate profiles under their weapon. Selection styling must not shift content. Display each option and equipped item once. `loadoutModel.ts`, `LoadoutControls.tsx`, `ModelCard.tsx`, and `Loadout.tsx` own this flow.

Use the same roster cards for libraries, choosers, editable lists, read-only lists, and frozen battle/league snapshots. A pending price is a loading state, not an empty roster. Frozen snapshots retain their recorded cards and totals without today's legality or data-update warnings. Owners' View mode may retain the picker; other readers receive no mutation controls.

Library variants remain grouped with their base and show concise differences from the saved base. Filters and tabs that represent destinations live in the URL. Variant navigation stays disabled while edits are unsaved. The library's legality and changed-list counts use the domain decisions in [Catalogue data](catalogue-data.md#data-updates).

A visitor draft uses the same builder. The session cookie hints its layout for SSR without storing the list. Storage failure keeps the open builder usable and warns about reload loss. Claiming the draft after sign-in follows the saved flow.

## Battles and leagues

Render battle controls by side, not seat. Allies share a panel and resources. Keep one scoreboard and one phase-control instance across layouts. Missions and stratagems remain visible together, stacking when the panel is narrow.

Required prompts open one at a time. Minimize preserves local answers and exposes a persistent return control; battle-changing controls remain in place but disabled until parked dialogs are resumed or closed. Undo must preserve answers when the same battle moment returns, without leaking them into another hand or prompt. Personal reminders precede shared prompts without becoming shared commands.

The army window uses independently expandable loadouts in its scroll flow, with pinned unit cards and return-to-card collapse behavior. Players, spectators, and replay use the same frozen loadout view; only seated players receive casualty controls. Army and simulator dialogs fill the compact screen above the application tabs. Replay preserves the report's reading position while scrubbing.

League entrants and organizers share one event page. Its next-action card and progress use the same state decision. Organizer controls sit beside the entries or settings they affect; reveal uses the domain checklist. Sealing requires choosing a list and confirming it by name. Touch controls meet a 44-pixel target. [Leagues](leagues.md) owns access, sealing, and reveal rules.

## Other surfaces

Home prioritizes the player's active game and actionable items, with public activity for visitors. Empty states explain how to start. `Home` owns fetching and `HomeView` renders props; reserve shelf geometry in SSR and bound roster assessment to displayed rows.

Search keeps a stable panel and prior results while queries settle. Friends search requires a name rather than listing every account. The onboarding guide opens only by player choice, stays nonmodal, follows real actions, and skips controls absent from the current data. Domain-backed progress is derived; only reading tours, skips, and welcome state are stored.

Administration uses shared account controls, server-side filtering/pagination, and confirmations for destructive actions. Session tokens never reach the browser. Battle access still uses the ordinary audience check; administrator status is not permission to view private battles. Account cleanup reuses the player's flow and protects administrators from deletion.

[Combat simulation](combat-simulation.md#interface-and-context) owns the shared matchup UI, pinned outcome, loadout odds, and pending states.

## Link previews

`src/client/linkPreview.ts` owns page tags and canonical URLs; `src/server/previewImage.tsx` owns bounded PNG rendering. Use absolute URLs from the request's public origin. Tags consume the loader's signed-out view; image handlers always ignore the session. An inaccessible image returns `404` with `no-store`.

- Battles expose only the spectator view; unavailable battles use generic metadata.
- Public rosters are indexable at their parameter-free URL. Unlisted rosters preview for link holders but carry `noindex`; frozen snapshots also carry `noindex`. Private rosters remain unavailable.
- Profiles expose only visible records; hidden games cannot enter metadata.
- Reference previews use source-backed names and unconditional prices.

Keep rendering bounded, cache only public results, and preserve glyph coverage limitations. The image renderer's static fonts and WebAssembly bundling are deliberate; verify compatibility before changing its pinned dependencies. [Agent reference](agent-reference.md#crawlers) owns crawler discovery and initial-HTML verification.

## Saved application data

Keep saved lookup in the normal interface, without offline banners or download/update controls. Restore successful screen data before routing; refresh in the background without resetting navigation, scroll, or expanded content. Failed refreshes retain the last successful response.

[`src/client/offline`](../../src/client/offline) owns reference downloads, account snapshots, and refreshes. [`src/contracts/appSnapshot.ts`](../../src/contracts/appSnapshot.ts) owns saved-query eligibility and limits. Exclude authentication secrets, administration, and impersonated accounts; clear private data on sign-out or account changes, including other browser tabs. Saved responses are display data, not authentication or another authority for roster edits and battle commands.

Production browsers use Cache Storage and IndexedDB; development websites do not install the service worker. [Mobile](mobile.md#saved-application-data) owns native storage and launch behavior. Authentication and API documents retain their hosted path.

Run `just e2e offline.spec.ts app-cache.spec.ts` after changes to this flow. The journeys must cover cold offline Home, roster/battle feeds and details, unvisited public references, search, automatic reconnect updates without a reload, connected edits, and sign-out cleanup across tabs.

## Verification

Inspect affected surfaces at desktop and phone widths before the relevant browser flow. Test the same components before and after hydration, on hard requests and client navigation, and with delayed requests. Check horizontal overflow, final-control scroll space, keyboard/touch access, and loading geometry.

For rosters, inspect both the unopened list and opened unit. For battles, check live and finished scorecards, army accordion scroll/collapse, spectator/replay access, and several replay frames. Use the shared E2E phase helper to avoid reminder races. Exercise scoring, draw, and discard through minimize, Undo, and return; test the domain guard separately from the local UI lock.

Use `data-unit`, `data-roster`, and `data-person` to scope browser assertions. After changing a shared control, check every consumer and its existing interaction assertions.
