# BattleBase parity

Where this is up to, and what is left. Read [CLAUDE.md](../CLAUDE.md) first — the load-bearing rules are there, and several of them exist because of mistakes made in this work.

## What we are doing and why

We play with BattleBase at the table. The goal is that switching to Praetorium costs nobody anything they had already learned, so we are matching it deliberately — its information architecture, its density, its vocabulary — and only then changing things to differentiate.

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

Their nav also carries Rankings, Events, Leagues and Locations, none of which Praetorium has anything to say about. Do not build pages for them because the nav has them.

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

Their **phone tracker**, for whenever the tracker gets attention: a scrolling content area over a fixed bottom bar that carries both players' VP and CP, their names in side colours with faction beneath, a five-segment round bar each, `BATTLE ROUND n` in the centre, and `INFO` / `EVENTS` tabs. Below that, `NOW` and the current step — "SCORING SELECTED SECRET MISSIONS" — with the scorable cards and explicit `SCORE 0` / `SCORE 20` buttons, then `UNDO`, a primary action that states why it is disabled ("PLEASE ENTER MISSION SCORES"), and a camera. The whole thing is a guided step machine, which is a real difference from Praetorium's phase model and a decision to make rather than copy.

## What parity means here

The target is the useful union of the two products inside Praetorium's boundary:

- New Recruit's catalogue-backed roster construction, validation and interchange.
- BattleBase's dense roster presentation and at-table battle management.
- Praetorium's two-player, guest-first, conflict-safe live state remains the foundation rather than something to copy from either product.

It does not include BattleBase's rankings, events, leagues, locations, friends or public-battle discovery. It does not include a rules encyclopedia, automatic mission adjudication, model positions or damage allocation. Those are explicit product exclusions, not parity bugs.

## Current functional coverage

| Area                       | State                 | What exists                                                                                                                                                                                                                                            |
| -------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Guest and account identity | Done                  | A durable guest can open and join a battle; an optional email, Google or Discord account claims that guest and keeps its lists.                                                                                                                        |
| Live battle state          | Done                  | Two seats, transactional command submission, stale-client rejection, server-side legality, append-only undo, presence and cross-browser live updates.                                                                                                  |
| Core turn tracker          | Done                  | Five rounds, six phases, first-player order, command-point income, primary and secondary VP, named stratagem use and battle ending.                                                                                                                    |
| Catalogue acquisition      | Done                  | The instance fetches pinned BSData and 40kdc-data revisions in the background and swaps staged data atomically. No game data is committed.                                                                                                             |
| Roster construction        | Substantial           | Faction, game size, detachment, top-level datasheets, squad size, choices, split collective wargear, enhancements, attachments and points limits.                                                                                                      |
| Roster validation          | Substantial           | Constraints, modifiers, conditions, force scope, ordering, category keywords and catalogue-sensitive costs. The Munitorum ratchet is 97.4% of 1,548 checks. Unknown semantics are reported rather than guessed.                                        |
| Roster library             | Partial               | A standalone roster destination can build, import, name, save, load and delete lists. There is no copy flow, metadata view or shareable read-only roster.                                                                                              |
| Interchange                | Partial               | `.ros` and `.rosz` import and `.ros` export work. Unplaceable units are reported. Import restores units and model counts, but does not yet promise lossless import of every nested force, selection, choice or attachment another builder can express. |
| Collection                 | Partial               | Per-datasheet owned membership drives the picker filter. There are no quantities, collection browser or favourites view.                                                                                                                               |
| Mission setup              | Done for current data | Force dispositions derive the mission; deployment zones and objectives are drawn from data; fixed/tactical secondaries, primary cards and detachment/core stratagems are picked rather than typed.                                                     |
| At-table army state        | Partial               | Units start in reserve, can deploy, lose models, be destroyed and return through undo. There is no unit-level damage, position, transport or objective-control model by design.                                                                        |
| Guided scoring             | Partial               | Card payout values and known phase/round/turn triggers enable contextual scoring buttons. The app does not enforce scoring ceilings or prove that an objective was achieved.                                                                           |
| Battle review              | Partial               | A chronological report survives undo correctly. There is no battle library, per-round card grid, charting, turn duration or export.                                                                                                                    |

## Current design coverage

| Surface                | State                            | Assessment                                                                                                                                                                                                        |
| ---------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual system          | Done                             | Near-black surfaces, compact radii, tracked uppercase headings, tabular numbers, bordered points chips, red/blue ownership tints and an openly licensed condensed typeface.                                       |
| Builder desktop layout | Close                            | Three panes for picker, roster and loadout; category shelves, counts and a persistent points total follow BattleBase's information architecture.                                                                  |
| Builder mobile layout  | Close                            | One roster plus one movable picker/loadout pane avoids duplicate controls and keeps squad size on the card. It follows Praetorium's chosen responsive interpretation rather than BattleBase's separate phone app. |
| Builder detail         | Partial                          | Cards and choice controls match the density, but the loadout pane lacks datasheet stats, weapon profiles, rules, keywords and BattleBase's utility actions.                                                       |
| Application shell      | Done for the scoped destinations | Persistent navigation exposes first-class battle history, roster building and faction browsing. Social and competitive BattleBase destinations remain out of scope.                                               |
| Setup flow             | Partial                          | The order follows the game and all game facts are picked from data, but it is presented as stacked forms rather than BattleBase's compact destination-based workflow.                                             |
| Battle tracker         | Substantial                      | Desktop uses player/shared/player columns with ownership tints, shared phase controls and a five-turn primary/secondary ledger folded from the command log. Card state, charts and timing remain.                 |
| Phone tracker          | Partial                          | The shared action leads a readable single-column surface with both five-turn ledgers. A fixed bottom scoreboard, `INFO`/`EVENTS` tabs and the fuller guided step machine remain.                                  |

Deployed at `praetorium.ras.sh`, auto-deploying from `main`. See [deployment.md](deployment.md).

## What we learned about our own side

- **Pricing a page of picker rows costs 14ms** for 60 rows through `buildUnit` plus `evaluate`. Pricing a whole book would not be cheap, which is why only the page that is shown gets priced.
- **`hiddenByRules` is the pattern for asking the evaluator a question about a candidate** that is not in a roster yet: it builds a synthetic root, places the rest of the list, then puts the candidate beside it. `rosterLimit` is written the same way. Copy that shape rather than inventing another.
- **`unitsIn` returns at most 60 rows**, so the filters narrow what is shown rather than the whole book. A datasheet outside the first 60 for a query is not filtered out, it was never fetched.
- **The catalogue is ~90MB of heap held in the process** and loaded on first use. `catalogue-data/` is gitignored; run `pnpm catalogue:sync` before anything that needs real data, including the e2e suite.
- Every price cross-checked against BattleBase agreed exactly — Immortals 70, Overlord 90, Chronomancer 70, Catacomb Command Barge 120, Lokhust Lord 70, Skorpekh Lord 90, Lychguard 80. If a number disagrees with theirs, suspect ours.

## Work remaining

This is the implementation order that closes the largest user-visible gaps without weakening the evaluator or battle log.

### 1. Deepen the first-class destinations

The responsive application shell now has **Battles**, **Rosters** and **Factions** routes. Rosters can be built, imported, saved, loaded and deleted without starting a battle; battle history shows setup, active and finished battles; factions and their datasheets can be browsed independently. Keep social and competitive BattleBase destinations out of scope.

Finish this slice with roster copy/rename actions, richer saved-roster metadata, a read-only datasheet route and direct links from faction results. Battle summaries should add army names and last activity without storing derived battle state.

### 2. Rebuild the battle tracker in BattleBase's information architecture

Desktop now uses three columns: player one, shared battle information, player two. Each side has `T1`–`T5` primary/secondary scoring, while the centre owns the mission, current turn/phase, chronological events, undo and end-battle actions. Complete it with achieved/discarded card state, explicit CP gained/used/remaining, stratagem usage counts, army status and deployment detail.

Charts and timing come after the ledger is correct. A VP chart and CP chart require report-derived series; minutes per turn requires timestamps to be grouped by turn without storing a second clock state. None of these should bypass `battleView` or put state in the event stream.

On phones, make an explicit choice rather than shrinking the desktop grid. Matching BattleBase's phone tracker means a fixed bottom scoreboard, round segments, `INFO`/`EVENTS`, a `NOW <step>` section, contextual scoring actions, undo and one primary advance action that explains why it is disabled. Praetorium already has enough phase and award-trigger data for a first version, but not BattleBase's full guided step machine.

### 3. Complete roster editing and datasheet presentation

- Add a unit menu with duplicate, favourite/owned and delete. Duplicate must preserve model count, choices, spreads and attachment behavior.
- Put enhancements and a warlord marker on the unit card, while keeping one accessible control for each value.
- Add datasheet detail: model stats, ranged and melee weapon profiles, abilities and keywords. Decide the legal/product policy for displaying full rules text before implementing it; the catalogue index carrying text does not by itself settle that decision.
- Show the datasheet's replacement sentence beside wargear controls so the counts have context.
- Model mission-pack picker restrictions only from fetched data. Do not hard-code BattleBase's current “Epic Heroes and toughness 10” sentence.
- Add the missing saved-attachment round-trip test.

### 4. Raise New Recruit-style roster fidelity

- Make import lossless for supported constructs: detachments/forces, nested selections, wargear choices, split counts, enhancements and attachments. Add corpus tests using exports produced by New Recruit and BattleScribe, with game data supplied at test time rather than committed.
- Support multiple forces and allied catalogues where the roster format and 40K rules allow them. The current builder assumes one primary catalogue and one force.
- Surface evaluator `unhandled` output in the builder as a clear “cannot validate this rule” state, distinct from an illegal list.
- Close or explicitly census the remaining evaluator gaps (`measured field associations` and primary-catalogue scope without comparison context) and keep the Munitorum percentage plus mismatch set as a ratchet.
- Expand legality fixtures beyond points: legal and illegal real rosters, roster caps, enhancements, attachments, collective choices and cross-catalogue rules.
- Add printable and shareable read-only roster views before considering collaborative editing or revision history.

### 5. Finish battle setup and tactical card lifecycle

The current tactical mode chooses a static set. Full behavior needs draw, reveal, discard, replace and secret-mission lifecycle commands, with visibility withheld only in `battleView`. Per-round score attribution should name the card and preserve achieved/discarded state in the append-only report. Deployment should distinguish deployed units from reserves cleanly during setup and retain the same ownership rules in play.

Mission scoring remains player-confirmed. Automating objective control or interpreting rules text is outside the boundary.

### 6. Product hardening and parity verification

- Add browser coverage for standalone roster CRUD, imported choice fidelity, saved attachments, battle history, tactical card lifecycle and the rebuilt desktop/mobile tracker.
- Keep the two-browser live test for every new opponent-visible command and test visibility with two different players, not one page.
- Add visual snapshots at desktop and phone widths only after the layouts settle; compare fresh captures of the live BattleBase surface rather than old screenshots or memory.
- Audit keyboard order, labels, focus restoration for moving panes, colour contrast and reduced motion.
- Measure whole-book search/filter latency, list pricing under large rosters and long battle-log folding before adding caches or derived columns.

## Definition of parity

The scoped parity milestone is reached when a player can arrive at the home page, find or create a roster without opening a battle, import a representative New Recruit roster without losing supported choices, build and validate the same roster manually, start or resume a battle, and complete all five rounds from either phone while both devices show the same BattleBase-shaped ledger. A finished battle must remain browsable with its per-round scoring, cards, CP, stratagems, unit outcomes and event history derived from the log.

It is not reached by matching colours or adding nav labels while those workflows remain hidden, lossy or split across incompatible state models.

## Traps

Every one of these cost time already.

- **Text is uppercased in CSS**, so the DOM holds `Overlord` while the page shows `OVERLORD`. Find a unit card by `data-unit`, never by visible text.
- **A pane is one instance that CSS moves** (`builder/Pane.tsx`). Rendering a sidebar and a sheet with the same contents put two of every control in the page, both real to a screen reader.
- **The points ratchet is enforced in CI** at 97.0%, currently 97.4% of 1,548. Run `pnpm catalogue:points` after anything touching `defaultSelection`, `buildUnit`, `refit` or the evaluator, and read the mismatch list rather than the percentage alone — the headline held at 97.4% through a change that made four units worse and four better.
- **The evaluator's errors are not in the ratchet.** A change can keep points identical and make every squad in the game report a spurious violation, which is exactly what implementing collective counts did before `violations` learned to scale a per-model limit. Build a real squad and read its errors.
- **`spreads` must reach the server.** They travel on the pick beside `models` and `choices`, through pricing, saving and export; three call sites omitted them and the interface silently did nothing.
- Four units — Terminator Assault Squad, Venatari Custodians — are now further from the Munitorum than they were, because the data prices a weapon they carry per model and the squad now carries one each. They were already mismatching. Do not read them as new breakage.
