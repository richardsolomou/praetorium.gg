# Interface

[DESIGN.md](../../DESIGN.md) owns visual tokens and colour meaning.

## Voice and copy

- Copy names the player's task and outcome, never implementation terms. Player docs describe how Praetorium works and where its checks stop, not play advice.
- Marketing keeps licensing and attribution and makes no unsupported competitor comparisons.

## Layout

- The desktop header adapts through rem container queries, because media queries ignore page text size; read its height from `--app-header`. Check header changes at text sizes up to 200%.
- At most five tabs; the rest go in More.
- Filters, tabs, sort, and search live in the URL; search replaces history rather than pushing per keystroke.

## Components

- Use `PageHeader`/`PageContent` from `Page.tsx` and the `src/styles.css` utilities.
- Style generated `src/components/ui` through `data-slot` selectors and wrappers.
- Size dialogs with `Dialog.tsx` sizes, never width or height classes; use `ConfirmDialog` for consequential actions.
- Keep labels inside elements, never bare text nodes, which browser translation replaces.
- Never leave a query pending in the SSR cache; it holds the streamed document and hydration open.
- Scroll-restoration tests use real input such as a wheel gesture; `window.scrollTo` races the restoration retries.

## Data shown to readers

- Frozen battle and sealed event snapshots show their recorded cards, totals, and version, never today's legality or warnings.
- A copy names its source only while the reader may still open it (`rosterAccess`).
- Link previews use the signed-out view and ignore the session; inaccessible images return `404` with `no-store`. Battles expose only the spectator view.

## Saved application data

`src/client/offline` owns downloads; `src/contracts/appSnapshot.ts` owns which queries may be saved.

- Saved responses never authenticate requests, and session tokens never reach the browser.
- Clear saved screens on sign-out or account change in every tab. Cross-tab account notices refresh the session; never set a temporary signed-out identity, which loops between tabs.
- Restore cached references only into missing queries, never over a newer response.
- Unsynced work is partitioned by owner; sign-out asks to sync, export, or discard it.

Regenerate docs screenshots with `DOCS_SCREENSHOTS=1` and `e2e/docs-screenshots.*.spec.ts` after changing the screens a doc shows.
