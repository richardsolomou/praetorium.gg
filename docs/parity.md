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

The pages worth looking at, and what each one is:

| Page                 | What it shows                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/rosters`           | The roster list, and the entry point to the builder: `Create editable roster`, `Paste GW app roster`, `Paste other app roster`, a battle-size filter |
| `/rosters/<id>/edit` | The builder. Three columns: picker, roster, loadout                                                                                                  |
| `/battles`           | Battle list, tabbed `PUBLIC` / `MINE` / `FRIENDS`                                                                                                    |
| `/battles/<id>`      | A finished battle, three columns                                                                                                                     |
| `/factions`          | Books, with a favourites section                                                                                                                     |

Their nav also carries Rankings, Events, Leagues and Locations, none of which Muster has anything to say about. Do not build pages for them because the nav has them.

The **phone app is a different codebase** with a dark theme, a bottom tab bar and a guided tracker. Its App Store listing is a read-only source for screenshots of it: `apps.apple.com/us/app/battlebase/id1609745397`, with the images on `is1-ssl.mzstatic.com` — pull the `PurpleSource` `srcset` entries and append `/900x0w.png`.

Reference captures taken during this work lived in a session scratchpad and are gone. They are deliberately **not** committed: they are their interface, and several contain a real person's private rosters and battle history. Re-capture what you need.

## What we learned about the catalogue data

The expensive part of this work was not the code. Four things are not where you would expect them.

**Which units a character may join is a sentence, not a structure.** No link, category or constraint says a Plasmancer may join Immortals. An ability's description does, in one of two formats:

```text
This model can be attached to the following units:
■ IMMORTALS
■ LYCHGUARD
```

```text
This model can be attached to the following units: ^^**Immortals, Lychguard, Necron Warriors**^^
```

It sits on the entry's own `profiles`, or in an `infoGroups` entry, or behind an `infoLinks` reference to a shared one — `src/core/attach.ts` handles all three. **A Leader's ability is titled `Leader`; a supporting character's is titled after the model**, and that is the only thing distinguishing the two. Across every book, 204 of 432 characters carry such a sentence. Necrons resolves all 18 of its own, and matches BattleBase's own labels exactly (Overlord leads, Plasmancer supports).

About 297 target names across all books name a unit from another catalogue — a chapter book naming a Codex unit. Do not try to resolve names to entry ids: match the names against **the units in the roster**, which is the only question the interface ever asks.

**A datasheet's roster cap is on its category, not on the datasheet.** Every unit carries a category named after itself, and the `max` sits there, force-scoped, with a `set` modifier lowering it for smaller games:

```text
category "Immortals"  -> max=6 @force/selections
category "Lychguard"  -> max=3 @force
category "Trazyn the Infinite" -> max=1 @force
```

Some entries also carry one of their own; the stricter wins. A **negative value means no cap**. Reading only the entry's constraints answers "no limit stated" for every battleline squad in the game; reading categories too, 290 of 303 rows across eight books carry the right number.

**`collective` changes what a count means**, and it was declared in the types and read nowhere. This is the real shape of a squad:

```text
Immortals [unit]
  5-10 Immortals [group]        min=5 max=10 @parent/selections
    Immortal [model]            max=10 @parent
      Close combat weapon [upgrade, collective]  min=1 max=1 @parent
      Weapons [group]                            min=1 max=1 @parent
        Gauss blaster [upgrade, collective]       max=1 @parent
        Tesla carbine  [upgrade, collective]      max=1 @parent
```

The `max=1` is **per model**, so ten models may hold ten, and a collective count is a total for the whole unit rather than one model's share. That is what makes "eight blasters and two carbines" expressible. It also means a group of them is always full, which is why `refit` exists.

**A model entry can itself be collective**, which is what caught out the first version of `refit`: `Prosecutor [model, collective]` inside a `3-9 Prosecutors` group. Refitting models overrules the squad size that was asked for, so `refit` touches only `upgrade` entries.

Two features the evaluator still does not act on, both reported by `pnpm catalogue:points`: a `measured field associations`, and `scope primary-catalogue` where there is no catalogue to compare against.

## What we learned about their interface

Values worth not re-deriving. Ours are dark equivalents, in `src/styles.css`.

| Theirs                  | Value                                                               |
| ----------------------- | ------------------------------------------------------------------- |
| Accent (links, buttons) | `#2196f3`                                                           |
| Player sides            | `#ff0000` and `#4444ff`                                             |
| Achieved                | `#00aa00`                                                           |
| Discarded / warning     | `#ffa400`                                                           |
| Surfaces                | `#ffffff` cards on `#eeeeee` panels                                 |
| Borders                 | `#bbbbbb`, `#cccccc`                                                |
| Radii                   | 3px buttons, 4px cards                                              |
| Typeface                | ITC Conduit W02, Medium and Bold, self-hosted from `/static/media/` |

Their **loadout pane** — the third column, which is richer than ours: unit name, points chip, a red `DELETE`, a settings gear; links to `View datasheet`, `Mathhammer`, `Buy on Amazon`; a supporter-only unit notes box; a `− n +` stepper for the **model count**; then `WARGEAR OPTIONS`, each weapon with its full stat line and its own `− n +`, and the datasheet's own sentence about what may be swapped for what.

Their **unit card kebab**: `Duplicate unit`, `Add to favourites`, `Mathhammer with this unit` (supporter), `Delete`. No model count in there.

Their **picker**: a search field, then `POINTS FIT` / `UNIT LIMIT` / `OWNED` chips, then a note — "Epic Heroes and units with toughness 10 or higher are hidden" — which is the mission pack's restrictions, not the book's. Rows read `NAME`, `n/m in roster`, a points chip, and `ADD`.

Their **phone tracker**, for whenever the tracker gets attention: a scrolling content area over a fixed bottom bar that carries both players' VP and CP, their names in side colours with faction beneath, a five-segment round bar each, `BATTLE ROUND n` in the centre, and `INFO` / `EVENTS` tabs. Below that, `NOW` and the current step — "SCORING SELECTED SECRET MISSIONS" — with the scorable cards and explicit `SCORE 0` / `SCORE 20` buttons, then `UNDO`, a primary action that states why it is disabled ("PLEASE ENTER MISSION SCORES"), and a camera. The whole thing is a guided step machine, which is a real difference from Muster's phase model and a decision to make rather than copy.

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

## What we learned about our own side

- **Pricing a page of picker rows costs 14ms** for 60 rows through `buildUnit` plus `evaluate`. Pricing a whole book would not be cheap, which is why only the page that is shown gets priced.
- **`hiddenByRules` is the pattern for asking the evaluator a question about a candidate** that is not in a roster yet: it builds a synthetic root, places the rest of the list, then puts the candidate beside it. `rosterLimit` is written the same way. Copy that shape rather than inventing another.
- **`unitsIn` returns at most 60 rows**, so the filters narrow what is shown rather than the whole book. A datasheet outside the first 60 for a query is not filtered out, it was never fetched.
- **The catalogue is ~90MB of heap held in the process** and loaded on first use. `catalogue-data/` is gitignored; run `pnpm catalogue:sync` before anything that needs real data, including the e2e suite.
- Every price cross-checked against BattleBase agreed exactly — Immortals 70, Overlord 90, Chronomancer 70, Catacomb Command Barge 120, Lokhust Lord 70, Skorpekh Lord 90, Lychguard 80. If a number disagrees with theirs, suspect ours.

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
