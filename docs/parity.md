# BattleBase parity

Where this is up to, and what is left. Read [CLAUDE.md](../CLAUDE.md) first — the load-bearing rules are there, and several of them exist because of mistakes made in this work.

## What we are doing and why

We play with BattleBase at the table. The goal is that switching to Muster costs nobody anything they had already learned, so we are matching it deliberately — its information architecture, its density, its vocabulary — and only then changing things to differentiate.

One decision worth not re-litigating: **BattleBase's web app is the layout we follow, on dark surfaces.** There are two BattleBases and they look nothing alike — the web app is light, dense, three-column; the phone app is dark, single-column, with a guided "NOW &lt;step&gt;" tracker and a persistent bottom scoreboard. Richard picked the web app's layout with the phone app's dark palette. Do not swap one for the other without asking.

Superficial things — exact typeface, pixel-matching — are explicitly not the point. Anything that makes the switch easier is.

## Looking at BattleBase

Their site is a React Native Web app: every element is an unlabelled `div`, text is uppercased in CSS, and semantic selectors mostly do not exist. Screenshots are worth more than DOM spelunking.

To drive it, launch a throwaway-profile Chrome with remote debugging and attach Playwright over CDP:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir=/tmp/bb-profile \
  --no-first-run --no-default-browser-check https://www.battlebase.app/ &
```

Then `chromium.connectOverCDP('http://127.0.0.1:9222')`. Remember `browser.close()` or the script never exits.

**It hands a fresh visitor an `AUTH_TOKEN` and drops you into a real account** (`tronictronic`) with real rosters and battles. Treat it as strictly read-only: navigate and screenshot, never create, edit or delete anything in there.

## Done

- **Builder rebuilt in their shape.** Three panes (book, roster, loadout) collapsing to one column on a phone with the book behind **Add units**. Category shelves with counts and collapse, bordered points chips, wargear bullet lines, a sticky tick-and-total bar. `src/client/components/builder/`.
- **Tokens and typeface.** `src/styles.css`. Their ITC Conduit is Monotype's to license, so Barlow Semi Condensed is vendored under `public/fonts` with its OFL text; `--font-sans` is the only thing to change if a licence is ever bought.
- **Picker points and shelves.** `unitsIn` prices through the same `buildUnit` the roster uses, and reads each datasheet's role from its categories.
- **Unit limits.** `rosterLimit` in `src/core/evaluate.ts`. 290 of 303 rows across eight books carry a correct cap.
- **The three filter chips** — points fit, unit limit, owned — and a `collection` table behind the last of them.
- **Leading and supporting rows**, both directions on both cards, parsed out of the ability text by `src/core/attach.ts`.
- **Squad size on the card**, not behind the loadout pane.
- **Split squads.** Per-option counts, which needed `collective` semantics implementing from scratch across expansion, wargear, capacity and violations.

Deployed at `muster.ras.sh`, auto-deploying from `main`. See [deployment.md](deployment.md).

## What is left

Roughly in the order Richard is likely to want it.

1. **The battle tracker.** This is the big one and it has not been touched — it still has the old layout with the accent colour repointed. Theirs is three columns: each player's side (red versus blue) with per-round `T1 T2 T3 T4 T5` breakdowns under every mission card, `ACHIEVED`/`DISCARDED` badges, CP used/gained/remaining, and stratagems used with counts; the centre column holds the mission, a battle events log, a victory-points chart, a command-points chart and minutes-per-turn. Reference captures are worth taking fresh.
2. **Datasheet detail.** They show the stat line (`M T SV W LD OC`), a weapons table with `A BS S AP D`, abilities as pills, and keywords. Our loadout pane shows options only. The index now carries `profiles` (added for attachment parsing), so the stats are already in reach — but note they gate rules _text_ behind picking a data source, and we should think about whether we want to display GW's wording at all.
3. **Enhancements on the card.** They badge a `WARLORD` and show enhancement rows on the unit card; ours are a select in the loadout pane.
4. **What the picker hides.** Theirs says "Epic Heroes and units with toughness 10 or higher are hidden" — it filters by the mission pack's own restrictions, which we do not model.
5. **The unit menu.** Their kebab offers Duplicate unit, favourites, and delete. Duplicate is genuinely useful; favourites overlaps with the collection we already store.
6. **A test for the saved attachment round trip.** `attachedTo` is saved by position and restored by index — correct, but only because loading assigns `key = index`. It works and is untested.

## Traps

Every one of these cost time already.

- **Text is uppercased in CSS**, so the DOM holds `Overlord` while the page shows `OVERLORD`. Find a unit card by `data-unit`, never by visible text.
- **A pane is one instance that CSS moves** (`builder/Pane.tsx`). Rendering a sidebar and a sheet with the same contents put two of every control in the page, both real to a screen reader.
- **The points ratchet is enforced in CI** at 97.0%, currently 97.4% of 1,548. Run `pnpm catalogue:points` after anything touching `defaultSelection`, `buildUnit`, `refit` or the evaluator, and read the mismatch list rather than the percentage alone — the headline held at 97.4% through a change that made four units worse and four better.
- **The evaluator's errors are not in the ratchet.** A change can keep points identical and make every squad in the game report a spurious violation, which is exactly what implementing collective counts did before `violations` learned to scale a per-model limit. Build a real squad and read its errors.
- **`spreads` must reach the server.** They travel on the pick beside `models` and `choices`, through pricing, saving and export; three call sites omitted them and the interface silently did nothing.
- Four units — Terminator Assault Squad, Venatari Custodians — are now further from the Munitorum than they were, because the data prices a weapon they carry per model and the squad now carries one each. They were already mismatching. Do not read them as new breakage.
